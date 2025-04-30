
const aiService = require("../services/aiService");
const { v4: uuidv4 } = require("uuid");
const { GenerateQuizOutputSchema } = require("../schemas/quizSchemas");

// Controller function for generating a quiz
const generateQuiz = async (req, res) => {
  const { topic, difficulty, questionCount } = req.body;

  if (!topic || !difficulty || !questionCount) {
    return res
      .status(400)
      .json({ error: "Missing required fields: topic, difficulty, questionCount" });
  }
  if (questionCount < 1 || questionCount > 15) {
    return res.status(400).json({ error: "Question count must be between 1 and 15" });
  }

  const prompt = `Generate an Arabic grammar quiz with ${questionCount} multiple-choice questions on the topic "${topic}" at the ${difficulty} difficulty level.

For each question, provide:
1. A unique identifier (use a simple format like question-1, question-2, etc. for now, I will replace it later).
2. The question text in Arabic ("questionText").
3. An array of 4 possible answers in Arabic ("options").
4. The index (0-based) of the correct answer within the options array ("correctAnswerIndex").
5. A brief explanation in Arabic why the correct answer is right ("explanation").

Return the result as a JSON object with a single key "quiz" which is an array of question objects, matching this structure:
{
  "quiz": [
    {
      "id": "string",
      "questionText": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswerIndex": number,
      "explanation": "string"
    }
    // ... more questions
  ]
}
`;

  try {
    // Start a timer for logging purposes
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] Starting quiz generation: ${topic}, ${difficulty}, count=${questionCount}`);
    
    // Try to generate content with retries (handled in the aiService)
    let resultJson;
    try {
      resultJson = await aiService.generateStructuredContent(prompt);
      console.log(`[${new Date().toISOString()}] Generated quiz content in ${Date.now() - startTime}ms`);
    } catch (aiError) {
      console.error(`[${new Date().toISOString()}] AI service error:`, aiError.message);
      
      // All retries failed - use fallback content
      console.log(`[${new Date().toISOString()}] Using fallback content for quiz`);
      resultJson = await aiService.generateFallbackContent('quiz');
      
      // Add a header to indicate fallback content was used
      res.setHeader('X-Content-Source', 'fallback');
    }

    // Prepare data for validation, adding temporary UUIDs
    const tempResult = { quiz: resultJson.quiz || [] }; // Handle case where AI might not return the top-level key
    const questionsWithTempIds = tempResult.quiz.map((q, index) => ({
        ...q,
        id: uuidv4(), // Assign a valid UUID format temporarily
    }));
    const validationInput = { quiz: questionsWithTempIds };

    // Validate the AI response using Zod schema
    let validationResult;
    try {
      validationResult = GenerateQuizOutputSchema.safeParse(validationInput);
    } catch (validationError) {
      console.error("Validation error:", validationError);
      return res.status(500).json({
        error: "Failed to validate quiz format",
        details: validationError.message
      });
    }

    if (!validationResult.success) {
      console.error(
        "Zod Validation Error (generateQuiz):",
        validationResult.error.errors
      );
      console.error("Raw AI Response:", resultJson);
      return res.status(500).json({
        error: "AI service returned quiz data in an unexpected format.",
        details: validationResult.error.errors,
      });
    }

    // Use the validated data and ensure correct UUIDs are assigned
    const finalQuiz = validationResult.data.quiz.map(q => ({
        ...q,
        id: uuidv4(), // Re-assign a final unique ID
        topic, // Add metadata to each quiz question
        difficulty
    }));

    // Cache the quiz if needed (implement caching mechanism)
    // ...

    console.log(`[${new Date().toISOString()}] Successfully generated quiz with ${finalQuiz.length} questions in ${Date.now() - startTime}ms`);
    res.json({ 
      quiz: finalQuiz,
      metadata: {
        generatedAt: new Date().toISOString(),
        requestedCount: questionCount,
        actualCount: finalQuiz.length,
        topic,
        difficulty
      }
    });

  } catch (error) {
    console.error("Error in generateQuiz controller:", error);
    res
      .status(500)
      .json({ error: "Failed to generate quiz.", details: error.message });
  }
};

// Controller function for evaluating a quiz answer (simple comparison)
const evaluateAnswer = async (req, res) => {
  const { questionId, userAnswerIndex, correctAnswerIndex, explanation } = req.body;

  // Basic validation
  if (questionId === undefined || userAnswerIndex === undefined || correctAnswerIndex === undefined) {
    return res.status(400).json({ error: "Missing required fields: questionId, userAnswerIndex, correctAnswerIndex" });
  }
  if (typeof userAnswerIndex !== 'number' || typeof correctAnswerIndex !== 'number' || userAnswerIndex < 0 || userAnswerIndex > 3 || correctAnswerIndex < 0 || correctAnswerIndex > 3) {
      return res.status(400).json({ error: "Answer indices must be valid numbers between 0 and 3." });
  }

  try {
    const isCorrect = userAnswerIndex === correctAnswerIndex;
    const score = isCorrect ? 100 : 0;
    
    // Basic feedback or use the explanation provided
    let feedback;
    if (explanation && isCorrect) {
      feedback = explanation;
    } else if (isCorrect) {
      feedback = "إجابة صحيحة!";
    } else {
      feedback = "إجابة خاطئة. الرجاء المحاولة مرة أخرى.";
    }

    res.json({
        questionId,
        isCorrect,
        score,
        feedback,
        userAnswerIndex,
        correctAnswerIndex
    });
  } catch (error) {
    console.error("Error in evaluateAnswer controller:", error);
    res
      .status(500)
      .json({ error: "Failed to evaluate quiz answer.", details: error.message });
  }
};

module.exports = {
  generateQuiz,
  evaluateAnswer,
};