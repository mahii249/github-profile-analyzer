const express = require('express');
const cors = require('cors');
require('dotenv').config();

const profileRoutes = require('./routes/profileRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Parse incoming requests with JSON payloads
app.use(express.json());

// Base Route - documentation page for assignment submission
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the GitHub Profile Analyzer API!',
    description: 'This API fetches public profile details from GitHub, runs analysis on their public repositories (calculating total stars, forks, languages, and top repository), and stores/updates insights in a MySQL database.',
    author: 'College Assignment Submission',
    endpoints: {
      analyze_profile: {
        method: 'POST',
        path: '/api/profiles',
        description: 'Analyze a GitHub profile. Fetches data from GitHub, performs calculations, and stores/updates in MySQL database.',
        body_format: { username: 'string (e.g. octocat)' }
      },
      get_all_analyzed_profiles: {
        method: 'GET',
        path: '/api/profiles',
        description: 'Retrieve a list of all analyzed profiles stored in the database.'
      },
      get_single_profile: {
        method: 'GET',
        path: '/api/profiles/:username',
        description: 'Get details of a single analyzed profile from the database. Returns 404 if not yet analyzed.'
      }
    }
  });
});

// Hook up profiles router
app.use('/api/profiles', profileRoutes);

// Catch 404 routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found. Refer to the base URL / for instructions.' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'An internal server error occurred.',
    message: err.message
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 Base API URL: http://localhost:${PORT}`);
});
