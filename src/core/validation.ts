// ============================================================================
//  validation — validação/limites de ENTRADA (Etapa 12 — segurança)
// ============================================================================
//
//  POR QUE VALIDAR A PERGUNTA?
//    • Pergunta VAZIA → chamada inútil ao LLM (gasta cota, não ajuda).
//    • Pergunta GIGANTE → prompt enorme = mais custo, mais lentidão e risco de
//      estourar o limite de contexto do modelo. Um teto simples evita isso.
//  "Validar na borda, cedo e com mensagem clara" é higiene básica de segurança.
//
//  É uma função PURA no core (sem I/O) → aplicada tanto no caso de uso quanto na
//  camada MCP, e trivial de testar.
// ============================================================================

/** Erro de entrada inválida (o chamador mandou algo fora das regras). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Teto padrão do tamanho da pergunta (em caracteres). Ajustável via caller. */
export const MAX_QUESTION_LEN = 2000;

/**
 * Valida e NORMALIZA a pergunta: apara espaços, recusa vazio e recusa acima do
 * teto. Devolve o texto já aparado (para o caller usar o valor normalizado).
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
