
const aiService = require("../services/aiService");
const { 
  GrammarConceptSchema, 
  RelatedConceptsOutputSchema,
  GrammarConceptTypeEnum,
  ConceptValuesSchema,
  GetGrammarExplanationInputSchema,
  GetRelatedConceptsInputSchema
} = require("../schemas/grammarConceptsSchemas");

/**
 * Get explanation and examples for a grammar concept in Arabic
 * @param {Object} req - Request object with conceptType and conceptName
 * @param {Object} res - Response object
 */
const getGrammarExplanation = async (req, res) => {
  const { conceptType, conceptName } = req.body;

  // Basic input validation
  if (!conceptType || !conceptName) {
    return res.status(400).json({ 
      error: "الرجاء تقديم نوع المفهوم واسمه", 
      message: "Please provide both conceptType and conceptName" 
    });
  }

  // Validate input against schema
  const inputValidation = GetGrammarExplanationInputSchema.safeParse({
    conceptType,
    conceptName
  });

  if (!inputValidation.success) {
    return res.status(400).json({ 
      error: `نوع المفهوم غير صالح. الأنواع المسموح بها: ${GrammarConceptTypeEnum.options.join(', ')}`,
      message: `Invalid concept type. Allowed types: ${GrammarConceptTypeEnum.options.join(', ')}`,
      details: inputValidation.error.errors
    });
  }

  const prompt = `قدم شرحًا مفصلًا وأمثلة للمفهوم النحوي العربي التالي:

نوع المفهوم: ${conceptType}
اسم المفهوم: ${conceptName}

يجب أن تكون جميع الإجابات باللغة العربية فقط. قم بتضمين ما يلي في إجابتك:
1. وصف واضح للمفهوم بعبارات بسيطة باللغة العربية
2. الاسم العربي للمفهوم
3. على الأقل 3 أمثلة توضح استخدام المفهوم، مع:
   - النص العربي (مشكّل بالكامل)
   - شرح بالعربية
   - توضيح كيفية تطبيق المفهوم باللغة العربية
4. نصائح عملية للتعرف على واستخدام هذا المفهوم النحوي باللغة العربية
5. مفاهيم نحوية ذات صلة قد تكون مفيدة للفهم

رجاءً أعد الرد بتنسيق JSON مع المفاتيح التالية:
{
  "type": "نوع المفهوم",
  "name": "اسم المفهوم المحدد",
  "nameArabic": "الاسم العربي للمفهوم",
  "description": "وصف المفهوم بالعربية",
  "examples": [
    {
      "arabicText": "نص المثال بالعربية",
      "translation": "الشرح بالعربية",
      "explanation": "شرح كيفية تطبيق المفهوم بالعربية"
    }
  ],
  "tips": ["نصائح..."],
  "relatedConcepts": [
    {
      "type": "نوع المفهوم ذي الصلة",
      "name": "اسم المفهوم ذي الصلة"
    }
  ]
}

هام جدًا: لمفتاح "type" في "relatedConcepts"، استخدم فقط إحدى القيم التالية بالضبط:
${GrammarConceptTypeEnum.options.join('\n- ')}
لا تستخدم مصطلحات أخرى مثل "grammatical_case" أو "حالة إعرابية" أو غيرها.`;

  try {
    const grammarConceptJson = await aiService.generateStructuredContent(prompt);
    
    // Pre-process the response to ensure valid enum values
    try {
      // Make sure we have relatedConcepts as an array
      if (grammarConceptJson && typeof grammarConceptJson === 'object') {
        if (Array.isArray(grammarConceptJson.relatedConcepts)) {
          // Validate and fix each related concept type
          grammarConceptJson.relatedConcepts = grammarConceptJson.relatedConcepts.map(concept => {
            // If type is not a valid enum value, attempt to map it or default to an appropriate type
            if (concept && concept.type && !GrammarConceptTypeEnum.options.includes(concept.type)) {
              // Map common invalid types to valid ones
              const typeMapping = {
                'grammatical_case': 'case',
                'حالة إعرابية': 'case',
                'علامة إعرابية': 'case',
                'verb_tense': 'tense',
                'noun_state': 'state',
                'verbal_noun': 'derivative',
                'sentence_structure': 'sentence_type'
                // Add more mappings as needed
              };
              
              concept.type = typeMapping[concept.type] || 
                             conceptType; // Default to the same type as the main concept
            }
            return concept;
          });
        }
      }
    } catch (preprocessError) {
      console.error("Error preprocessing AI response:", preprocessError);
      // Continue with validation even if preprocessing fails
    }
    
    // Validate the AI response using Zod schema
    const validationResult = GrammarConceptSchema.safeParse(grammarConceptJson);

    if (!validationResult.success) {
      console.error(
        "Zod Validation Error (getGrammarExplanation):",
        validationResult.error.errors
      );
      console.error("Raw AI Response:", grammarConceptJson);
      return res.status(500).json({
        error: "هناك مشكلة في تنسيق الاستجابة",
        message: "AI service returned data in an unexpected format.",
        details: validationResult.error.errors,
      });
    }

    // Send the validated data
    res.json(validationResult.data);

  } catch (error) {
    console.error("Error in getGrammarExplanation controller:", error);
    res
      .status(500)
      .json({ 
        error: "فشل في الحصول على شرح المفهوم النحوي", 
        message: "Failed to get grammar concept explanation.",
        details: error.message 
      });
  }
};

