// ============================================================================
//  difficulty — infers a student's STUDY DIFFICULTIES from their history (Step 19)
// ============================================================================
//
//  WHY THIS EXISTS:
//  The profile (ProfilePort) already knows WHAT the student studied (questions +
//  sources). This module goes one step further and infers WHERE they might be
//  struggling — the "onde está minha dificuldade" part.
//
//  ⚠️ HONESTY (same spirit as the guardrails): this does NOT diagnose anything.
//  It surfaces PATTERNS that *suggest* difficulty. We only claim what the data
//  shows: topics you revisit, questions you re-ask, sources you keep opening, and
//  moments you signalled confusion. It's a heuristic, not a verdict.
//
//  WHY A PURE FUNCTION IN THE CORE:
//  No I/O, no LLM, no embeddings → same input always gives the same output. That
//  makes it deterministic, free to run, and trivial to unit-test with fakes
//  (tests from day one). Semantic similarity via the embedder could enrich this
//  later; for now we use lexical (word-overlap) similarity, which needs no model.
//
//  THE FOUR SIGNALS (each becomes a DifficultyArea):
//    • revisited-source  → a source consulted many times (you keep going back to it)
//    • recurring-topic   → a keyword that shows up across many questions
//    • repeated-question → questions that are very similar to each other (you re-asked)
//    • confusion         → a question with an explicit "I didn't get it" marker
// ============================================================================

import type { DifficultyArea, StudyRecord } from './models.ts';

// DifficultyArea and DifficultyReason are core DATA types → they live in models.ts.
// Here we keep only the analysis LOGIC and its options.

/** The heuristic report: areas sorted strongest-first. */
export interface DifficultyReport {
  readonly areas: DifficultyArea[];
}

/** Tunable thresholds — defaults chosen for small study sessions. */
export interface DifficultyOptions {
  readonly minSourceRevisits?: number; // a source counts as "revisited" from here (default 3)
  readonly minTopicOccurrences?: number; // a keyword counts as "recurring" from here (default 3)
  readonly similarityThreshold?: number; // Jaccard 0..1 to call two questions "similar" (default 0.6)
  readonly maxAreas?: number; // cap on how many areas we report (default 5)
}

// Words too common to carry meaning (PT + EN). Kept short on purpose — this is a
// study tool, not a full NLP stopword list.
const STOPWORDS = new Set([
  // Portuguese
  'que', 'qual', 'quais', 'como', 'onde', 'quando', 'porque', 'por', 'para', 'com',
  'sem', 'uma', 'uns', 'umas', 'dos', 'das', 'nos', 'nas', 'ele', 'ela', 'isso',
  'este', 'essa', 'esse', 'the', 'and',
  // English
  'what', 'which', 'how', 'where', 'when', 'why', 'who', 'does', 'did', 'are',
  'was', 'were', 'for', 'with', 'without', 'about', 'this', 'that', 'these',
  'those', 'can', 'could', 'should', 'would', 'from', 'into', 'your', 'you',
]);

// Explicit signals of confusion, in PT and EN (same idea as the guardrail regexes).
const CONFUSION_PATTERNS: RegExp[] = [
  /n[ãa]o\s+entendi/i,
  /n[ãa]o\s+ficou\s+claro/i,
  /ainda\s+(estou\s+)?(com\s+d[úu]vida|confus[oa]|n[ãa]o\s+entendi)/i,
  /pode\s+explicar\s+(de\s+novo|novamente|melhor)/i,
  /explica.*(de\s+novo|novamente)/i,
  /n[ãa]o\s+consigo\s+entender/i,
  /i\s+(really\s+)?(don'?t|do\s+not)\s+(understand|get)/i,
  /still\s+(confused|don'?t\s+understand|do\s+not\s+understand)/i,
  /not\s+clear/i,
  /can\s+you\s+explain\s+(it\s+)?(again|better)/i,
  /explain.*again/i,
];

/**
 * Normalizes a question into a set of meaningful tokens: lowercase, letters only,
 * no stopwords, no tiny words. A crude singular/plural trim (drop a trailing "s")
 * helps "smell" and "smells" match. Returns a Set (so overlap = intersection).
 */
function tokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents so "função" ~ "funcao"
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t))
    .map((t) => (t.endsWith('s') ? t.slice(0, -1) : t)); // rough plural trim
  return new Set(tokens);
}

