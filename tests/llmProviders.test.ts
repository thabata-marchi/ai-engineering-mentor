// Testes do multi-provedor (Etapa 16): os adapters montam a requisição certa e
// leem a resposta, e a factory escolhe o adapter certo por provedor — tudo com
// `fetch` dublê (sem rede, sem chave real).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OpenAICompatibleLLM } from '../src/adapters/openAICompatibleLLM.ts';
import { AnthropicLLM } from '../src/adapters/anthropicLLM.ts';
import { createLLM } from '../src/adapters/llmFactory.ts';
import { OpenRouterLLM } from '../src/adapters/openRouterLLM.ts';

/** Troca o fetch global por um dublê que captura a chamada e devolve um corpo fixo. */
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

test('OpenAICompatibleLLM: usa baseUrl, Bearer e lê choices[].message.content', async () => {
  const { calls, restore } = stubFetch({ choices: [{ message: { content: 'resp OpenAI' } }] });
  try {
    const llm = new OpenAICompatibleLLM({
      apiKey: 'chave-openai-teste',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      providerName: 'OpenAI',
    });
    const texto = await llm.generate('regras', 'pergunta');
    assert.equal(texto, 'resp OpenAI');
    assert.match(calls[0].url, /api\.openai\.com/);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer chave-openai-teste');
    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.messages[0].role, 'system');
  } finally {
    restore();
  }
});

test('AnthropicLLM: usa x-api-key/anthropic-version, system separado, lê content[].text', async () => {
  const { calls, restore } = stubFetch({ content: [{ type: 'text', text: 'resp Claude' }] });
  try {
    const llm = new AnthropicLLM({ apiKey: 'chave-anthropic', model: 'claude-3-5-sonnet-latest' });
    const texto = await llm.generate('regras do sistema', 'pergunta');
    assert.equal(texto, 'resp Claude');
    assert.match(calls[0].url, /api\.anthropic\.com\/v1\/messages/);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers['x-api-key'], 'chave-anthropic');
    assert.ok(headers['anthropic-version']);
    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.system, 'regras do sistema'); // system é campo próprio
    assert.equal(body.messages[0].role, 'user');
    assert.ok(body.max_tokens > 0);
  } finally {
    restore();
  }
});

test('factory: escolhe o adapter certo por provedor', () => {
  assert.ok(createLLM({ provider: 'openrouter', apiKey: 'x'.repeat(12) }) instanceof OpenRouterLLM);
  assert.ok(createLLM({ provider: 'openai', apiKey: 'x'.repeat(12) }) instanceof OpenAICompatibleLLM);
  assert.ok(createLLM({ provider: 'gemini', apiKey: 'x'.repeat(12) }) instanceof OpenAICompatibleLLM);
  assert.ok(createLLM({ provider: 'anthropic', apiKey: 'x'.repeat(12) }) instanceof AnthropicLLM);
});

test('factory: openai e gemini apontam para baseUrls diferentes', async () => {
  const { calls, restore } = stubFetch({ choices: [{ message: { content: 'ok' } }] });
  try {
    await createLLM({ provider: 'openai', apiKey: 'chave123456789' }).generate('s', 'u');
    await createLLM({ provider: 'gemini', apiKey: 'chave123456789' }).generate('s', 'u');
    assert.match(calls[0].url, /api\.openai\.com/);
    assert.match(calls[1].url, /generativelanguage\.googleapis\.com/);
  } finally {
    restore();
  }
});
