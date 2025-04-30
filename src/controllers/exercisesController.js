// // const aiService = require("../services/aiService");
// // const { v4: uuidv4 } = require("uuid");
// // const { isValidArabic } = require("../utils/arabicValidator");
// // const {
// //   GenerateGrammarExercisesOutputSchema,
// //   CheckExerciseAnswerOutputSchema,
// // } = require("../schemas/exerciseSchemas");

// // // Controller function for generating grammar exercises
// // const generateGrammarExercises = async (req, res) => {
// //   const { difficulty, exerciseType, count } = req.body;

// //   if (!difficulty || !exerciseType || !count) {
// //     return res
// //       .status(400)
// //       .json({ error: "Missing required fields: difficulty, exerciseType, count" });
// //   }
// //   if (count < 1 || count > 10) {
// //     return res.status(400).json({ error: "Count must be between 1 and 10" });
// //   }

// //   const prompt = `Generate ${count} Arabic grammar exercises at the ${difficulty} level of the type ${exerciseType}.

// // Create authentic exercises that focus on real Arabic grammatical concepts. The exercises should be educational and help users practice Arabic grammar analysis.

// // For each exercise, include:
// // 1. A unique identifier (use a simple format like exercise-1, exercise-2, etc. for now, I will replace it later).
// // 2. The Arabic text for the exercise ("text").
// // 3. The question or instructions for the exercise ("question").
// // 4. The type of exercise ("type": ${exerciseType}).
// // 5. Options for multiple-choice questions ("options"), if applicable.
// // 6. A hint for the exercise ("hint").
// // 7. The correct answer or solution ("correctAnswer").
// // 8. Detailed explanation of the correct answer ("explanation").

// // Return the result as a JSON object with a single key "exercises" which is an array of exercise objects, matching this structure:
// // {
// //   "exercises": [
// //     {
// //       "id": "string",
// //       "text": "string",
// //       "question": "string",
// //       "type": "${exerciseType}",
// //       "options": ["string"] | null,
// //       "hint": "string",
// //       "correctAnswer": "string",
// //       "explanation": "string"
// //     }
// //     // ... more exercises
// //   ]
// // }
// // `;

// //   try {
// //     const resultJson = await aiService.generateStructuredContent(prompt);

// //     // Assign temporary IDs before validation if needed, or validate first
// //     // Let's validate first, then add UUIDs
// //     const tempResult = { exercises: resultJson.exercises || [] }; // Handle case where AI might not return the top-level key

// //     // Add placeholder UUIDs for validation purposes, will be replaced after validation
// //     const exercisesWithTempIds = tempResult.exercises.map((ex, index) => ({
// //         ...ex,
// //         id: uuidv4(), // Assign a valid UUID format temporarily
// //         type: exerciseType, // Ensure type matches request
// //     }));

// //     const validationInput = { exercises: exercisesWithTempIds };

// //     // Validate the AI response using Zod schema
// //     const validationResult = GenerateGrammarExercisesOutputSchema.safeParse(validationInput);

// //     if (!validationResult.success) {
// //       console.error(
// //         "Zod Validation Error (generateGrammarExercises):",
// //         validationResult.error.errors
// //       );
// //       console.error("Raw AI Response:", resultJson);
// //       return res.status(500).json({
// //         error: "AI service returned exercises in an unexpected format.",
// //         details: validationResult.error.errors,
// //       });
// //     }

// //     // Use the validated data and ensure correct UUIDs are assigned
// //     const finalExercises = validationResult.data.exercises.map(ex => ({
// //         ...ex,
// //         id: uuidv4() // Re-assign a final unique ID if needed, or keep the temp one
// //     }));

// //     res.json({ exercises: finalExercises });

// //   } catch (error) {
// //     console.error("Error in generateGrammarExercises controller:", error);
// //     res
// //       .status(500)
// //       .json({ error: "Failed to generate exercises.", details: error.message });
// //   }
// // };

// // // Controller function for checking exercise answers
// // const checkExerciseAnswer = async (req, res) => {
// //   const { exerciseId, exerciseText, userAnswer, correctAnswer, exerciseType } =
// //     req.body;

