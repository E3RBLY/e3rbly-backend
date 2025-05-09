require("dotenv").config(); // Load environment variables from .env file
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Log environment variables for debugging (without showing sensitive values)
console.log("Environment variables loaded:");
console.log("- AUTH_MODE:", process.env.AUTH_MODE || "strict (default)");
console.log("- PORT:", process.env.PORT || "3001 (default)");
console.log("- GOOGLE_GENAI_API_KEY:", process.env.GOOGLE_GENAI_API_KEY ? "Set" : "Not set");

// Check if critical directories exist
console.log("\nChecking project structure:");
const dirs = ["./src", "./src/routes", "./src/controllers", "./src/middleware"];
dirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ Directory ${dir} exists`);
  } else {
    console.log(`❌ Directory ${dir} does NOT exist`);
  }
});

// Check if critical files exist
const files = [
  "./src/routes/authRoutes.js",
  "./src/controllers/authController.js",
  "./src/middleware/authMiddleware.js"
];
files.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ File ${file} exists`);
  } else {
    console.log(`❌ File ${file} does NOT exist`);
  }
});

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing for all origins
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Import middleware
const authenticateToken = require("./src/middleware/authMiddleware");

// --- Basic Test Route ---
// Add a direct test route to verify Express is working correctly
app.post("/test-route", (req, res) => {
  console.log("Test route hit:", req.body);
  res.json({ message: "Test route works!" });
});

// --- Import and Mount Routers ---
console.log("\nLoading routes:");

// Import routes with error handling
const authRoutes = require("./src/routes/authRoutes");
const arabicAnalysisRoutes = require("./src/routes/arabicAnalysisRoutes");
const exercisesRoutes = require("./src/routes/exercisesRoutes");
const quizRoutes = require("./src/routes/quizRoutes");
const grammarConceptsRoutes = require("./src/routes/grammarConceptsRoutes");

// Mount auth routes (not behind authentication)
app.use("/auth", authRoutes);
console.log("✅ Auth routes mounted at /auth");

// Protected API Routes
// Apply authentication middleware to all routes starting with /api
app.use("/api", authenticateToken);

// Mount protected API route handlers
app.use("/api/analysis", arabicAnalysisRoutes);
app.use("/api/exercises", exercisesRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/grammar", grammarConceptsRoutes);

// --- Print All Routes For Debugging ---
console.log("\n----- ALL REGISTERED ROUTES -----");
function printRoutes(app) {
  if (!app || !app._router) {
    console.log('No routes defined');
    return;
  }

  console.log('\nAll registered routes:');
  const routes = [];

  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly
      const path = middleware.route.path;
      const methods = Object.keys(middleware.route.methods)
        .filter(method => middleware.route.methods[method])
        .join(', ')
        .toUpperCase();
      routes.push(`${methods} ${path}`);
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const path = handler.route.path;
          const methods = Object.keys(handler.route.methods)
            .filter(method => handler.route.methods[method])
            .join(', ')
            .toUpperCase();
          routes.push(`${methods} ${path}`);
        }
      });
    }
  });

  routes.forEach(route => console.log(route));
}

printRoutes(app);
console.log("-----------------------------\n");

// --- Basic Routes (Public - No Authentication) ---
// Health check or root route
app.get("/", (req, res) => {
  const authMode = process.env.AUTH_MODE || "strict";
  res.json({
    message: "E3rbly Backend is running!",
    version: "1.0.0",
    authMode: authMode,
    apis: [
      { path: "/auth/register", method: "POST", description: "Register a new user" },
      { path: "/auth/login", method: "POST", description: "login a new user" },

      { path: "/auth/request-verification-email", method: "POST", description: "Request verification email" },
      { path: "/auth/request-password-reset", method: "POST", description: "Request password reset" },
      { path: "/api/analysis/analyze", method: "POST", description: "Analyze Arabic text (Auth Required)" },
      { path: "/api/exercises/generate", method: "POST", description: "Generate Arabic exercises (Auth Required)" },
      { path: "/api/quiz/generate", method: "POST", description: "Generate Arabic quizzes (Auth Required)" },
      { path: "/api/grammar/concepts", method: "GET", description: "Get grammar concepts (Auth Required)" },
      { path: "/test-route", method: "POST", description: "Test route (for debugging)" }
    ]
  });
});

// Test route to check if environment variables are working (Now protected)
app.get("/api/config", (req, res) => {
  res.json({
    authMode: process.env.AUTH_MODE || "strict",
    apiAvailable: !!process.env.GOOGLE_GENAI_API_KEY,
    firebaseConfigured: true // This would ideally check if Firebase is properly configured
  });
});

// --- Error Handling Middleware ---
app.use((req, res, next) => {
  console.log(`404 Not Found: ${req.method} ${req.path}`);
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
  console.log(`Visit http://localhost:3001 to check server status`);
  
  // Display test curl commands for easier debugging
  console.log("\n----- TEST COMMANDS -----");
  console.log("Test auth/register route:");
  console.log(`curl -X POST http://localhost:${PORT}/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"test@example.com","password":"password123"}'`);
  
  console.log("\nTest basic route:");
  console.log(`curl -X POST http://localhost:${PORT}/test-route \\
  -H "Content-Type: application/json" \\
  -d '{"test":"data"}'`);
  console.log("------------------------\n");
});

module.exports = app;