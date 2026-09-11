// ============================================================================
//  LocalEmbedder — gera embeddings LOCALMENTE (sem API, sem custo, privado)
// ============================================================================
//
//  O QUE ELE FAZ?
//  Implementa o `EmbedderPort`: recebe uma lista de textos e devolve uma lista
//  de vetores (embeddings). Ele roda um modelo de embeddings DENTRO da sua
//  máquina, usando a biblioteca transformers.js (@huggingface/transformers).
//
//  POR QUE "LOCAL" (e não OpenAI)?  → decisão da Etapa 3b
//    • grátis: não gasta chamada de API;
//    • privado: seus textos não saem do seu computador;
//    • offline: depois de baixar o modelo 1x, funciona sem internet.
//  Trade-off: a 1ª execução BAIXA o modelo (~alguns MB) e o cacheia; e é um
//  pouco mais lento que a nuvem. Para um laboratório de estudo, compensa.
//  (Se um dia quisermos OpenAI, criamos OUTRO adapter — o núcleo nem percebe,
//   porque ambos respeitam o mesmo `EmbedderPort`. Isso é o "D" do SOLID.)
//
//  QUAL MODELO?  Xenova/paraphrase-multilingual-MiniLM-L12-v2
//    • "multilingual" → entende PORTUGUÊS e INGLÊS (nosso material tem os dois);
//    • "MiniLM" → pequeno e rápido (bom p/ rodar no notebook);
//    • gera vetores de 384 dimensões.
//
//  ⚠️ PRÉ-REQUISITO para rodar de verdade (na sua máquina):
//      npm install @huggingface/transformers
//  Os TESTES não usam este adapter (usam o FakeEmbedder), justamente para não
//  baixar modelo nem depender de internet no CI.
// ============================================================================

import type { EmbedderPort } from '../core/ports.ts';

// Importa só o necessário da transformers.js.
// (`type` no import ajuda o editor; o `pipeline` é o que roda de fato.)
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// dtype = precisão numérica com que o modelo roda:
//   'fp32' → precisão total, mais lenta e pesada (padrão do transformers.js).
//   'q8'   → quantizado em 8 bits: bem mais RÁPIDO e leve, com perda mínima de
//            qualidade na busca. É a nossa escolha padrão (velocidade no estudo).
export type EmbedderDtype = 'q8' | 'fp16' | 'fp32';

export class LocalEmbedder implements EmbedderPort {
  // Guardamos o "pipeline" carregado para NÃO recarregar o modelo a cada chamada.
  // Começa nulo e só é criado na 1ª vez que precisamos (lazy loading).
  private extractor: FeatureExtractionPipeline | null = null;
  private readonly dtype: EmbedderDtype;

  constructor(dtype: EmbedderDtype = 'q8') {
    this.dtype = dtype;
  }

  /** Carrega o modelo uma única vez (na 1ª vez, baixa e cacheia). */
  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    // `??=` → só atribui se ainda for null/undefined. Ou seja: carrega 1x.
    // As sobrecargas de `pipeline` geram uma "union complexa demais" para o TS.
    // Encapsulamos numa assinatura simples (só tipagem; em runtime o TS some).
    const criarPipeline = pipeline as unknown as (
      task: 'feature-extraction',
      model: string,
      options: { dtype: EmbedderDtype },
    ) => Promise<FeatureExtractionPipeline>;
    this.extractor ??= await criarPipeline('feature-extraction', MODEL, { dtype: this.dtype });
    return this.extractor;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();

    // pooling: 'mean'  → junta os tokens numa média = 1 vetor por FRASE
    //                    (sem isso, viria 1 vetor por palavra).
    // normalize: true  → deixa todo vetor com "tamanho 1", o que faz a
    //                    similaridade de cosseno ficar estável e comparável.
    const output = await extractor(texts, { pooling: 'mean', normalize: true });

    // A saída é um Tensor; `.tolist()` converte para arrays comuns de números.
    // Para uma lista de N textos, o formato é [N][384].
    return output.tolist() as number[][];
  }

  /**
   * Libera a sessão do modelo (onnxruntime) de forma ordenada.
   * Chamar isto antes de encerrar evita a corrida de threads nativas que causava
   * o aviso "mutex lock failed" na saída do processo.
   */
  async dispose(): Promise<void> {
    const ext = this.extractor as unknown as { dispose?: () => Promise<void> } | null;
    await ext?.dispose?.();
    this.extractor = null;
  }
}
