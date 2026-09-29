const express = require('express');
const { tashkeel } = require('../controllers/tashkeelController');

const router = express.Router();
// Auth, rate limits (AI route) and input caps are applied in server.js for all of /api.
router.post('/', tashkeel);

module.exports = router;
