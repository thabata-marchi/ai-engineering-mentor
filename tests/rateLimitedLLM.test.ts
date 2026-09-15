// Testes dos decorators de rate limit (Etapa 12): provam que eles DELEGAM ao LLM
// real dentro do limite e RECUSAM (sem chamar o inner) quando o limite estoura.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RateLimitedLLM, RateLimitedChatLLM } from '../src/adapters/rateLimitedLLM.ts';
import { RateLimiter, RateLimitError } from '../src/core/rateLimiter.ts';
import type { ToolCallingLLMPort } from '../src/core/ports.ts';
import { FakeLLM } from './helpers/fakeLLM.ts';

test('RateLimitedLLM: delega dentro do limite e recusa ao exceder', async () => {
  const inner = new FakeLLM('ok');
  const rl = new RateLimitedLLM(inner, new RateLimiter({ max: 1, windowMs: 60_000 }));

  assert.equal(await rl.generate('s', 'u'), 'ok'); // 1ª passa
  await assert.rejects(() => rl.generate('s', 'u'), RateLimitError); // 2ª estoura
});

test('RateLimitedChatLLM: não chama o inner quando o limite estourou', async () => {
  let chamadas = 0;
  const inner: ToolCallingLLMPort = {
    async chat() {
      chamadas++;
      return { content: 'x', toolCalls: [] };
    },
  };
  const rl = new RateLimitedChatLLM(inner, new RateLimiter({ max: 1, windowMs: 60_000 }));

  await rl.chat([], []); // 1ª ok
  await assert.rejects(() => rl.chat([], []), RateLimitError);
  assert.equal(chamadas, 1); // o inner só foi chamado na 1ª
});