// //   if (
// //     !exerciseId ||
// //     !exerciseText ||
// //     userAnswer === undefined ||
// //     !correctAnswer ||
// //     !exerciseType
// //   ) {
// //     return res.status(400).json({
// //       error:
// //         "Missing required fields: exerciseId, exerciseText, userAnswer, correctAnswer, exerciseType",
// //     });
// //   }

// //   if (!isValidArabic(userAnswer) && userAnswer !== "") {
// //     return res.status(400).json({ error: "Please enter your answer in Arabic." });
// //   }

// //   const prompt = `Evaluate the user's answer for the following Arabic grammar exercise.

// // Exercise Details:
// // - Type: ${exerciseType}
// // - Text: ${exerciseText}
// // - Correct Answer: ${correctAnswer}
// // - User's Answer: ${userAnswer}

// // Provide feedback in JSON format with the following keys:
// // - "isCorrect": boolean (true if the user's answer is essentially correct, false otherwise).
// // - "score": number (percentage score from 0 to 100, reflecting correctness).
// // - "feedback": string (Detailed feedback in Arabic explaining why the answer is correct or incorrect, pointing out specific errors if any).
// // - "correctAnswer": string (Reiterate the correct answer).
// // - "explanation": string (Explanation in Arabic of the relevant grammar rules applied in this exercise).

// // Example JSON Output:
// // {
// //   "isCorrect": true,
// //   "score": 100,
// //   "feedback": "إجابتك صحيحة! لقد قمت بتحديد الإعراب بشكل دقيق.",
// //   "correctAnswer": "فاعل مرفوع وعلامة رفعه الضمة",
// //   "explanation": "كلمة 'المعلم' في الجملة 'جاء المعلم' تأتي بعد فعل لازم وتدل على من قام بالفعل، لذا تُعرب فاعلاً مرفوعاً."
// // }

// // Evaluate the user's answer: ${userAnswer}`;

// //   try {
// //     const feedbackResultJson = await aiService.generateStructuredContent(prompt);

// //     // Validate the AI response using Zod schema
// //     const validationResult = CheckExerciseAnswerOutputSchema.safeParse(feedbackResultJson);

// //     if (!validationResult.success) {
// //         console.error(
// //             "Zod Validation Error (checkExerciseAnswer):",
// //             validationResult.error.errors
// //           );
// //         console.error("Raw AI Response:", feedbackResultJson);
// //         return res.status(500).json({
// //             error: "AI service returned feedback in an unexpected format.",
// //             details: validationResult.error.errors,
// //           });
// //     }

// //     // Send the validated data
// //     res.json(validationResult.data);

// //   } catch (error) {
// //     console.error("Error in checkExerciseAnswer controller:", error);
// //     res
// //       .status(500)
// //       .json({ error: "Failed to check exercise answer.", details: error.message });
// //   }
// // };

// // module.exports = {
// //   generateGrammarExercises,
// //   checkExerciseAnswer,
// // };
// const aiService = require("../services/aiService");
// const { v4: uuidv4 } = require("uuid");
// const { isValidArabic } = require("../utils/arabicValidator");
// const {
//   GenerateGrammarExercisesOutputSchema,
//   CheckExerciseAnswerOutputSchema,
// } = require("../schemas/exerciseSchemas");

// // Controller function for generating grammar exercises
// const generateGrammarExercises = async (req, res) => {
//   const { difficulty, exerciseType, count } = req.body;

//   if (!difficulty || !exerciseType || !count) {
//     return res
//       .status(400)
//       .json({ error: "Missing required fields: difficulty, exerciseType, count" });
//   }
//   if (count < 1 || count > 10) {
//     return res.status(400).json({ error: "Count must be between 1 and 10" });
//   }

//   const prompt = `Generate ${count} Arabic grammar exercises at the ${difficulty} level of the type ${exerciseType}.

// Create authentic exercises that focus on real Arabic grammatical concepts. The exercises should be educational and help users practice Arabic grammar analysis.

