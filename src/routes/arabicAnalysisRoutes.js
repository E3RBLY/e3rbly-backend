const express = require("express");
const {
  analyzeArabicText,
  explainGrammarAnalysis,
  analyzeArabicTextExplanation
} = require("../controllers/arabicAnalysisController");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// Apply authentication middleware to all routes in this module
router.use(authenticateToken);

// Route for analyzing Arabic text
// POST /api/analysis/analyze
router.post("/analyze", analyzeArabicText);
router.post("/analyze/text", analyzeArabicTextExplanation); // Returns textual explanation

// Route for explaining grammar analysis
// POST /api/analysis/explain
router.post("/explain", explainGrammarAnalysis);

module.exports = router;

