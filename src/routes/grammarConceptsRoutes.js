const express = require("express");
const {
  getGrammarExplanation,
  getRelatedConcepts
} = require("../controllers/grammarConceptsController");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// Apply authentication middleware to all routes in this module
router.use(authenticateToken);

/**
 * @route POST /api/grammar/explanation
 * @desc Get explanation and examples for a grammar concept in Arabic
 * @access Private (requires authentication)
 * @body {
 *   conceptType: string,
 *   conceptName: string
 * }
 */
router.post("/explanation", getGrammarExplanation);

/**
 * @route POST /api/grammar/related
 * @desc Get related concepts to a grammar concept in Arabic
 * @access Private (requires authentication)
 * @body {
 *   conceptType: string,
 *   conceptName: string,
 *   count: number (optional, default: 3)
 * }
 */
router.post("/related", getRelatedConcepts);

module.exports = router;