/**
 * Get related grammar concepts in Arabic
 * @param {Object} req - Request object with conceptType, conceptName, and optional count
 * @param {Object} res - Response object
 */
const getRelatedConcepts = async (req, res) => {
  const { conceptType, conceptName, count = 3 } = req.body;

  // Basic input validation
  if (!conceptType || !conceptName) {
    return res.status(400).json({ 
      error: "الرجاء تقديم نوع المفهوم واسمه", 
      message: "Please provide both conceptType and conceptName" 
    });
  }

  // Validate input against schema
  const inputValidation = GetRelatedConceptsInputSchema.safeParse({
    conceptType,
    conceptName,
    count: parseInt(count) || 3
  });

  if (!inputValidation.success) {
    return res.status(400).json({ 
      error: `نوع المفهوم غير صالح أو معلمات أخرى غير صالحة.`,
      message: `Invalid input parameters.`,
      details: inputValidation.error.errors
    });
  }

  // Validate count
  const safeCount = Math.min(Math.max(parseInt(count) || 3, 1), 5);

  const prompt = `اقترح ${safeCount} من مفاهيم النحو العربي المرتبطة بالمفهوم التالي:

نوع المفهوم: ${conceptType}
اسم المفهوم: ${conceptName}

يجب أن تكون جميع الإجابات باللغة العربية فقط. لكل مفهوم مقترح، قدم:
1. نوع المفهوم النحوي
2. اسم المفهوم
3. الاسم العربي للمفهوم
4. وصف موجز لعلاقته بالمفهوم الأصلي باللغة العربية

اختر المفاهيم التي قد تكون مفيدة لشخص يتعلم عن ${conceptName}.

رجاءً أعد الرد بتنسيق JSON مع المفتاح "relatedConcepts" الذي يحتوي على مصفوفة من الكائنات:
{
  "relatedConcepts": [
    {
      "type": "نوع المفهوم ذي الصلة",
      "name": "اسم المفهوم ذي الصلة",
      "nameArabic": "الاسم العربي للمفهوم",
      "briefDescription": "وصف موجز بالعربية"
    }
  ]
}

هام جدًا: لمفتاح "type"، استخدم فقط إحدى القيم التالية بالضبط:
${GrammarConceptTypeEnum.options.join('\n- ')}
لا تستخدم مصطلحات أخرى مثل "grammatical_case" أو "حالة إعرابية" أو غيرها.`;

  try {
    const relatedConceptsJson = await aiService.generateStructuredContent(prompt);
    
    // Pre-process the response to ensure valid enum values
    try {
      if (relatedConceptsJson && typeof relatedConceptsJson === 'object') {
        if (Array.isArray(relatedConceptsJson.relatedConcepts)) {
          // Validate and fix each related concept type
          relatedConceptsJson.relatedConcepts = relatedConceptsJson.relatedConcepts.map(concept => {
            // If type is not a valid enum value, attempt to map it or default to an appropriate type
            if (concept && concept.type && !GrammarConceptTypeEnum.options.includes(concept.type)) {
              // Map common invalid types to valid ones
              const typeMapping = {
                'grammatical_case': 'case',
                'حالة إعرابية': 'case',
                'علامة إعرابية': 'case',
                'verb_tense': 'tense',
                'noun_state': 'state',
                'verbal_noun': 'derivative',
                'sentence_structure': 'sentence_type'
                // Add more mappings as needed
              };
              
              concept.type = typeMapping[concept.type] || 
                             conceptType; // Default to the same type as the main concept
            }
            return concept;
          });
        }
      }
    } catch (preprocessError) {
      console.error("Error preprocessing AI response:", preprocessError);
      // Continue with validation even if preprocessing fails
    }
    
    // Validate the AI response using Zod schema
    const validationResult = RelatedConceptsOutputSchema.safeParse(relatedConceptsJson);

    if (!validationResult.success) {
      console.error(
        "Zod Validation Error (getRelatedConcepts):",
        validationResult.error.errors
      );
      console.error("Raw AI Response:", relatedConceptsJson);
      return res.status(500).json({
        error: "هناك مشكلة في تنسيق الاستجابة",
        message: "AI service returned data in an unexpected format.",
        details: validationResult.error.errors,
      });
    }

    // Send the validated data
    res.json(validationResult.data);

  } catch (error) {
    console.error("Error in getRelatedConcepts controller:", error);
    res
      .status(500)
      .json({ 
        error: "فشل في الحصول على المفاهيم النحوية ذات الصلة", 
        message: "Failed to get related grammar concepts.",
        details: error.message 
      });
  }
};

