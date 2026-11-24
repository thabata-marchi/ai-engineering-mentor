// ============================================================================
//  refusal — the mentor's "I don't know" sentence (Step 21), as PURE core logic
// ============================================================================
//
//  WHY IS THIS IN THE CORE?
//  The refusal sentence is used in two places that must agree on it:
//    • application/answerQuestion.ts → the system prompts tell the model to say it,
//      and the similarity threshold (minScore) returns it without calling the LLM.
//    • core/eval.ts → the eval checks whether an answer IS a refusal.
//  The core can't import from application (dependencies point inward), so the
//  sentence lives here and both sides import it. One source of truth: if the
//  wording changes, the prompts and the eval change together.
//
//  WHY A FIXED SENTENCE?
//  A fixed, verbatim sentence makes refusal MEASURABLE: the eval can assert on it
//  with a plain string check, no LLM-as-judge needed.
// ============================================================================

/** Languages the refusal sentence exists in (mirrors MentorLang). */
export type RefusalLang = 'en' | 'pt';

/** The "I couldn't find it" sentence, per language. Used verbatim by the prompts. */
export const NOT_FOUND: Readonly<Record<RefusalLang, string>> = {
  en: 'I could not find this in the knowledge base.',
  pt: 'Não encontrei isso na base de conhecimento.',
};

/** Lowercase + NFC + no trailing period, so small formatting differences don't matter. */
function norm(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\.\s*$/, '').trim();
}

/**
 * Did the mentor refuse? True when the answer contains the refusal sentence in ANY
 * supported language (the model may answer in a language other than the one set).
 * Pure: same text → same result.
 */
export function isRefusal(text: string): boolean {
  const t = text.normalize('NFC').toLowerCase();
  return Object.values(NOT_FOUND).some((sentence) => t.includes(norm(sentence)));
}
