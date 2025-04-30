const express = require("express");
const {
  generateGrammarExercises,
  checkExerciseAnswer,
} = require("../controllers/exercisesController");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// Apply authentication middleware to all routes in this module
router.use(authenticateToken);

// Route for generating grammar exercises
// POST /api/exercises/generate
router.post("/generate", generateGrammarExercises);

// Route for checking exercise answers
// POST /api/exercises/check
router.post("/check", checkExerciseAnswer);

module.exports = router;

