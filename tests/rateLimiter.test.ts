// Testes do RateLimiter (Etapa 12). Controlamos o "relógio" (now injetável)
// para testar o tempo sem esperar de verdade — determinístico e instantâneo.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RateLimiter, RateLimitError } from '../src/core/rateLimiter.ts';

test('permite até o limite e recusa a próxima', () => {
  let t = 1000;
  const rl = new RateLimiter({ max: 3, windowMs: 60_000, now: () => t });

  rl.acquire();
  rl.acquire();
  rl.acquire(); // 3 ok
  assert.equal(rl.remaining(), 0);
  assert.throws(() => rl.acquire(), RateLimitError); // a 4ª estoura
});

test('a janela desliza: chamadas antigas saem e liberam espaço', () => {
  let t = 0;
  const rl = new RateLimiter({ max: 2, windowMs: 1000, now: () => t });

  rl.acquire(); // t=0
  rl.acquire(); // t=0
  assert.throws(() => rl.acquire(), RateLimitError);

  t = 1001; // passou da janela → os dois registros expiram
  rl.acquire(); // agora cabe de novo
  assert.equal(rl.remaining(), 1);
});

test('RateLimitError informa quanto esperar (retryAfterMs)', () => {
  let t = 0;
  const rl = new RateLimiter({ max: 1, windowMs: 5000, now: () => t });
  rl.acquire(); // t=0
  t = 2000;
  try {
    rl.acquire();
    assert.fail('deveria ter lançado');
  } catch (err) {
    assert.ok(err instanceof RateLimitError);
    // o registro de t=0 expira em t=5000 → faltam 3000ms
    assert.equal(err.retryAfterMs, 3000);
  }
});

test('configuração inválida falha cedo', () => {
  assert.throws(() => new RateLimiter({ max: 0, windowMs: 1000 }), /max/);
  assert.throws(() => new RateLimiter({ max: 1, windowMs: 0 }), /windowMs/);
});
