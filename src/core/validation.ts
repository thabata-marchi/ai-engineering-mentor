// ============================================================================
//  validation — INPUT validation/limits (Step 12 — security)
// ============================================================================
//
//  WHY VALIDATE THE QUESTION?
//    • EMPTY question → a useless LLM call (wastes quota, doesn't help).
//    • HUGE question → a giant prompt = more cost, more latency and the risk of
//      blowing the model's context limit. A simple cap prevents that.
//  "Validate at the edge, early and with a clear message" is basic security hygiene.
//
//  It's a PURE function in the core (no I/O) → applied both in the use case and in
//  the MCP layer, and trivial to test.
// ============================================================================

/** Invalid-input error (the caller sent something outside the rules). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Default cap on the question length (in characters). Adjustable by the caller. */
export const MAX_QUESTION_LEN = 2000;

/**
 * Validates and NORMALIZES the question: trims spaces, rejects empty and rejects
 * above the cap. Returns the trimmed text (so the caller uses the normalized value).
 */
export function validateQuestion(text: string, maxLen: number = MAX_QUESTION_LEN): string {
  const clean = text.trim();
  if (clean.length === 0) {
    throw new ValidationError('The question is empty.');
  }
  if (clean.length > maxLen) {
    throw new ValidationError(
      `The question is too long (${clean.length} characters; maximum ${maxLen}). ` +
        'Split it into smaller questions.',
    );
  }
  return clean;
}
