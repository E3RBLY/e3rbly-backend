const aiService = require("../services/aiService");
const { v4: uuidv4 } = require("uuid");
const { GenerateQuizOutputSchema } = require("../schemas/quizSchemas");
// Assuming EvaluateQuizAnswerInputSchema is not used for now

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
    const resultJson = await aiService.generateStructuredContent(prompt);

    // Prepare data for validation, adding temporary UUIDs
    const tempResult = { quiz: resultJson.quiz || [] }; // Handle case where AI might not return the top-level key
    const questionsWithTempIds = tempResult.quiz.map((q, index) => ({
        ...q,
        id: uuidv4(), // Assign a valid UUID format temporarily
    }));
    const validationInput = { quiz: questionsWithTempIds };

    // Validate the AI response using Zod schema
    const validationResult = GenerateQuizOutputSchema.safeParse(validationInput);

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
        id: uuidv4() // Re-assign a final unique ID
    }));

    res.json({ quiz: finalQuiz });

  } catch (error) {
    console.error("Error in generateQuiz controller:", error);
    res
      .status(500)
      .json({ error: "Failed to generate quiz.", details: error.message });
  }
};

// Controller function for evaluating a quiz answer (simple comparison)
const evaluateAnswer = async (req, res) => {
  const { questionId, userAnswerIndex, correctAnswerIndex } = req.body;

  // Basic validation (can add Zod input validation here if needed using EvaluateQuizAnswerInputSchema)
  if (questionId === undefined || userAnswerIndex === undefined || correctAnswerIndex === undefined) {
    return res.status(400).json({ error: "Missing required fields: questionId, userAnswerIndex, correctAnswerIndex" });
  }
  if (typeof userAnswerIndex !== 'number' || typeof correctAnswerIndex !== 'number' || userAnswerIndex < 0 || userAnswerIndex > 3 || correctAnswerIndex < 0 || correctAnswerIndex > 3) {
      return res.status(400).json({ error: "Answer indices must be valid numbers between 0 and 3." });
  }

  const isCorrect = userAnswerIndex === correctAnswerIndex;
  const score = isCorrect ? 100 : 0;
  const feedback = isCorrect ? "إجابة صحيحة!" : "إجابة خاطئة.";

  try {
    res.json({
        questionId,
        isCorrect,
        score,
        feedback,
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

