require("dotenv").config(); // Load environment variables from .env file
const express = require("express");
const cors = require("cors");
const path = require("path");

// Log environment variables for debugging (without showing sensitive values)
console.log("Environment variables loaded:");
console.log("- AUTH_MODE:", process.env.AUTH_MODE || "strict (default)");
console.log("- PORT:", process.env.PORT || "3001 (default)");
console.log("- GOOGLE_GENAI_API_KEY:", process.env.GOOGLE_GENAI_API_KEY ? "Set" : "Not set");

// Import route handlers
const arabicAnalysisRoutes = require("./src/routes/arabicAnalysisRoutes");
const exercisesRoutes = require("./src/routes/exercisesRoutes");
const quizRoutes = require("./src/routes/quizRoutes");
const grammarConceptsRoutes = require("./src/routes/grammarConceptsRoutes");

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing for all origins
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// --- Mount Routers ---
// All analysis routes will be prefixed with /api/analysis
app.use("/api/analysis", arabicAnalysisRoutes);
// All exercises routes will be prefixed with /api/exercises
app.use("/api/exercises", exercisesRoutes);
// All quiz routes will be prefixed with /api/quiz
app.use("/api/quiz", quizRoutes);
app.use("/api/grammar", grammarConceptsRoutes);

// --- Basic Routes ---
// Health check or root route
app.get("/", (req, res) => {
  const authMode = process.env.AUTH_MODE || "strict";
  res.json({
    message: "E3rbly Backend is running!",
    version: "1.0.0",
    authMode: authMode,
    apis: [
      { path: "/api/analysis/analyze", method: "POST", description: "Analyze Arabic text" },
      { path: "/api/exercises/generate", method: "POST", description: "Generate Arabic exercises" },
      { path: "/api/quiz/generate", method: "POST", description: "Generate Arabic quizzes" }
    ]
  });
});

// Test route to check if environment variables are working
app.get("/api/config", (req, res) => {
  res.json({
    authMode: process.env.AUTH_MODE || "strict",
    apiAvailable: !!process.env.GOOGLE_GENAI_API_KEY,
    firebaseConfigured: true // This would ideally check if Firebase is properly configured
  });
});

// --- Error Handling Middleware ---
app.use((req, res, next) => {
  res.status(404).json({ error: "Not Found", message: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).json({ 
    error: "Something went wrong!", 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 3001;

// Listen on 0.0.0.0 to be accessible externally
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
  console.log(`Authentication mode: ${process.env.AUTH_MODE || "strict"}`);
  console.log(`Visit http://localhost:${PORT} to check server status`);
});

module.exports = app;