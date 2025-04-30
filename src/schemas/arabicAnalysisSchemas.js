const { z } = require("zod");

// Schemas based on the structure defined in the frontend code (pasted_content.txt)

// --- Schemas for analyzeArabicText --- 

const NounFeaturesSchema = z.object({
  gender: z.enum(["masculine", "feminine"]).optional().describe("Grammatical gender"),
  number: z.enum(["singular", "dual", "plural"]).optional().describe("Grammatical number"),
  case: z.enum(["nominative", "accusative", "genitive"]).optional().describe("Grammatical case"),
  state: z.enum(["definite", "indefinite", "construct"]).optional().describe("Definiteness state"),
});

const VerbFeaturesSchema = z.object({
  tense: z.enum(["past", "present", "imperative"]).optional().describe("Verb tense"),
  person: z.enum(["first", "second", "third"]).optional().describe("Grammatical person"),
  voice: z.enum(["active", "passive"]).optional().describe("Grammatical voice"),
  mood: z.enum(["indicative", "subjunctive", "jussive"]).optional().describe("Grammatical mood"),
});

const ParticleFeaturesSchema = z.object({
  type: z.enum(["preposition", "conjunction", "interrogative", "negation", "other"]).optional().describe("Particle type"),
});

const OtherFeaturesSchema = z.object({
  note: z.string().optional().describe("Additional notes about features"),
  custom: z.string().optional().describe("Custom feature information"),
}).catchall(z.any()); // Allow other potential features from AI

// Union type for features based on part of speech
const FeaturesSchema = z.union([
  NounFeaturesSchema,
  VerbFeaturesSchema,
  ParticleFeaturesSchema,
  OtherFeaturesSchema,
]);

// Define a non-recursive syntax tree structure to avoid recursion issues
// Base node schema
const SyntacticNodeSchema = z.object({
  type: z.string().describe("Type of syntactic node (e.g., sentence, clause, phrase)"),
  role: z.string().describe("Grammatical role (e.g., subject, predicate, object)"),
  tokenIndices: z.array(z.number()).optional().describe("Indices of tokens this node covers"),
});

// Recursive schema definition for the tree structure
// Use z.lazy to handle recursion
const SyntaxTreeSchema = z.lazy(() => 
  SyntacticNodeSchema.extend({
    children: z.array(SyntaxTreeSchema).optional().describe("Child nodes in the syntax tree"),
  })
);

// Final output schema for analyzeArabicText
const AnalyzeArabicTextOutputSchema = z.object({
  tokens: z.array(
    z.object({
      surface: z.string().describe("The surface form of the token."),
      diacritized: z.string().describe("The fully diacritized form of the token."),
      root: z.string().describe("The root of the token."),
      pattern: z.string().describe("The pattern of the token."),
      pos: z.string().describe("The part of speech of the token (noun, verb, particle, etc.)."),
      // Using .catchall(z.any()) to be more lenient with features from AI
      features: z.record(z.string(), z.any()).describe("Morphological features based on part of speech"), 
      // features: FeaturesSchema.describe("Morphological features based on part of speech"), // Stricter version
    })
  ),
  // Allow syntaxTree to be potentially null or undefined if AI fails to generate it
  syntaxTree: SyntaxTreeSchema.optional().nullable().describe("A tree structure representing the syntactic analysis."),
});

// --- Schemas for explainGrammarAnalysis --- 

// Input schema (already defined in frontend, but useful for reference)
const ExplainGrammarAnalysisInputSchema = z.object({
  analysisResult: AnalyzeArabicTextOutputSchema, // Reuse the schema above
  arabicText: z.string().describe("The original Arabic text to analyze."),
});

// Output schema for explainGrammarAnalysis
const ExplainGrammarAnalysisOutputSchema = z.object({
  explanation: z.string().describe("Explanation of the morphological and syntactic analysis in Arabic."),
});
// schemas/arabicAnalysisSchemas.js
const ArabicExplanationSchema = z.object({
  explanation: z.string().refine(text => 
    text.includes("الجملة الأصلية:") && 
    text.includes("الإعراب:"), 
    "التنسيق غير صحيح"
  )
});
module.exports = {
    AnalyzeArabicTextOutputSchema,
    ExplainGrammarAnalysisOutputSchema,
    ExplainGrammarAnalysisInputSchema,
    ArabicExplanationSchema,



    // Exporting input schema might be useful ifcl validating request bodies later
    // ExplainGrammarAnalysisInputSchema 
};

