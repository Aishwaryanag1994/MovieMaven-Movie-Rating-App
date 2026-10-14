
const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const User = require('../models/User');
const Poll = require('../models/Poll');
const bcrypt = require('bcrypt');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// Session configuration
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}

router.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

router.use(passport.initialize());
router.use(passport.session());

// Profile picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Fetch polls
router.get('/polls', async (req, res) => {
  try {
    const polls = await Poll.find();
    res.json(polls);
  } catch (error) {
    console.error('Error fetching polls:', error.message);
    res.status(500).json({ message: 'Error fetching polls' });
  }
});

// Register a new user
router.post('/register', async (req, res) => {
  const { username, password, email, userTypeId } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({
      message: 'Username, email and password are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      message: 'Password must be at least 6 characters long'
    });
  }

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!emailIsValid) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  try {
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'Username or email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      email,
      userTypeId
    });

    await newUser.save();

    req.login(newUser, (err) => {
      if (err) {
        console.error('Login after registration failed:', err.message);
        return res.status(500).json({
          message: 'Registration succeeded, but login failed'
        });
      }

      return res.json({
        userId: newUser._id,
        username: newUser.username,
        profilePicture: newUser.profilePicture
      });
    });
  } catch (error) {
    console.error('Registration failed:', error.message);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// Passport session serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth configuration
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'http://localhost:4000/users/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      return done(new Error('Google account did not provide an email'));
    }

    let user = await User.findOne({ googleId: profile.id });

    if (!user) {
      user = await User.findOne({ email });

      if (user) {
        user.googleId = profile.id;
        await user.save();
      } else {
        user = await User.create({
          googleId: profile.id,
          username: email,
          email,
          userTypeId: 2
        });
      }
    }

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// Start Google OAuth
router.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
router.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: 'http://localhost:3000/login'
  }),
  (req, res) => {
    res.redirect('http://localhost:4000/users/auth/google/success');
  }
);

// Return authenticated Google user
router.get('/auth/google/success', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Google authentication failed' });
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    const token = jwt.sign(
      { userId: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.redirect(
      `http://localhost:3000/login?token=${encodeURIComponent(token)}`
    );
  } catch (error) {
    console.error('Google authentication completion failed:', error.message);
    res.status(500).json({ message: 'Authentication failed' });
  }
});

// Fetch user profile
router.get('/me', async (req, res) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'A valid Bearer token is required'
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    const token = authorization.slice('Bearer '.length);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId)
      .select('username profilePicture');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    console.error('Fetching user profile failed:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (!user || !password ||
        !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: 'Invalid username or password'
      });
    }

    res.json({
      userId: user._id,
      profilePicture: user.profilePicture
    });
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update user profile
router.put('/update', upload.single('profilePicture'), async (req, res) => {
  try {
    const { userId, username } = req.body;
    const updateData = {};

    if (req.file) {
      updateData.profilePicture = req.file.path.replace(/\\/g, '/');
    }

    if (username) {
      updateData.username = username;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('username profilePicture');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Profile update failed:', error.message);
    res.status(500).json({ message: 'Profile update failed' });
  }
});

// Create a poll
router.post('/create', async (req, res) => {
  const { title, options, userId } = req.body;

  if (!title || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({
      message: 'A poll needs a title and at least two options'
    });
  }

  try {
    const poll = await Poll.create({ title, options, userId });
    res.json({ message: 'Poll created!', poll });
  } catch (error) {
    console.error('Poll creation failed:', error.message);
    res.status(400).json({ message: 'Poll creation failed' });
  }
});

// Vote on a poll
router.post('/polls/:pollId/vote', async (req, res) => {
  const { pollId } = req.params;
  const { userId, optionIndex } = req.body;

  try {
    const poll = await Poll.findById(pollId);

    if (!poll) {
      return res.status(404).json({ message: 'Poll not found' });
    }

    if (!Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= poll.options.length) {
      return res.status(400).json({ message: 'Invalid option index' });
    }

    if (!userId || poll.voters.some(id => String(id) === String(userId))) {
      return res.status(400).json({
        message: 'Invalid user or vote already submitted'
      });
    }

    poll.options[optionIndex].votes += 1;
    poll.voters.push(userId);
    await poll.save();

    res.json(poll);
  } catch (error) {
    console.error('Voting failed:', error.message);
    res.status(500).json({ message: 'Voting failed' });
  }
});

// Fetch user by ID
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username profilePicture');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Fetching user failed:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
