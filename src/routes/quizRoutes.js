const express = require("express");
const {
  generateQuiz,
  evaluateAnswer,
} = require("../controllers/quizController");

const router = express.Router();

// Auth is applied once in server.js for all of /api.

// Route for generating a quiz
// POST /api/quiz/generate
router.post("/generate", generateQuiz);

// Route for evaluating a quiz answer
// POST /api/quiz/evaluate
router.post("/evaluate", evaluateAnswer);

module.exports = router;