// For each exercise, include:
// 1. A unique identifier (use a simple format like exercise-1, exercise-2, etc. for now, I will replace it later).
// 2. The Arabic text for the exercise ("text").
// 3. The question or instructions for the exercise ("question").
// 4. The type of exercise ("type": ${exerciseType}).
// 5. Options for multiple-choice questions ("options"), if applicable.
// 6. A hint for the exercise ("hint").
// 7. The correct answer or solution ("correctAnswer").
// 8. Detailed explanation of the correct answer ("explanation").

// Return the result as a JSON object with a single key "exercises" which is an array of exercise objects, matching this structure:
// {
//   "exercises": [
//     {
//       "id": "string",
//       "text": "string",
//       "question": "string",
//       "type": "${exerciseType}",
//       "options": ["string"] | null,
//       "hint": "string",
//       "correctAnswer": "string",
//       "explanation": "string"
//     }
//     // ... more exercises
//   ]
// }
// `;

//   try {
//     // Start a timer for logging purposes
//     const startTime = Date.now();
//     console.log(`[${new Date().toISOString()}] Starting exercise generation: ${exerciseType}, ${difficulty}, count=${count}`);
    
//     // Try to generate content
//     let resultJson;
//     try {
//       resultJson = await aiService.generateStructuredContent(prompt);
//       console.log(`[${new Date().toISOString()}] Generated content in ${Date.now() - startTime}ms`);
//     } catch (aiError) {
//       console.error(`[${new Date().toISOString()}] AI service error:`, aiError.message);
      
//       // If we've reached here, all retries failed - try to use fallback content
//       console.log(`[${new Date().toISOString()}] Attempting to use fallback content`);
//       resultJson = await aiService.generateFallbackContent('exercise');
      
//       // Add a warning in the response
//       res.setHeader('X-Content-Source', 'fallback');
//     }

//     // Assign temporary IDs before validation
//     const tempResult = { exercises: resultJson.exercises || [] }; // Handle case where AI might not return the top-level key

//     // Add placeholder UUIDs for validation purposes
//     const exercisesWithTempIds = tempResult.exercises.map((ex, index) => ({
//         ...ex,
//         id: uuidv4(), // Assign a valid UUID format temporarily
//         type: exerciseType, // Ensure type matches request
//     }));

//     const validationInput = { exercises: exercisesWithTempIds };

//     // Validate the response using Zod schema
//     let validationResult;
//     try {
//       validationResult = GenerateGrammarExercisesOutputSchema.safeParse(validationInput);
//     } catch (validationError) {
//       console.error("Validation error:", validationError);
//       return res.status(500).json({
//         error: "Failed to validate exercise format",
//         details: validationError.message
//       });
//     }

//     if (!validationResult.success) {
//       console.error(
//         "Zod Validation Error (generateGrammarExercises):",
//         validationResult.error.errors
//       );
//       console.error("Raw AI Response:", resultJson);
//       return res.status(500).json({
//         error: "AI service returned exercises in an unexpected format.",
//         details: validationResult.error.errors,
//       });
//     }

//     // Use the validated data and ensure correct UUIDs are assigned
//     const finalExercises = validationResult.data.exercises.map(ex => ({
//         ...ex,
//         id: uuidv4(), // Re-assign a final unique ID
//         difficulty, // Add the difficulty level to each exercise
//     }));

//     // Cache the exercises if needed (implement caching mechanism)
//     // ...

//     console.log(`[${new Date().toISOString()}] Successfully generated ${finalExercises.length} exercises in ${Date.now() - startTime}ms`);
//     res.json({ 
//       exercises: finalExercises,
//       metadata: {
//         generatedAt: new Date().toISOString(),
//         requestedCount: count,
//         actualCount: finalExercises.length,
//         difficulty,
//         exerciseType
//       }
//     });

//   } catch (error) {
//     console.error("Error in generateGrammarExercises controller:", error);
//     res
//       .status(500)
//       .json({ error: "Failed to generate exercises.", details: error.message });
//   }
// };

// // Controller function for checking exercise answers
// const checkExerciseAnswer = async (req, res) => {
//   const { exerciseId, exerciseText, userAnswer, correctAnswer, exerciseType } =
//     req.body;

