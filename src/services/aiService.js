// const { GoogleGenerativeAI } = require("@google/generative-ai");
// require('dotenv').config();

// // Access your API key as an environment variable
// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);

// // Function to get the generative model
// function getGenerativeModel(modelName = "gemini-2.0-flash") { // Using flash as a default, adjust if needed
//   return genAI.getGenerativeModel({ model: modelName });
// }


// // services/aiService.js
// async function generateArabicExplanation(prompt) {
//   const model = getGenerativeModel("gemini-2.0-flash");
//   try {
//     const result = await model.generateContent(prompt);
//     return result.response.text();
//   } catch (error) {
//     console.error("AI Error:", error);
//     throw new Error("تعذر إنشاء الشرح النحوي");
//   }
// }
// // Example function to generate content (can be adapted for specific tasks)
// async function generateContent(prompt) {
//   try {
//     const model = getGenerativeModel();
//     const result = await model.generateContent(prompt);
//     const response = await result.response;
//     const text = response.text();
//     return text;
//   } catch (error) {
//     console.error("Error generating content with Google GenAI:", error);
//     throw new Error("Failed to generate content using AI service.");
//   }
// }

// // // Function to generate content with specific output schema (like in the provided frontend code)
// // async function generateStructuredContent(prompt, outputSchema) {
// //     try {
// //         const model = getGenerativeModel();
// //         // Note: The Node.js SDK might not directly support Zod schemas like Genkit.
// //         // We'll need to adjust how we handle structured output.
// //         // For now, we'll generate text and expect it to be JSON, then parse.
// //         // A more robust solution might involve defining the schema in the prompt itself
// //         // or using function calling if the model supports it well for this structure.

// //         const generationConfig = {
// //             // Ensure JSON output if possible, though direct schema enforcement isn't standard here
// //             // responseMimeType: "application/json", // Use if available and needed
// //         };

// //         const result = await model.generateContent(prompt, generationConfig);
// //         const response = await result.response;
// //         const text = response.text();

// //         // Attempt to parse the text as JSON
// //         try {
// //             const parsedJson = JSON.parse(text);
// //             // TODO: Add validation against the expected outputSchema structure here if needed
// //             return parsedJson;
// //         } catch (parseError) {
// //             console.error("Failed to parse AI response as JSON:", parseError);
// //             console.error("Raw AI response text:", text);
// //             // Fallback or throw error depending on requirements
// //             // For now, returning the raw text might be useful for debugging
// //             // throw new Error("AI response was not valid JSON.");
// //             return { error: "AI response was not valid JSON", rawResponse: text };
// //         }

// //     } catch (error) {
// //         console.error("Error generating structured content with Google GenAI:", error);
// //         throw new Error("Failed to generate structured content using AI service.");
// //     }
// // }

// // services/aiService.js - Update generateStructuredContent

// async function generateStructuredContent(prompt) {
//   try {
//     const model = getGenerativeModel();
//     const result = await model.generateContent(prompt);
//     const response = await result.response;
//     const text = response.text();

//     // Handle JSON wrapped in code blocks
//     const sanitizedText = text
//     .replace(/```json/g, '')
//     .replace(/```/g, '')
//     .trim();    
//     try {
//       return JSON.parse(sanitizedText);
//     } catch (parseError) {
//       console.error("Failed to parse AI response:", parseError);
//       console.error("Sanitized response text:", sanitizedText);
//       throw new Error("AI response format invalid");
//     }
    
//   } catch (error) {
//     console.error("Error in generateStructuredContent:", error);
//     throw error;
//   }
// }

// module.exports = {
//   getGenerativeModel,
//   generateContent,
//   generateStructuredContent,
//   generateArabicExplanation,
// };


const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);

// Retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,             // Maximum number of retry attempts
  initialDelayMs: 1000,      // Start with a 1 second delay
  maxDelayMs: 10000,         // Maximum delay between retries (10 seconds)
  backoffFactor: 2,          // Exponential backoff factor
  retryableStatusCodes: [429, 500, 502, 503, 504] // Status codes that trigger retry
};

// Function to get the generative model
function getGenerativeModel(modelName = "gemini-2.0-flash") { // Using flash as a default, adjust if needed
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Sleep function for the delay between retries
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * @param {number} retryAttempt - Current retry attempt number (0-based)
 * @param {Object} config - Retry configuration
 * @returns {number} - Delay in milliseconds
 */
function calculateBackoffDelay(retryAttempt, config) {
  const delay = Math.min(
    config.maxDelayMs,
    config.initialDelayMs * Math.pow(config.backoffFactor, retryAttempt)
  );
  // Add some randomness to prevent multiple requests retrying simultaneously
  return delay * (0.8 + Math.random() * 0.4);
}

/**
 * Should retry based on error
 * @param {Error} error - The error from the API call
 * @param {Object} config - Retry configuration
 * @returns {boolean} - Whether to retry
 */
function shouldRetry(error, config) {
  // Check if it's a status code error we should retry
  if (error.status && config.retryableStatusCodes.includes(error.status)) {
    return true;
  }
  
  // Check error message for service overload indicators
  const errorMessage = error.message?.toLowerCase() || '';
  return errorMessage.includes('overloaded') || 
         errorMessage.includes('rate limit') || 
         errorMessage.includes('try again later') ||
         errorMessage.includes('timeout');
}

/**
 * Execute a function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {Object} config - Retry configuration
 * @returns {Promise} - Promise resolving to the function result
 */
async function withRetry(fn, config = DEFAULT_RETRY_CONFIG) {
  let lastError;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // First attempt or retry
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Log the error
      console.warn(`AI request failed (attempt ${attempt + 1}/${config.maxRetries + 1}): ${error.message}`);
      
      // Check if we should retry
      if (attempt >= config.maxRetries || !shouldRetry(error, config)) {
        break;
      }
      
      // Calculate delay and wait before retrying
      const delayMs = calculateBackoffDelay(attempt, config);
      console.log(`Retrying after ${Math.round(delayMs / 1000)} seconds...`);
      await sleep(delayMs);
    }
  }
  
  // If we get here, all retries failed
  throw lastError;
}

// Function to generate Arabic grammar explanations
async function generateArabicExplanation(prompt) {
  return withRetry(async () => {
    const model = getGenerativeModel("gemini-2.0-flash");
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
}

// Function to generate general content
async function generateContent(prompt) {
  return withRetry(async () => {
    const model = getGenerativeModel();
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  });
}

// Function to generate structured JSON content
async function generateStructuredContent(prompt) {
  return withRetry(async () => {
    const model = getGenerativeModel();
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Handle JSON wrapped in code blocks
    const sanitizedText = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
      
    try {
      return JSON.parse(sanitizedText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Sanitized response text:", sanitizedText);
      throw new Error("AI response format invalid");
    }
  });
}

module.exports = {
  getGenerativeModel,
  generateContent,
  generateStructuredContent,
  generateArabicExplanation,
  // Expose retry utility for other potential uses
  withRetry
};