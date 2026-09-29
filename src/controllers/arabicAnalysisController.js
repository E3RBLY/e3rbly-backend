const { errorCode, errorStatus } = require("../utils/errors");
const aiService = require("../services/aiService");
const { isValidArabic } = require("../utils/arabicValidator");
const { toPlainExplanation } = require("../utils/explanationFormat"); // Assuming validator is in utils
const {
  AnalyzeArabicTextOutputSchema,
  ExplainGrammarAnalysisOutputSchema,
} = require("../schemas/arabicAnalysisSchemas");

// Controller function for analyzing Arabic text
// controllers/arabicAnalysisController.js
const analyzeArabicText = async (req, res) => {
  const { arabicText } = req.body;

  if (!isValidArabic(arabicText)) {
    return res.status(400).json({ error: "Please provide valid Arabic text." });
  }

  const prompt = `Analyze the following Arabic text and provide a detailed morphological and syntactic analysis in JSON format.

Ensure that the output JSON has two top-level keys: "tokens" and "syntaxTree".

The "tokens" array should contain an object for each token in the input text, with the following keys:
- "surface": The surface form of the token.
- "diacritized": The fully diacritized form of the token.
- "root": The root of the token.
- "pattern": The pattern of the token.
- "pos": The part of speech of the token (noun, verb, particle, etc.).
- "features": Morphological features that depend on the part of speech:
  - For nouns: gender, number, case, state
  - For verbs: tense, person, voice, mood
  - For particles: type
  - For other: note, custom

The "syntaxTree" should be a tree structure representing the syntactic analysis, with these properties:
- "type": Type of syntactic node (sentence, clause, phrase)
- "role": Grammatical role (Subject, Predicate, Object, etc.)
- "tokenIndices": Array of indices referring to tokens this node covers
- "children": Array of child nodes (only one level of nesting supported)

Arabic Text: ${arabicText}`;

  try {
    const analysisResultJson = await aiService.generateStructuredContent(prompt);

    // Validate the AI response using Zod schema
    const validationResult = AnalyzeArabicTextOutputSchema.safeParse(analysisResultJson);

    if (!validationResult.success) {
      console.error(
        "Zod Validation Error (analyzeArabicText):",
        validationResult.error.errors // Log Zod errors
      );
      return res.status(500).json({
        error: "AI service returned data in an unexpected format.", code: "AI_BAD_RESPONSE"
      });
    }

    // Send the validated data
    res.json(validationResult.data);

  } catch (error) {
    console.error("Error in analyzeArabicText controller:", error);
    res
      .status(errorStatus(error))
      .json({ error: "Failed to analyze Arabic text.", code: errorCode(error) });
  }
};

// Controller function for explaining grammar analysis
const explainGrammarAnalysis = async (req, res) => {
  const { analysisResult, arabicText } = req.body;

  // Basic input validation
  if (!analysisResult || typeof analysisResult !== "object" || !arabicText) {
    return res
      .status(400)
      .json({ error: "Please provide both analysisResult (JSON object) and arabicText." });
  }
  // Optional: Validate incoming analysisResult structure if needed
  // const inputValidation = AnalyzeArabicTextOutputSchema.safeParse(analysisResult);
  // if (!inputValidation.success) { ... }

  const prompt = `You are an expert in Arabic grammar and linguistics. Given the following morphological and syntactic analysis of an Arabic sentence, explain the analysis in Arabic, following the example format provided.

Example Output Format:
\`\`\`
الجملة: أنا أريد أن أشرب الماء
...
\`\`\`

Analysis Result (JSON): ${JSON.stringify(analysisResult)}
Original Arabic Text: ${arabicText}

Explanation (in Arabic):`;

  try {
    // Generate explanation text
    const explanationText = await aiService.generateContent(prompt);

    // Validate the output structure (simple object with explanation string)
    const validationResult = ExplainGrammarAnalysisOutputSchema.safeParse({
      explanation: explanationText,
    });

    if (!validationResult.success) {
        console.error(
            "Zod Validation Error (explainGrammarAnalysis):",
            validationResult.error.errors
          );
        return res.status(500).json({
            error: "AI service returned explanation in an unexpected format.", code: "AI_BAD_RESPONSE"
          });
    }

    // Send the validated data
    res.json(validationResult.data);

  } catch (error) {
    console.error("Error in explainGrammarAnalysis controller:", error);
    res
      .status(errorStatus(error))
      .json({ error: "Failed to explain grammar analysis.", code: errorCode(error) });
  }
};


// controllers/arabicAnalysisController.js
const analyzeArabicTextExplanation = async (req, res) => {
  const { arabicText } = req.body;

  if (!isValidArabic(arabicText)) {
    return res.status(400).json({ error: "نص عربي غير صالح" });
  }

  const prompt = `أعرب الجملة التالية بدقة وفق القواعد النحوية والصرفية العربية، مع الالتزام بالتنسيق التالي:

المطلوب:
1. إعراب كل كلمة بشكل منفصل
2. تحديد نوع كل كلمة (اسم، فعل، حرف)
3. ذكر العلامات الإعرابية مع التفسير
4. تحليل التركيب النحوي للجملة
5. ملاحظات إضافية إن لزم

اكتب نصًا عاديًا فقط، بدون تنسيق Markdown (لا تستخدم النجوم ** ولا علامة #).

التنسيق المطلوب:
الجملة الأصلية: [هنا الجملة]
الإعراب:
[الكلمة]: 
- النوع: 
- الإعراب: 
- التوضيح: 

التركيب النحوي:
[شرح التركيب العام]

مثال:
إعراب: هيا بنا يا رجال
الجملة الأصلية: هيا بنا يا رجال
الإعراب:
هيا: 
- النوع: فعل أمر 
- الإعراب: فعل أمر مبني على السكون، الفاعل مستتر
- التوضيح: للتحريض على الفعل

... [بقية الإعراب]

التركيب النحوي: جملة فعلية تامة تليها جملة نداء

الجملة المراد إعرابها: ${arabicText}
`;

  try {
    // accept() lets the AI service switch provider when a reply is malformed.
    const raw = await aiService.generateContent(prompt, { accept: toPlainExplanation });
    const explanation = toPlainExplanation(raw);
    if (!explanation) {
      throw Object.assign(new Error("AI explanation is missing the required markers"), { code: "AI_BAD_RESPONSE" });
    }

    res.json({ explanation });

  } catch (error) {
    console.error("خطأ في إعراب النص:", error);
    res.status(errorStatus(error)).json({ 
      error: "فشل في التحليل النحوي", code: errorCode(error) });
  }
};
module.exports = {
  analyzeArabicText,
  explainGrammarAnalysis,
  analyzeArabicTextExplanation
};

