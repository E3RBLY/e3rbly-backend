# E3rbly Backend
 ### E3rbly Backend is a comprehensive API service powered by Google Generative AI that specializes in Arabic language analysis and educational content generation. The system provides advanced Arabic text processing capabilities and intelligent feedback mechanisms through its specialized modules.

## AI-Powered Arabic Language Processing

The backend leverages Google Generative AI to deliver sophisticated Arabic language analysis and learning content:

### Arabic Text Analysis Module (`/api/analysis`)

This module utilizes AI to perform deep grammatical analysis of Arabic texts:

- **Text Analysis** (`POST /analyze`)
    - Analyzes Arabic text using Google GenAI to identify grammatical elements
    - Request: `{ "arabicText": "Arabic text here" }`
    - Response: Detailed breakdown of the text's grammatical structure including parts of speech, case markings, and syntactic relationships
- **Explanation Service** (`POST /explain`)
    - Provides educational explanations of previously analyzed text
    - Request: `{ "analysisResult": { ... }, "arabicText": "Original text" }`
    - Response: AI-generated explanations of grammatical phenomena in the text, suitable for language learners

### AI-Generated Grammar Exercises (`/api/exercises`)

This module generates tailored Arabic grammar exercises using generative AI:

- **Exercise Generation** (`POST /generate`)
    - Creates custom Arabic grammar exercises based on specified parameters
    - Request: `{ "difficulty": "beginner"|"intermediate"|"advanced", "exerciseType": "parsing"|"fill-in-blanks"|"error-correction"|"multiple-choice", "count": number }`
    - Response: Set of AI-generated exercises matching the requested criteria
- **Answer Validation** (`POST /check`)
    - Uses AI to evaluate learner responses to exercises
    - Request: `{ "exerciseId": "string", "exerciseText": "string", "userAnswer": "string", "correctAnswer": "string", "exerciseType": "string" }`
    - Response: Assessment of the answer with explanation of errors and personalized feedback

### Interactive Quiz System (`/api/quiz`)

This module offers dynamic quiz generation and intelligent evaluation:

- **Quiz Generation** (`POST /generate`)
    - Creates topic-focused Arabic language quizzes
    - Request: `{ "topic": "string", "difficulty": "beginner"|"intermediate"|"advanced", "questionCount": number }`
    - Response: Complete quiz with questions and answer options tailored to the specified topic and difficulty
- **Answer Evaluation** (`POST /evaluate`)
    - Assesses quiz responses with contextual feedback
    - Request: `{ "questionId": "string", "userAnswerIndex": number, "correctAnswerIndex": number }`
    - Response: Evaluation results with explanation and learning recommendations

## Data Validation and Quality Assurance

The system implements robust data validation using Zod schemas to ensure consistency in the AI-generated content:

- Validates all data received from Google GenAI API before processing
- Ensures structured responses conform to predefined schemas
- Maintains content quality across all language learning modules

## Authentication System

The API supports flexible authentication options:

- Default strict mode requires Firebase ID tokens for all endpoints
- Optional authentication mode for development and testing environments
- Bearer token authentication through standard Authorization header