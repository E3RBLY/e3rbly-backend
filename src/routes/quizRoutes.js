const express = require("express");
const {
  generateQuiz,
  evaluateAnswer,
} = require("../controllers/quizController");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// Apply authentication middleware to all routes in this module
router.use(authenticateToken);

// Route for generating a quiz
// POST /api/quiz/generate
router.post("/generate", generateQuiz);

// Route for evaluating a quiz answer
// POST /api/quiz/evaluate
router.post("/evaluate", evaluateAnswer);

module.exports = router;