/**
 * Get all allowed grammar concept types
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getConceptTypes = async (req, res) => {
  try {
    // Return all the concept types from the GrammarConceptTypeEnum
    res.json({
      conceptTypes: GrammarConceptTypeEnum.options
    });
  } catch (error) {
    console.error("Error in getConceptTypes controller:", error);
    res
      .status(500)
      .json({ 
        error: "فشل في الحصول على أنواع المفاهيم النحوية", 
        message: "Failed to get grammar concept types.",
        details: error.message 
      });
  }
};

/**
 * Get all allowed values for a specific concept type
 * @param {Object} req - Request object with conceptType parameter
 * @param {Object} res - Response object
 */
const getConceptValues = async (req, res) => {
  const { conceptType } = req.params;

  // Validate concept type
  if (!GrammarConceptTypeEnum.options.includes(conceptType)) {
    return res.status(400).json({ 
      error: `نوع المفهوم غير صالح. الأنواع المسموح بها: ${GrammarConceptTypeEnum.options.join(', ')}`,
      message: `Invalid concept type. Allowed types: ${GrammarConceptTypeEnum.options.join(', ')}`
    });
  }

  try {
    // Get the enum values for the specific concept type from ConceptValuesSchema
    const conceptValues = ConceptValuesSchema.shape[conceptType].options;
    
    if (!conceptValues) {
      return res.status(404).json({
        error: `لم يتم العثور على قيم لنوع المفهوم: ${conceptType}`,
        message: `No values found for concept type: ${conceptType}`
      });
    }

    res.json({
      conceptType,
      values: conceptValues
    });
  } catch (error) {
    console.error("Error in getConceptValues controller:", error);
    res
      .status(500)
      .json({ 
        error: "فشل في الحصول على قيم المفهوم النحوي", 
        message: "Failed to get grammar concept values.",
        details: error.message 
      });
  }
};

module.exports = {
  getGrammarExplanation,
  getRelatedConcepts,
  getConceptTypes,
  getConceptValues
};