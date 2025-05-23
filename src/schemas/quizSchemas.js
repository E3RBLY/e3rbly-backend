const { z } = require("zod");

// --- Schemas for generateQuiz --- 

const QuizQuestionSchema = z.object({
    id: z.string().uuid().describe("Unique identifier for the question"), // Expect UUID generated by backend
    questionText: z.string().describe("The question text in Arabic"),
    options: z.array(z.string()).length(4).describe("Array of 4 possible answers in Arabic"),
    correctAnswerIndex: z.number().int().min(0).max(3).describe("The 0-based index of the correct answer"),
    explanation: z.string().describe("Brief explanation in Arabic why the answer is correct"),
});

const GenerateQuizOutputSchema = z.object({
  quiz: z.array(QuizQuestionSchema),
});

// --- Schemas for evaluateAnswer (Quiz) --- 

// The current evaluateAnswer controller does simple index comparison and doesn't call AI.
// If it were to call AI for feedback, we would define a schema similar to CheckExerciseAnswerOutputSchema.
// For now, no specific Zod schema is needed for the *output* of the current evaluateAnswer implementation,
// but we might add input validation later.

// Example Input Validation Schema (Optional - for request body validation)
const EvaluateQuizAnswerInputSchema = z.object({
    questionId: z.string().uuid(),
    userAnswerIndex: z.number().int().min(0).max(3),
    correctAnswerIndex: z.number().int().min(0).max(3), // Usually fetched/known by backend, but included if passed from client
});


module.exports = {
    GenerateQuizOutputSchema,
    QuizQuestionSchema, // Exporting for potential reuse
    // EvaluateQuizAnswerInputSchema // Export if needed for input validation
};

