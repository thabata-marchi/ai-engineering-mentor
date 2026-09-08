// ============================================================================
//  FakeEmbedder — um "dublê" (test double) do EmbedderPort para os TESTES
// ============================================================================
//
//  POR QUE UM FAKE?
//  O embedder de verdade (LocalEmbedder) precisa BAIXAR um modelo e é lento.
//  Nos testes não queremos isso: queremos algo RÁPIDO, DETERMINÍSTICO (mesmo
//  texto → mesmo vetor sempre) e SEM internet. Então criamos um embedder falso
//  que respeita o MESMO contrato (`EmbedderPort`). Isso só é possível porque o
//  núcleo depende da interface, não da implementação — o "D" do SOLID na prática.
//
//  COMO ELE "FINGE" ENTENDER SIGNIFICADO?
//  Usa uma técnica simples chamada "bag of words" (saco de palavras): cada
//  palavra é mapeada (via hash) para uma posição do vetor, e contamos quantas
//  vezes ela aparece. Efeito prático: textos que COMPARTILHAM palavras geram
//  vetores parecidos → a similaridade de cosseno fica alta. Não é semântica de
//  verdade (não sabe que "carro" ~ "automóvel"), mas é o SUFICIENTE para provar
//  que o encanamento embed → store → search funciona.
// ============================================================================

import type { EmbedderPort } from '../../src/core/ports.ts';

const DIM = 256; // tamanho do vetor falso (fixo). Maior = menos colisões de hash.
const MIN_WORD_LEN = 4; // ignora palavras curtas (o, que, de, ao...) que só geram ruído.

/** hash simples e estável de uma string para um número inteiro. */
function hash(word: string): number {
  let h = 0;
  for (let i = 0; i < word.length; i++) {
    h = (h * 31 + word.charCodeAt(i)) >>> 0; // >>> 0 mantém como inteiro sem sinal
  }
  return h;
}

/** transforma um texto num vetor "bag of words" determinístico. */
function toVector(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  // \p{L}+ (com flag u) captura sequências de letras, inclusive acentuadas.
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  for (const word of words) {
    if (word.length < MIN_WORD_LEN) continue; // pula palavras curtas (stopwords)
    vec[hash(word) % DIM] += 1;
  }
  return vec;
}

export class FakeEmbedder implements EmbedderPort {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(toVector);
  }
}
