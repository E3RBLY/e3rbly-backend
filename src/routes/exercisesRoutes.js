const express = require("express");
const {
  generateGrammarExercises,
  checkExerciseAnswer,
} = require("../controllers/exercisesController");

const router = express.Router();

// Auth is applied once in server.js for all of /api.

// Route for generating grammar exercises
// POST /api/exercises/generate
router.post("/generate", generateGrammarExercises);

// Route for checking exercise answers
// POST /api/exercises/check
router.post("/check", checkExerciseAnswer);

module.exports = router;

