

// module.exports = router;
const express = require("express");
const {
  getGrammarExplanation,
  getRelatedConcepts,
  getConceptTypes,
  getConceptValues
} = require("../controllers/grammarConceptsController");

const { createResponseCache } = require("../middleware/responseCache");

const router = express.Router();
// Same concept -> same explanation: serve repeats from memory (no AI cost, instant).
const cache = createResponseCache();

// Auth is applied once in server.js for all of /api.

/**
 * @route POST /api/grammar/explanation
 * @desc Get explanation and examples for a grammar concept in Arabic
 * @access Private (requires authentication)
 * @body {
 *   conceptType: string,
 *   conceptName: string
 * }
 */
router.post("/explanation", cache, getGrammarExplanation);

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
router.post("/related", cache, getRelatedConcepts);

/**
 * @route GET /api/grammar/concept-types
 * @desc Get all available grammar concept types
 * @access Private (requires authentication)
 * @returns {
 *   conceptTypes: string[]
 * }
 */
router.get("/concept-types", getConceptTypes);
router.get("/concept-types/", getConceptTypes); // Explicitly handle trailing slash version
router.get("/concept-values/:conceptType", getConceptValues);

/**
 * @route GET /api/grammar/concept-values/:conceptType
 * @desc Get all allowed values for a specific concept type
 * @access Private (requires authentication)
 * @params {
 *   conceptType: string - The type of grammar concept to get values for
 * }
 * @returns {
 *   conceptType: string,
 *   values: string[]
 * }
 */
router.get("/concept-values/:conceptType", getConceptValues);

module.exports = router;