//   if (
//     !exerciseId ||
//     !exerciseText ||
//     userAnswer === undefined ||
//     !correctAnswer ||
//     !exerciseType
//   ) {
//     return res.status(400).json({
//       error:
//         "Missing required fields: exerciseId, exerciseText, userAnswer, correctAnswer, exerciseType",
//     });
//   }

//   if (!isValidArabic(userAnswer) && userAnswer !== "") {
//     return res.status(400).json({ error: "Please enter your answer in Arabic." });
//   }

//   const prompt = `Evaluate the user's answer for the following Arabic grammar exercise.

// Exercise Details:
// - Type: ${exerciseType}
// - Text: ${exerciseText}
// - Correct Answer: ${correctAnswer}
// - User's Answer: ${userAnswer}

// Provide feedback in JSON format with the following keys:
// - "isCorrect": boolean (true if the user's answer is essentially correct, false otherwise).
// - "score": number (percentage score from 0 to 100, reflecting correctness).
// - "feedback": string (Detailed feedback in Arabic explaining why the answer is correct or incorrect, pointing out specific errors if any).
// - "correctAnswer": string (Reiterate the correct answer).
// - "explanation": string (Explanation in Arabic of the relevant grammar rules applied in this exercise).

// Example JSON Output:
// {
//   "isCorrect": true,
//   "score": 100,
//   "feedback": "إجابتك صحيحة! لقد قمت بتحديد الإعراب بشكل دقيق.",
//   "correctAnswer": "فاعل مرفوع وعلامة رفعه الضمة",
//   "explanation": "كلمة 'المعلم' في الجملة 'جاء المعلم' تأتي بعد فعل لازم وتدل على من قام بالفعل، لذا تُعرب فاعلاً مرفوعاً."
// }

// Evaluate the user's answer: ${userAnswer}`;

//   try {
//     // If user's answer exactly matches the correct answer, we can bypass the AI call
//     const isExactMatch = userAnswer.trim() === correctAnswer.trim();
    
//     let feedbackResultJson;
//     if (isExactMatch) {
//       // For exact matches, generate a response without calling the AI service
//       feedbackResultJson = {
//         isCorrect: true,
//         score: 100,
//         feedback: "إجابتك صحيحة تماماً!",
//         correctAnswer: correctAnswer,
//         explanation: "إجابتك مطابقة تماماً للإجابة الصحيحة."
//       };
//     } else {
//       // Only call AI service for non-exact matches
//       try {
//         feedbackResultJson = await aiService.generateStructuredContent(prompt);
//       } catch (aiError) {
//         console.error("AI service error:", aiError.message);
        
//         // If AI service fails, provide a basic assessment
//         const similarityScore = calculateSimilarity(userAnswer, correctAnswer);
//         feedbackResultJson = {
//           isCorrect: similarityScore > 0.8,
//           score: Math.round(similarityScore * 100),
//           feedback: similarityScore > 0.8 ? "إجابتك صحيحة بشكل عام." : "إجابتك غير صحيحة.",
//           correctAnswer: correctAnswer,
//           explanation: "نعتذر، نظام تقييم الإجابات غير متاح حالياً. يرجى مراجعة الإجابة الصحيحة."
//         };
//       }
//     }

//     // Validate the feedback using Zod schema
//     const validationResult = CheckExerciseAnswerOutputSchema.safeParse(feedbackResultJson);

//     if (!validationResult.success) {
//         console.error(
//             "Zod Validation Error (checkExerciseAnswer):",
//             validationResult.error.errors
//           );
//         console.error("Raw AI Response:", feedbackResultJson);
//         return res.status(500).json({
//             error: "Failed to validate feedback format",
//             details: validationResult.error.errors,
//           });
//     }

//     // Send the validated data
//     res.json({
//       ...validationResult.data,
//       exerciseId // Include the exerciseId in the response
//     });

//   } catch (error) {
//     console.error("Error in checkExerciseAnswer controller:", error);
//     res
//       .status(500)
//       .json({ error: "Failed to check exercise answer.", details: error.message });
//   }
// };

// // Helper function to calculate similarity between two strings
// // This is a simple implementation - for production you might want a more sophisticated approach
// function calculateSimilarity(str1, str2) {
//   if (!str1 && !str2) return 1.0;
//   if (!str1 || !str2) return 0.0;
  
