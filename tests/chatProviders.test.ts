// Testes do tool-calling multi-provedor (Etapa 17): os adapters montam a
// requisição no formato certo de cada provedor e leem os tool_calls — fetch dublê.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OpenAICompatibleChatLLM } from '../src/adapters/openAICompatibleChatLLM.ts';
import { AnthropicChatLLM } from '../src/adapters/anthropicChatLLM.ts';
import { createChatLLM } from '../src/adapters/llmFactory.ts';
import { OpenRouterChatLLM } from '../src/adapters/openRouterChatLLM.ts';
import type { ChatMessage, ToolSpec } from '../src/core/models.ts';

function stubFetch(responseBody: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => responseBody, text: async () => '' } as Response;
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

const TOOLS: ToolSpec[] = [
  { name: 'perguntar', description: 'consulta a base', parameters: { type: 'object', properties: {} } },
];

test('OpenAICompatibleChatLLM: envia tools e lê tool_calls (formato OpenAI)', async () => {
  const { calls, restore } = stubFetch({
    choices: [{ message: { content: '', tool_calls: [{ id: 'c1', function: { name: 'perguntar', arguments: '{"pergunta":"x"}' } }] } }],
  });
  try {
    const llm = new OpenAICompatibleChatLLM({
      apiKey: 'k'.repeat(12), baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini',
    });
    const res = await llm.chat([{ role: 'user', content: 'oi' }], TOOLS);
    assert.equal(res.toolCalls.length, 1);
    assert.equal(res.toolCalls[0].name, 'perguntar');
    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.tools[0].type, 'function');
    assert.equal(body.tools[0].function.name, 'perguntar');
  } finally {
    restore();
  }
});

test('AnthropicChatLLM: mapeia tools/mensagens e lê blocos tool_use', async () => {
  const { calls, restore } = stubFetch({
    content: [{ type: 'tool_use', id: 'tu1', name: 'perguntar', input: { pergunta: 'x' } }],
  });
  try {
    const llm = new AnthropicChatLLM({ apiKey: 'k'.repeat(12), model: 'claude-3-5-sonnet-latest' });
    // Inclui system + user + um resultado de tool anterior (para exercitar o mapeamento).
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'seja um mentor' },
      { role: 'user', content: 'estudar SRP' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'tu0', name: 'perguntar', arguments: '{}' }] },
      { role: 'tool', toolCallId: 'tu0', name: 'perguntar', content: 'SRP: uma responsabilidade' },
    ];
    const res = await llm.chat(msgs, TOOLS);
    assert.equal(res.toolCalls[0].name, 'perguntar');
    assert.equal(res.toolCalls[0].id, 'tu1');

    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.system, 'seja um mentor'); // system é campo próprio
    assert.equal(body.tools[0].input_schema.type, 'object'); // usa input_schema
    // O resultado da tool vira uma mensagem 'user' com bloco tool_result.
    const toolResultMsg = body.messages.find(
      (m: { content?: unknown }) => Array.isArray(m.content) && m.content.some((b: { type: string }) => b.type === 'tool_result'),
    );
    assert.ok(toolResultMsg, 'deve haver uma mensagem com tool_result');
  } finally {
    restore();
  }
});

test('createChatLLM: escolhe o adapter de tool-calling certo por provedor', () => {
  assert.ok(createChatLLM({ provider: 'openrouter', apiKey: 'k'.repeat(12) }) instanceof OpenRouterChatLLM);
  assert.ok(createChatLLM({ provider: 'openai', apiKey: 'k'.repeat(12) }) instanceof OpenAICompatibleChatLLM);
  assert.ok(createChatLLM({ provider: 'gemini', apiKey: 'k'.repeat(12) }) instanceof OpenAICompatibleChatLLM);
  assert.ok(createChatLLM({ provider: 'anthropic', apiKey: 'k'.repeat(12) }) instanceof AnthropicChatLLM);
});
