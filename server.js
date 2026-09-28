require("dotenv").config(); // Local development only; Vercel injects env vars.
const express = require("express");
const cors = require("cors");

const authenticateToken = require("./src/middleware/authMiddleware");
const arabicAnalysisRoutes = require("./src/routes/arabicAnalysisRoutes");
const exercisesRoutes = require("./src/routes/exercisesRoutes");
const quizRoutes = require("./src/routes/quizRoutes");
const grammarConceptsRoutes = require("./src/routes/grammarConceptsRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Public ---
app.get("/", (req, res) => {
  res.json({
    message: "E3rbly Backend is running!",
    version: "1.0.0",
    authMode: process.env.AUTH_MODE || "strict",
    apis: [
      { path: "/api/analysis/analyze", method: "POST", description: "Structured i'rab analysis" },
      { path: "/api/analysis/analyze/text", method: "POST", description: "I'rab as text (main app flow)" },
      { path: "/api/analysis/explain", method: "POST", description: "Explain an analysis" },
      { path: "/api/exercises/generate", method: "POST", description: "Generate exercises" },
      { path: "/api/exercises/check", method: "POST", description: "Check an exercise answer" },
      { path: "/api/quiz/generate", method: "POST", description: "Generate a quiz" },
      { path: "/api/quiz/evaluate", method: "POST", description: "Evaluate a quiz answer" },
      { path: "/api/grammar/explanation", method: "POST", description: "Explain a grammar concept" },
      { path: "/api/grammar/related", method: "POST", description: "Related grammar concepts" },
      { path: "/api/grammar/concept-types", method: "GET", description: "Grammar concept types" },
      { path: "/api/grammar/concept-values/:conceptType", method: "GET", description: "Values of a concept type" },
    ],
  });
});

// --- API (auth enforced by AUTH_MODE, applied once here) ---
app.use("/api", authenticateToken);

app.get("/api/config", (req, res) => {
  res.json({
    authMode: process.env.AUTH_MODE || "strict",
    apiAvailable: !!process.env.GOOGLE_GENAI_API_KEY,
    firebaseConfigured: authenticateToken.firebaseInitialized,
  });
});

app.use("/api/analysis", arabicAnalysisRoutes);
app.use("/api/exercises", exercisesRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/grammar", grammarConceptsRoutes);

// --- Errors ---
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", message: `Route ${req.method} ${req.path} not found` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Body-parser errors are client errors, not server crashes.
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "طلب غير صالح: صيغة JSON غير صحيحة.", code: "INVALID_JSON" });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "النص طويل جدًا.", code: "PAYLOAD_TOO_LARGE" });
  }
  console.error("Unhandled error:", err && err.stack);
  // Never send exception messages or stacks to clients (audit H3).
  res.status(500).json({ error: "حدث خطأ غير متوقع. يرجى المحاولة لاحقًا.", code: "INTERNAL_ERROR" });
});

// Local server only. On Vercel the exported app is the request handler.
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`E3rbly backend listening on http://localhost:${PORT} (AUTH_MODE=${process.env.AUTH_MODE || "strict"})`);
  });
}

module.exports = app;