//   // Normalize strings - remove extra spaces and convert to lowercase
//   const a = str1.trim().toLowerCase();
//   const b = str2.trim().toLowerCase();
  
//   if (a === b) return 1.0;
//   if (a.length === 0 || b.length === 0) return 0.0;
  
//   // Simple character-based Levenshtein distance calculation
//   const matrix = Array(a.length + 1).fill().map(() => Array(b.length + 1).fill(0));
  
//   for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
//   for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  
//   for (let i = 1; i <= a.length; i++) {
//     for (let j = 1; j <= b.length; j++) {
//       const cost = a[i - 1] === b[j - 1] ? 0 : 1;
//       matrix[i][j] = Math.min(
//         matrix[i - 1][j] + 1,     // deletion
//         matrix[i][j - 1] + 1,     // insertion
//         matrix[i - 1][j - 1] + cost  // substitution
//       );
//     }
//   }
  
//   // Convert distance to similarity score (0-1)
//   const maxLen = Math.max(a.length, b.length);
//   return maxLen === 0 ? 1.0 : 1.0 - matrix[a.length][b.length] / maxLen;
// }

// module.exports = {
//   generateGrammarExercises,
//   checkExerciseAnswer,
// };
const aiService = require("../services/aiService");
const { v4: uuidv4 } = require("uuid");
const { isValidArabic } = require("../utils/arabicValidator");
const {
  GenerateGrammarExercisesOutputSchema,
  CheckExerciseAnswerOutputSchema,
} = require("../schemas/exerciseSchemas");

