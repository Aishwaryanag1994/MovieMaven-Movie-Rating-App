# MovieMaven — Backend

MovieMaven's backend provides API endpoints for the movie-rating application.

## Technologies

- Node.js
- Express
- MongoDB with Mongoose
- Passport and Google OAuth
- JSON Web Tokens (JWT)
- bcrypt

## Getting Started

1. Install Node.js and npm.
2. Open a terminal in the `back-end` directory.
3. Install dependencies:

   `npm install`

4. Configure the required environment variables in a local `.env` file:

   - `MONGODB_URI`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `JWT_SECRET`
   - `SESSION_SECRET`

5. Start the backend:

   `npm start`

The backend listens on port `4000` by default.

**Security:** Never commit your `.env` file or publish actual credentials.

## Project Structure

- `controller/` — controller files
- `middleware/` — middleware
- `models/` — database models
- `routes/` — API routes
- `uploads/` — uploaded images and other assets
