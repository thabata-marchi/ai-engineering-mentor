// ============================================================================
//  LocalEmbedder — generates embeddings LOCALLY (no API, no cost, private)
// ============================================================================
//
//  WHAT DOES IT DO?
//  It implements `EmbedderPort`: takes a list of texts and returns a list of
//  vectors (embeddings). It runs an embedding model INSIDE your machine, using the
//  transformers.js library (@huggingface/transformers).
//
//  WHY "LOCAL" (and not OpenAI)?  → Step 3b decision
//    • free: it doesn't spend an API call;
//    • private: your texts don't leave your computer;
//    • offline: after downloading the model once, it works without internet.
//  Trade-off: the first run DOWNLOADS the model (~a few MB) and caches it; and it's
//  a bit slower than the cloud. For a study lab, it pays off.
//  (If we ever want OpenAI, we create ANOTHER adapter — the core doesn't even
//   notice, because both honor the same `EmbedderPort`. That's the "D" of SOLID.)
//
//  WHICH MODEL?  Xenova/paraphrase-multilingual-MiniLM-L12-v2
//    • "multilingual" → understands PORTUGUESE and ENGLISH (our material has both);
//    • "MiniLM" → small and fast (good to run on a laptop);
//    • produces 384-dimension vectors.
//
//  ⚠️ PREREQUISITE to run for real (on your machine):
//      npm install @huggingface/transformers
//  The TESTS don't use this adapter (they use FakeEmbedder), precisely to avoid
//  downloading a model or depending on the internet in CI.
// ============================================================================

import type { EmbedderPort } from '../core/ports.ts';

// Import only what's needed from transformers.js.
// (`type` in the import helps the editor; `pipeline` is what actually runs.)
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// dtype = numeric precision the model runs with:
//   'fp32' → full precision, slower and heavier (transformers.js default).
//   'q8'   → 8-bit quantized: much FASTER and lighter, with minimal loss of search
//            quality. It's our default choice (speed during study).
export type EmbedderDtype = 'q8' | 'fp16' | 'fp32';

export class LocalEmbedder implements EmbedderPort {
  // We keep the loaded "pipeline" so we DON'T reload the model on every call. It
  // starts null and is created only the first time we need it (lazy loading).
  private extractor: FeatureExtractionPipeline | null = null;
  private readonly dtype: EmbedderDtype;

  constructor(dtype: EmbedderDtype = 'q8') {
    this.dtype = dtype;
  }

  /** Loads the model only once (on the first time, it downloads and caches). */
  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    // `??=` → only assigns if still null/undefined. That is: loads once.
    // The overloads of `pipeline` produce a "too complex union" for TS. We wrap it
    // in a simple signature (types only; at runtime TS disappears).
    const createPipeline = pipeline as unknown as (
      task: 'feature-extraction',
      model: string,
      options: { dtype: EmbedderDtype },
    ) => Promise<FeatureExtractionPipeline>;
    this.extractor ??= await createPipeline('feature-extraction', MODEL, { dtype: this.dtype });
    return this.extractor;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();

    // pooling: 'mean'  → merges the tokens into an average = 1 vector per SENTENCE
    //                    (without it, it would be 1 vector per word).
    // normalize: true  → makes every vector "length 1", which keeps cosine
    //                    similarity stable and comparable.
    const output = await extractor(texts, { pooling: 'mean', normalize: true });

    // The output is a Tensor; `.tolist()` converts it to plain arrays of numbers.
    // For a list of N texts, the shape is [N][384].
    return output.tolist() as number[][];
  }

  /**
   * Releases the model session (onnxruntime) in an orderly way. Calling this before
   * shutting down avoids the native-thread race that caused the "mutex lock failed"
   * warning on process exit.
   */
  async dispose(): Promise<void> {
    const ext = this.extractor as unknown as { dispose?: () => Promise<void> } | null;
    await ext?.dispose?.();
    this.extractor = null;
  }
}
