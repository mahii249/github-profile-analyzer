const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');

// Route to analyze a new profile (or refresh an existing one) and store insights
router.post('/', profileController.analyzeProfile);

// Route to get a list of all analyzed profiles
router.get('/', profileController.getAllProfiles);

// Route to get details of a single analyzed profile from database
router.get('/:username', profileController.getProfileByUsername);

module.exports = router;
