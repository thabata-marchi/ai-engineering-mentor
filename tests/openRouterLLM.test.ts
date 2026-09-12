// Testes do OpenRouterLLM SEM tocar na rede: substituímos o `fetch` global por
// um dublê que devolve uma resposta fixa. Assim testamos que o adapter monta a
// requisição certa (URL, header, body) e sabe LER a resposta — sem gastar chave.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OpenRouterLLM } from '../src/adapters/openRouterLLM.ts';

/** Troca o fetch global por um dublê e devolve o que ele registrou + um restore. */
function stubFetch(responseBody: unknown, ok = true, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      ok,
      status,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    } as Response;
  }) as typeof fetch;

  return { calls, restore: () => (globalThis.fetch = original) };
}

test('monta a requisição certa e lê a resposta do modelo', async () => {
  const { calls, restore } = stubFetch({
    choices: [{ message: { content: 'resposta do modelo' } }],
  });

  try {
    const llm = new OpenRouterLLM({ apiKey: 'chave-de-teste', model: 'modelo/x:free' });
    const texto = await llm.generate('regras do sistema', 'pergunta do usuário');

    // 1. Leu o conteúdo certo.
    assert.equal(texto, 'resposta do modelo');

    // 2. Chamou o endpoint certo com o header de autorização.
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /openrouter\.ai\/api\/v1\/chat\/completions/);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer chave-de-teste');

    // 3. Enviou os dois papéis (system + user) no body.
    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.model, 'modelo/x:free');
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[1].role, 'user');
    assert.equal(body.messages[1].content, 'pergunta do usuário');
  } finally {
    restore();
  }
});

test('erro HTTP vira mensagem clara', async () => {
  const { restore } = stubFetch({ error: 'sem créditos' }, false, 429);
  try {
    const llm = new OpenRouterLLM({ apiKey: 'x' });
    await assert.rejects(() => llm.generate('s', 'u'), /429/);
  } finally {
    restore();
  }
});

test('chave vazia falha cedo, com instrução', () => {
  assert.throws(() => new OpenRouterLLM({ apiKey: '' }), /OPENROUTER_API_KEY/);
});

test('modelo fora do gratuito (404) → cai automaticamente no auto-router', async () => {
  // fetch dublê que responde conforme o modelo do body: o modelo fixado dá 404
  // ("unavailable for free"); o auto-router "openrouter/free" responde 200.
  const modelosChamados: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const model = JSON.parse(init.body as string).model as string;
    modelosChamados.push(model);
    if (model !== 'openrouter/free') {
      return {
        ok: false,
        status: 404,
        text: async () => 'This model is unavailable for free.',
        json: async () => ({}),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'resposta do fallback' } }] }),
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  try {
    const llm = new OpenRouterLLM({ apiKey: 'x', model: 'algum/modelo-morto:free' });
    const texto = await llm.generate('s', 'u');
    assert.equal(texto, 'resposta do fallback'); // conseguiu responder mesmo assim
    assert.deepEqual(modelosChamados, ['algum/modelo-morto:free', 'openrouter/free']);
  } finally {
    globalThis.fetch = original;
  }
});