/** Jaccard similarity between two token sets: |A ∩ B| / |A ∪ B| (0..1). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Infers difficulty areas from the study history. PURE and deterministic.
 * Ordering is stable: strongest signal first, ties broken alphabetically by topic.
 */
export function analyzeDifficulty(
  records: readonly StudyRecord[],
  options: DifficultyOptions = {},
): DifficultyReport {
  const minSourceRevisits = options.minSourceRevisits ?? 3;
  const minTopicOccurrences = options.minTopicOccurrences ?? 3;
  const similarityThreshold = options.similarityThreshold ?? 0.6;
  const maxAreas = options.maxAreas ?? 5;

  const areas: DifficultyArea[] = [];
  const questions = records.map((r) => r.question);

  // --- Signal 1: sources you keep going back to ---
  const sourceCounts = new Map<string, number>();
  for (const r of records) {
    for (const s of r.sources) sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1);
  }
  for (const [source, count] of sourceCounts) {
    if (count >= minSourceRevisits) {
      areas.push({ topic: source, reason: 'revisited-source', occurrences: count });
    }
  }

  // --- Signal 2: keywords that recur across questions ---
  const keywordCounts = new Map<string, number>();
  for (const q of questions) {
    // count a keyword once per question (so repeated words in one question don't inflate it)
    for (const token of tokenSet(q)) keywordCounts.set(token, (keywordCounts.get(token) ?? 0) + 1);
  }
  for (const [keyword, count] of keywordCounts) {
    if (count >= minTopicOccurrences) {
      areas.push({ topic: keyword, reason: 'recurring-topic', occurrences: count });
    }
  }

  // --- Signal 3: questions you re-asked (lexically similar to an earlier one) ---
  // Greedy clustering: each question joins the first earlier cluster it's similar to.
  const clusters: { representative: string; tokens: Set<string>; size: number }[] = [];
  for (const q of questions) {
    const tokens = tokenSet(q);
    if (tokens.size === 0) continue;
    const match = clusters.find((c) => jaccard(c.tokens, tokens) >= similarityThreshold);
    if (match) match.size++;
    else clusters.push({ representative: q, tokens, size: 1 });
  }
  for (const c of clusters) {
    if (c.size >= 2) {
      areas.push({ topic: c.representative, reason: 'repeated-question', occurrences: c.size });
    }
  }

  // --- Signal 4: explicit confusion markers ---
  for (const q of questions) {
    if (CONFUSION_PATTERNS.some((p) => p.test(q))) {
      areas.push({ topic: q, reason: 'confusion', occurrences: 1 });
    }
  }

  // Strongest first; stable tie-break by topic so the output is deterministic.
  areas.sort((a, b) => b.occurrences - a.occurrences || a.topic.localeCompare(b.topic));

  return { areas: areas.slice(0, maxAreas) };
}

/** Trims long questions so a difficulty line stays readable. */
function short(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Turns a DifficultyArea into a human-readable line (English UI). Pure function,
 * reused by the MCP tool and the chat command so the wording stays consistent.
 * The phrasing is deliberately cautious ("keep going back to", "comes up a lot")
 * — we surface patterns, we don't diagnose.
 */
export function describeDifficulty(area: DifficultyArea): string {
  switch (area.reason) {
    case 'revisited-source':
      return `You keep going back to "${short(area.topic)}" (${area.occurrences}×)`;
    case 'recurring-topic':
      return `The topic "${area.topic}" comes up a lot (${area.occurrences} questions)`;
    case 'repeated-question':
      return `You re-asked something similar to "${short(area.topic)}" (${area.occurrences}×)`;
    case 'confusion':
      return `You flagged confusion on: "${short(area.topic)}"`;
  }
}
