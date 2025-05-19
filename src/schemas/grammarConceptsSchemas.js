
const { z } = require("zod");

// Define the types of grammar concepts based on the existing Flutter code plus new types
const GrammarConceptTypeEnum = z.enum([
  // Original types from Zod schema
  "part_of_speech",
  "case",
  "tense",
  "voice",
  "mood",
  "gender",
  "number",
  "state",
  
  // Additional types from the Flutter code
  "noun_type",
  "verb_form",
  "sentence_type",
  "derivative"
]);

// Define the schema for examples
const GrammarExampleSchema = z.object({
  arabicText: z.string().describe("نص المثال بالعربية"),
  translation: z.string().describe("الترجمة إلى اللغة الإنجليزية"),
  explanation: z.string().describe("شرح كيفية تطبيق المفهوم بالعربية")
});

// Define the schema for related concepts
const RelatedConceptSchema = z.object({
  type: GrammarConceptTypeEnum.describe("نوع المفهوم ذي الصلة"),
  name: z.string().describe("اسم المفهوم ذي الصلة")
});

// Define the schema for extended related concepts (with more info)
const ExtendedRelatedConceptSchema = RelatedConceptSchema.extend({
  nameArabic: z.string().describe("الاسم العربي للمفهوم"),
  briefDescription: z.string().describe("وصف موجز للمفهوم ذي الصلة باللغة العربية"),
  color: z.string().optional().describe("لون المفهوم (اختياري)")
});

// Define the schema for a complete grammar concept
const GrammarConceptSchema = z.object({
  type: GrammarConceptTypeEnum.describe("نوع المفهوم النحوي"),
  name: z.string().describe("اسم المفهوم المحدد"),
  nameArabic: z.string().describe("الاسم العربي للمفهوم"),
  color: z.string().optional().describe("لون المفهوم"),
  description: z.string().describe("وصف المفهوم باللغة العربية"),
  examples: z.array(GrammarExampleSchema).describe("أمثلة توضح المفهوم"),
  tips: z.array(z.string()).describe("نصائح للتعرف على واستخدام هذا المفهوم النحوي باللغة العربية"),
  relatedConcepts: z.array(RelatedConceptSchema).describe("المفاهيم النحوية ذات الصلة")
});

// Input schema for getting a grammar explanation
const GetGrammarExplanationInputSchema = z.object({
  conceptType: GrammarConceptTypeEnum.describe("نوع المفهوم النحوي"),
  conceptName: z.string().describe("اسم المفهوم المحدد")
});

// Input schema for getting related concepts
const GetRelatedConceptsInputSchema = z.object({
  conceptType: GrammarConceptTypeEnum.describe("نوع المفهوم النحوي"),
  conceptName: z.string().describe("اسم المفهوم المحدد"),
  count: z.number().min(1).max(5).default(3).describe("عدد المفاهيم ذات الصلة المقترحة")
});

// Output schema for related concepts
const RelatedConceptsOutputSchema = z.object({
  relatedConcepts: z.array(ExtendedRelatedConceptSchema)
    .describe("المفاهيم النحوية ذات الصلة المقترحة")
});

// Schema for concept categories based on the getAllConceptCategories method
const ConceptCategorySchema = z.object({
  type: GrammarConceptTypeEnum.describe("نوع فئة المفهوم"),
  title: z.string().describe("عنوان الفئة بالإنجليزية"),
  titleArabic: z.string().describe("عنوان الفئة بالعربية"),
  concepts: z.array(GrammarConceptSchema).describe("المفاهيم في هذه الفئة")
});

// Define all possible concept values for each type
const ConceptValuesSchema = z.object({
  // Verb tenses
  tense: z.enum([
    "past", "present", "future", "perfect", "continuous", "imperative"
  ]).describe("أزمنة الفعل"),
  
  // Parts of speech
  part_of_speech: z.enum([
    "verb", "subject", "predicate", "noun", "adjective", "adverb", 
    "preposition", "pronoun", "conjunction"
  ]).describe("أقسام الكلام"),
  
  // Grammatical cases
  case: z.enum([
    "nominative", "accusative", "genitive", "jussive"
  ]).describe("حالات الإعراب"),
  
  // Noun types
  noun_type: z.enum([
    "definite", "indefinite", "proper", "common", "collective", "abstract"
  ]).describe("أنواع الأسماء"),
  
  // Grammatical number
  number: z.enum([
    "singular", "dual", "plural", "sound plural", "broken plural"
  ]).describe("العدد النحوي"),
  
  // Verb forms
  verb_form: z.enum([
    "form I", "form II", "form III", "form IV", "form V",
    "form VI", "form VII", "form VIII", "form IX", "form X"
  ]).describe("أوزان الفعل"),
  
  // Sentence types
  sentence_type: z.enum([
    "nominal", "verbal", "conditional", "interrogative", "negative"
  ]).describe("أنواع الجمل"),
  
  // Grammatical gender
  gender: z.enum([
    "masculine", "feminine"
  ]).describe("الجنس النحوي"),
  
  // Derivatives
  derivative: z.enum([
    "verbal noun", "active participle", "passive participle", 
    "comparative", "place noun", "time noun", "tool noun"
  ]).describe("المشتقات"),
  
  // Voice
  voice: z.enum([
    "active", "passive"
  ]).describe("المبني للمعلوم والمجهول"),
  
  // Mood
  mood: z.enum([
    "indicative", "subjunctive", "jussive", "imperative"
  ]).describe("صيغة الفعل"),
  
  // State
  state: z.enum([
    "declined", "indeclinable"
  ]).describe("البناء والإعراب"),
});

// Schema for complete concept list - all concepts across all types
const AllConceptsSchema = z.object({
  categories: z.array(ConceptCategorySchema).describe("فئات المفاهيم النحوية"),
  conceptValues: ConceptValuesSchema.describe("قيم المفاهيم المحددة لكل نوع")
});

module.exports = {
  GrammarConceptTypeEnum,
  GrammarConceptSchema,
  RelatedConceptsOutputSchema,
  GetGrammarExplanationInputSchema,
  GetRelatedConceptsInputSchema,
  ConceptCategorySchema,
  ConceptValuesSchema,
  AllConceptsSchema
};