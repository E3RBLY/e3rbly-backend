const { z } = require("zod");

// Define the types of grammar concepts
const GrammarConceptTypeEnum = z.enum([
  "part_of_speech",
  "case",
  "tense",
  "voice",
  "mood",
  "gender",
  "number",
  "state"
]);

// Define the schema for examples
const GrammarExampleSchema = z.object({
  arabicText: z.string().describe("نص المثال بالعربية"),
  translation: z.string().describe("الشرح بالعربية"),
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
  briefDescription: z.string().describe("وصف موجز للمفهوم ذي الصلة باللغة العربية")
});

// Define the schema for a complete grammar concept
const GrammarConceptSchema = z.object({
  type: GrammarConceptTypeEnum.describe("نوع المفهوم النحوي"),
  name: z.string().describe("اسم المفهوم المحدد"),
  nameArabic: z.string().describe("الاسم العربي للمفهوم"),
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

module.exports = {
  GrammarConceptTypeEnum,
  GrammarConceptSchema,
  RelatedConceptsOutputSchema,
  GetGrammarExplanationInputSchema,
  GetRelatedConceptsInputSchema
};