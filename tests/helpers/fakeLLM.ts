// ============================================================================
//  FakeLLM — dublê (test double) do LLMPort para os testes
// ============================================================================
//
//  POR QUE UM FAKE DE LLM?
//  Chamar um LLM de verdade nos testes seria lento, custaria dinheiro e daria
//  respostas DIFERENTES a cada vez (não-determinístico) — péssimo para teste.
//  Este fake devolve sempre um texto fixo E guarda os prompts que recebeu, para
//  o teste poder verificar QUE contexto foi enviado ao modelo (grounding).
//
//  Ele respeita o mesmo contrato `LLMPort`, então o caso de uso nem percebe que
//  está falando com um dublê — de novo, o "D" do SOLID nos deixa testar de graça.
// ============================================================================

import type { LLMPort } from '../../src/core/ports.ts';

export class FakeLLM implements LLMPort {
  // Guardamos o que foi enviado, para os testes inspecionarem.
  public lastSystemPrompt = '';
  public lastUserPrompt = '';

  // Texto fixo que o fake sempre "responde".
  private readonly cannedAnswer: string;

  constructor(cannedAnswer = 'resposta simulada do LLM') {
    this.cannedAnswer = cannedAnswer;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    this.lastSystemPrompt = systemPrompt;
    this.lastUserPrompt = userPrompt;
    return this.cannedAnswer;
  }
}