// Controller function for generating grammar exercises
const generateGrammarExercises = async (req, res) => {
  const { difficulty, exerciseType, count } = req.body;

  if (!difficulty || !exerciseType || !count) {
    return res
      .status(400)
      .json({ error: "Missing required fields: difficulty, exerciseType, count" });
  }
  if (count < 1 || count > 10) {
    return res.status(400).json({ error: "Count must be between 1 and 10" });
  }

  const validExerciseTypes = ["parsing", "fill-in-blanks", "error-correction", "multiple-choice"];
  if (!validExerciseTypes.includes(exerciseType)) {
    return res.status(400).json({ 
      error: `Invalid exercise type. Must be one of: ${validExerciseTypes.join(', ')}` 
    });
  }

  const prompt = `Generate ${count} Arabic grammar exercises at the ${difficulty} level of the type ${exerciseType}.

Create authentic exercises that focus on real Arabic grammatical concepts. The exercises should be educational and help users practice Arabic grammar analysis.

For each exercise, include:
1. A unique identifier (use a simple format like exercise-1, exercise-2, etc. for now, I will replace it later).
2. The Arabic text for the exercise ("text").
3. The question or instructions for the exercise ("question").
4. The type of exercise ("type": ${exerciseType}).
5. Options for multiple-choice questions ("options"), if applicable.
6. A hint for the exercise ("hint").
7. The correct answer or solution ("correctAnswer").
8. Detailed explanation of the correct answer ("explanation").

Return the result as a JSON object with a single key "exercises" which is an array of exercise objects, matching this structure:
{
  "exercises": [
    {
      "id": "string",
      "text": "string",
      "question": "string",
      "type": "${exerciseType}",
      "options": ["string"] | null,
      "hint": "string",
      "correctAnswer": "string",
      "explanation": "string"
    }
    // ... more exercises
  ]
}
`;

  try {
    // Log the start of the request with a timestamp
    console.log(`[${new Date().toISOString()}] Generating ${count} ${exerciseType} exercises at ${difficulty} level`);
    
    const resultJson = await aiService.generateStructuredContent(prompt);
    console.log(`[${new Date().toISOString()}] Received AI response, validating...`);

    // Handle case where AI might not return the top-level key
    const tempResult = { exercises: resultJson.exercises || [] }; 

    // Add placeholder UUIDs for validation purposes, will be replaced after validation
    const exercisesWithTempIds = tempResult.exercises.map((ex, index) => ({
        ...ex,
        id: uuidv4(), // Assign a valid UUID format temporarily
        type: exerciseType, // Ensure type matches request
    }));

    const validationInput = { exercises: exercisesWithTempIds };

    // Validate the AI response using Zod schema
    const validationResult = GenerateGrammarExercisesOutputSchema.safeParse(validationInput);

    if (!validationResult.success) {
      console.error(
        "Zod Validation Error (generateGrammarExercises):",
        validationResult.error.errors
      );
      console.error("Raw AI Response:", resultJson);
      return res.status(500).json({
        error: "AI service returned exercises in an unexpected format.",
        details: validationResult.error.errors,
      });
    }

    // Use the validated data and ensure correct UUIDs are assigned
    const finalExercises = validationResult.data.exercises.map(ex => ({
        ...ex,
        id: uuidv4() // Re-assign a final unique ID if needed, or keep the temp one
    }));

    console.log(`[${new Date().toISOString()}] Successfully generated ${finalExercises.length} exercises`);
    res.json({ exercises: finalExercises });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in generateGrammarExercises controller:`, error);
    res
      .status(500)
      .json({ error: "Failed to generate exercises.", details: error.message });
  }
};

// Controller function for checking exercise answers
const checkExerciseAnswer = async (req, res) => {
  const { exerciseId, exerciseText, userAnswer, correctAnswer, exerciseType } =
    req.body;

  if (
    !exerciseId ||
    !exerciseText ||
    userAnswer === undefined ||
    !correctAnswer ||
    !exerciseType
  ) {
    return res.status(400).json({
      error:
        "Missing required fields: exerciseId, exerciseText, userAnswer, correctAnswer, exerciseType",
    });
  }

  if (!isValidArabic(userAnswer) && userAnswer !== "") {
    return res.status(400).json({ error: "Please enter your answer in Arabic." });
  }

  console.log(`[${new Date().toISOString()}] Checking answer for exercise ${exerciseId}`);

  const prompt = `Evaluate the user's answer for the following Arabic grammar exercise.

Exercise Details:
- Type: ${exerciseType}
- Text: ${exerciseText}
- Correct Answer: ${correctAnswer}
- User's Answer: ${userAnswer}

Provide feedback in JSON format with the following keys:
- "isCorrect": boolean (true if the user's answer is essentially correct, false otherwise).
- "score": number (percentage score from 0 to 100, reflecting correctness).
- "feedback": string (Detailed feedback in Arabic explaining why the answer is correct or incorrect, pointing out specific errors if any).
- "correctAnswer": string (Reiterate the correct answer).
- "explanation": string (Explanation in Arabic of the relevant grammar rules applied in this exercise).

Example JSON Output:
{
  "isCorrect": true,
  "score": 100,
  "feedback": "إجابتك صحيحة! لقد قمت بتحديد الإعراب بشكل دقيق.",
  "correctAnswer": "فاعل مرفوع وعلامة رفعه الضمة",
  "explanation": "كلمة 'المعلم' في الجملة 'جاء المعلم' تأتي بعد فعل لازم وتدل على من قام بالفعل، لذا تُعرب فاعلاً مرفوعاً."
}

Evaluate the user's answer: ${userAnswer}`;

  try {
    const feedbackResultJson = await aiService.generateStructuredContent(prompt);

    // Validate the AI response using Zod schema
    const validationResult = CheckExerciseAnswerOutputSchema.safeParse(feedbackResultJson);

    if (!validationResult.success) {
        console.error(
            "Zod Validation Error (checkExerciseAnswer):",
            validationResult.error.errors
          );
        console.error("Raw AI Response:", feedbackResultJson);
        return res.status(500).json({
            error: "AI service returned feedback in an unexpected format.",
            details: validationResult.error.errors,
          });
    }

    console.log(`[${new Date().toISOString()}] Answer check complete for exercise ${exerciseId}: isCorrect=${validationResult.data.isCorrect}`);
    
    // Send the validated data
    res.json(validationResult.data);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in checkExerciseAnswer controller:`, error);
    res
      .status(500)
      .json({ error: "Failed to check exercise answer.", details: error.message });
  }
};

module.exports = {
  generateGrammarExercises,
  checkExerciseAnswer,
};