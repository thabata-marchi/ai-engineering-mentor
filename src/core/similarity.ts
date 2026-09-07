// ============================================================================
//  SIMILARIDADE — a matemática por trás da "busca por significado" do RAG
// ============================================================================
//
//  O QUE É UM EMBEDDING (pra dar contexto)?
//  Um embedding é uma lista de números (um "vetor") que representa o SIGNIFICADO
//  de um texto. Textos parecidos geram vetores parecidos (apontam para direções
//  próximas no espaço). É assim que o RAG acha o trecho certo mesmo quando as
//  palavras são diferentes.
//
//  COMO MEDIMOS "PARECIDO"? Similaridade de cosseno.
//  Imagine cada vetor como uma FLECHA saindo da origem. A similaridade de cosseno
//  mede o ÂNGULO entre duas flechas (ignorando o tamanho delas):
//    • flechas na MESMA direção  → cosseno = 1   (muito parecido)
//    • flechas PERPENDICULARES   → cosseno = 0   (sem relação)
//    • flechas OPOSTAS           → cosseno = -1  (contrário)
//
//  Fórmula:  cos(a, b) = (a · b) / (‖a‖ × ‖b‖)
//    • a · b  = produto escalar (soma de a[i] * b[i])
//    • ‖a‖    = "tamanho" (norma) do vetor = raiz da soma dos quadrados
//
//  É PURA MATEMÁTICA (sem I/O), então mora no core e é fácil de testar.
// ============================================================================

/**
 * Calcula a similaridade de cosseno entre dois vetores.
 * Retorna um número entre -1 (opostos) e 1 (idênticos em direção).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vetores de tamanhos diferentes (${a.length} vs ${b.length}). ` +
        'Isso costuma significar que foram gerados por modelos de embedding diferentes.',
    );
  }

  let dotProduct = 0; // a · b
  let normA = 0; // ‖a‖² (somamos os quadrados; tiramos a raiz no fim)
  let normB = 0; // ‖b‖²

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // Vetor "zero" não tem direção → evitamos dividir por zero.
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
