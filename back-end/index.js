
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 4000;

// Validate required configuration
if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required');
}

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve static files from back-end/public
app.use(express.static(require('path').join(__dirname, 'public')));

// Import routes
const movieRouter = require('./routes/movie.router');
const movieReviewRouter = require('./routes/moviereview.router');
const notificationRouter = require('./routes/notifcation.router');
const usersRouter = require('./routes/users');

// API routes
app.use('/api/movie', movieRouter);
app.use('/api/movie_review', movieReviewRouter);
app.use('/api/notification', notificationRouter);
app.use('/users', usersRouter);

// Health check
app.get('/', (req, res) => {
  res.status(200).send('Backend Running!');
});

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('Request error:', err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    message: err.status && err.status < 500
      ? err.message
      : 'Internal server error'
  });
});

// Connect to MongoDB, then start the server
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');

    app.listen(port, () => {
      console.log(`Express app listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  });
