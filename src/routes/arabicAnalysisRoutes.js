const express = require("express");
const {
  analyzeArabicText,
  explainGrammarAnalysis,
  analyzeArabicTextExplanation
} = require("../controllers/arabicAnalysisController");

const { createResponseCache } = require("../middleware/responseCache");

const router = express.Router();
// Same input -> same analysis: serve repeats from memory (no AI cost, instant).
const cache = createResponseCache();

// Auth is applied once in server.js for all of /api.

// Route for analyzing Arabic text
// POST /api/analysis/analyze
router.post("/analyze", cache, analyzeArabicText);
router.post("/analyze/text", cache, analyzeArabicTextExplanation); // Returns textual explanation

// Route for explaining grammar analysis
// POST /api/analysis/explain
router.post("/explain", explainGrammarAnalysis);

module.exports = router;

