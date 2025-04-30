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
// async function generateStructuredContent(prompt, outputSchema) {
//     try {
//         const model = getGenerativeModel();
//         // Note: The Node.js SDK might not directly support Zod schemas like Genkit.
//         // We'll need to adjust how we handle structured output.
//         // For now, we'll generate text and expect it to be JSON, then parse.
//         // A more robust solution might involve defining the schema in the prompt itself
//         // or using function calling if the model supports it well for this structure.

//         const generationConfig = {
//             // Ensure JSON output if possible, though direct schema enforcement isn't standard here
//             // responseMimeType: "application/json", // Use if available and needed
//         };

//         const result = await model.generateContent(prompt, generationConfig);
//         const response = await result.response;
//         const text = response.text();

//         // Attempt to parse the text as JSON
//         try {
//             const parsedJson = JSON.parse(text);
//             // TODO: Add validation against the expected outputSchema structure here if needed
//             return parsedJson;
//         } catch (parseError) {
//             console.error("Failed to parse AI response as JSON:", parseError);
//             console.error("Raw AI response text:", text);
//             // Fallback or throw error depending on requirements
//             // For now, returning the raw text might be useful for debugging
//             // throw new Error("AI response was not valid JSON.");
//             return { error: "AI response was not valid JSON", rawResponse: text };
//         }

//     } catch (error) {
//         console.error("Error generating structured content with Google GenAI:", error);
//         throw new Error("Failed to generate structured content using AI service.");
//     }
// }

// services/aiService.js - Update generateStructuredContent

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

