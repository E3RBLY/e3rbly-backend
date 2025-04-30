const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);

// Function to get the generative model
function getGenerativeModel(modelName = "gemini-2.0-flash") { // Using flash as a default, adjust if needed
  return genAI.getGenerativeModel({ model: modelName });
}


// services/aiService.js
async function generateArabicExplanation(prompt) {
  const model = getGenerativeModel("gemini-2.0-flash");
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("AI Error:", error);
    throw new Error("تعذر إنشاء الشرح النحوي");
  }
}
// Example function to generate content (can be adapted for specific tasks)
async function generateContent(prompt) {
  try {
    const model = getGenerativeModel();
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Error generating content with Google GenAI:", error);
    throw new Error("Failed to generate content using AI service.");
  }
}

// // Function to generate content with specific output schema (like in the provided frontend code)

async function generateStructuredContent(prompt) {
  try {
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
    
  } catch (error) {
    console.error("Error in generateStructuredContent:", error);
    throw error;
  }
}

module.exports = {
  getGenerativeModel,
  generateContent,
  generateStructuredContent,
  generateArabicExplanation,
};

