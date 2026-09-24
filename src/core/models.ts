// ============================================================================
//  CORE MODELS — the RAG "data pieces"
// ============================================================================
//
//  WHAT IS THIS FILE?
//  Here live only the data TYPES that flow through the system. No logic, no LLM,
//  no database. They are like "lego pieces" the other modules use to assemble the
//  features.
//
//  WHY ARE THEY SEPARATE AND WITH NO EXTERNAL DEPENDENCY?
//  Because this is the CORE of the Hexagonal Architecture. The core doesn't know
//  (nor needs to know) whether the LLM is OpenAI or the database is Chroma. Keeping
//  it "pure" makes everything easy to test and lets you swap technology without
//  touching anything here.
//
//  WHERE EACH TYPE APPEARS IN THE RAG FLOW:
//
//    File → [Document] → [Chunk]s → (become vectors) → stored in the database
//                                                                │
//    Question → [Query] → similarity search → [RetrievedContext]
//                                                                │
//                                      LLM answers → [Answer] + [Source]s
//
//  TYPESCRIPT DETAIL:
//  `readonly` = the property cannot be swapped after creation (immutability). It's
//  the compile-time equivalent of Python's `frozen=True`. Immutable objects cause
//  fewer bugs and are easier to reason about.
// ============================================================================

/** A source document from the knowledge base (e.g. a PDF or a .md already read). */
export interface Document {
  readonly id: string; // unique document identifier
  readonly source: string; // where it came from (name/path) → used to cite the source
  readonly text: string; // the text already EXTRACTED from the file
  readonly metadata?: Record<string, unknown>; // optional extras (author, page...)
}

/** A smaller PIECE of a Document. It's the chunk that becomes a vector and is searched. */
export interface Chunk {
  readonly id: string; // unique piece id (e.g. "d1-0")
  readonly documentId: string; // which Document this chunk belongs to
  readonly text: string; // the piece's text
  readonly position: number; // order in the document (0,1,2...) → traceability
  readonly metadata?: Record<string, unknown>;
}

/** The question the user asks the mentor. */
export interface Query {
  readonly text: string;
}

/** A retrieved Chunk + how similar it is to the question (0 to 1). */
export interface ScoredChunk {
  readonly chunk: Chunk;
  readonly score: number; // similarity: near 1 = very similar; near 0 = not at all
}

/** The set of chunks retrieved to answer ONE question (the "context"). */
export interface RetrievedContext {
  readonly chunks: ScoredChunk[]; // usually the most similar "top-k"
}

/** A source cited in the answer — meets the traceability requirement. */
export interface Source {
  readonly documentId: string; // from which document
  readonly source: string; // file name (e.g. clean_code.pdf)
  readonly position: number; // which piece of the document
}

/** The mentor's final answer + the SOURCES the information was retrieved from. */
export interface Answer {
  readonly text: string; // the answer text
  readonly sources: Source[]; // where it came from (traceability)
}

/**
 * A conversation "turn": who spoke (student or mentor) and what. The mentor's
 * memory is a list of turns — that is what lets the dialogue have continuity.
 */
export interface Turn {
  readonly role: 'student' | 'mentor';
  readonly text: string;
  readonly at: string; // ISO date/time (e.g. "2026-09-11T14:00:00.000Z")
}

/** A record of what the student studied: the question asked + the sources touched. */
export interface StudyRecord {
  readonly question: string;
  readonly sources: string[]; // names of the documents/sources consulted
  readonly at: string; // ISO
}

/** Why a topic was flagged as a possible difficulty (Step 19 — for transparency). */
export type DifficultyReason =
  | 'revisited-source' // a source consulted many times
  | 'recurring-topic' // a keyword that shows up across many questions
  | 'repeated-question' // questions very similar to each other (re-asked)
  | 'confusion'; // a question with an explicit "I didn't get it" marker

/** One area that MAY need review, plus the evidence behind it (heuristic, not a verdict). */
export interface DifficultyArea {
  readonly topic: string; // the source, keyword or question that triggered the signal
  readonly reason: DifficultyReason;
  readonly occurrences: number; // strength of the signal (higher = stronger)
}

/** A summary of the student's learning profile (what they've been studying). */
export interface ProfileSummary {
  readonly total: number; // how many questions they asked
  readonly bySource: { source: string; count: number }[]; // most consulted documents
  readonly recent: string[]; // latest questions
  readonly difficulties: DifficultyArea[]; // areas that MAY need review (Step 19, heuristic)
}

// ============================================================================
//  AGENT TYPES (Step 11) — tool-calling
// ============================================================================
//
//  An AGENT is autonomous: given a goal, IT decides which tools to use and in what
//  order, in a loop, until it's done. For that, the LLM needs a richer contract
//  than `generate(system, user) → text`: we send the LIST of available tools and
//  the model can reply asking to CALL one of them.

/** A tool's "spec" the model can call (schema in the OpenAI/JSON Schema style). */
export interface ToolSpec {
  readonly name: string; // e.g. "ask"
  readonly description: string; // what it does (the model uses this to decide)
  readonly parameters: Record<string, unknown>; // JSON Schema of the arguments
}

/** A request from the model to EXECUTE a tool (the "Act" of the ReAct loop). */
export interface ToolCall {
  readonly id: string; // id that ties the request to the result
  readonly name: string; // which tool to call
  readonly arguments: string; // arguments as JSON (string, as OpenAI returns them)
}

/**
 * A message of the dialogue with the model in chat format. Unlike `Turn`
 * (student/mentor, from memory), here the roles follow the API standard: system,
 * user, assistant and `tool` (the RESULT of a tool returned to the model).
 */
export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string; // text (can be empty when the assistant only requests tools)
  readonly toolCalls?: ToolCall[]; // only on 'assistant' messages requesting tools
  readonly toolCallId?: string; // only on 'tool' messages (ties to the request)
  readonly name?: string; // only on 'tool': the name of the executed tool
}

/** What the LLM returns in a round: either a final text, or tool requests. */
export interface ChatResult {
  readonly content: string; // final answer (empty when there are toolCalls)
  readonly toolCalls: ToolCall[]; // empty when the model already gave the final answer
}

/** A step of the agent's reasoning — for TRACEABILITY (don't make things up). */
export interface AgentStep {
  readonly tool: string; // which tool was called
  readonly arguments: string; // with which arguments (JSON)
  readonly result: string; // what the tool returned
}

/** The agent's result: the final answer + the trace of tools it used. */
export interface AgentResult {
  readonly answer: string; // the final answer to the goal
  readonly steps: AgentStep[]; // the step-by-step (which tools, in what order)
  readonly stoppedByLimit: boolean; // true if it stopped by hitting the iteration cap
}
