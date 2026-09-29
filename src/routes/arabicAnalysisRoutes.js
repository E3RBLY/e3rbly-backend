const express = require("express");
const {
  analyzeArabicText,
  explainGrammarAnalysis,
  analyzeArabicTextExplanation
} = require("../controllers/arabicAnalysisController");

const router = express.Router();

// Auth is applied once in server.js for all of /api.

// Route for analyzing Arabic text
// POST /api/analysis/analyze
router.post("/analyze", analyzeArabicText);
router.post("/analyze/text", analyzeArabicTextExplanation); // Returns textual explanation

// Route for explaining grammar analysis
// POST /api/analysis/explain
router.post("/explain", explainGrammarAnalysis);

module.exports = router;

