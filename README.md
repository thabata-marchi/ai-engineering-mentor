# 🧠 AI Engineering Mentor (TypeScript)

Mentor de programação com IA (RAG + método socrático) — **laboratório de estudo**
da pós em Engenharia de IA + fundamentos de Engenharia de Software.

> Não é um chatbot: é um mentor que **conduz o raciocínio**, ancora as respostas
> numa base de conhecimento própria (RAG) e **cita as fontes**.

**Stack:** TypeScript + Node (24) — a mesma linguagem do curso. LangChain.js /
LangGraph.js + OpenRouter entram nas próximas etapas.

## Como estamos construindo
Etapa por etapa, entendendo cada peça. Ver `ANALISE-ARQUITETURA.md` (a análise completa)
e `GUIA-ETAPA-1.md` (passo a passo da Etapa 1).

**Progresso (Fase 1 — RAG MVP):**
- [x] **Etapa 1 — Fundação**: esqueleto hexagonal (`core` = models + ports) + testes.
- [x] **Etapa 2 — Ingestão**: parser de texto/Markdown + chunking (sliding window). *(PDF fica pra Etapa 2b.)*
- [x] **Etapa 3a — Vector Store**: banco de vetores em memória + similaridade de cosseno.
- [ ] Etapa 3b — Embedder real (escolher OpenAI × local).
- [ ] Etapa 4 — Retrieval + resposta com fontes.

## Estrutura
```
src/core/      → lógica pura (models.ts, ports.ts). NÃO depende de nada externo.
src/adapters/  → implementações concretas (PDF, embeddings, vetores, LLM). [próximas etapas]
tests/         → testes desde o dia 1 (node:test).
```

## Rodar os testes
```bash
npm install     # instala @types/node + typescript (ajudam o editor). Opcional p/ rodar.
npm test        # roda os testes com o test runner nativo do Node
```
> Requer **Node >= 22.6** (ideal Node 24). O TypeScript roda **nativo**, sem transpilar,
> graças à flag `--experimental-strip-types` (já configurada no script `test`).

## Entendendo o `package.json`
> ⚠️ O `package.json` é um arquivo **JSON**, e **JSON não aceita comentários** (`//`
> quebraria o arquivo). Por isso a explicação de cada campo fica aqui:

- **`"type": "module"`** → o projeto usa `import/export` (ES Modules), não o `require` antigo.
- **`"engines": { "node": ">=22.6.0" }`** → declara a versão mínima do Node (pra rodar TS nativo).
- **`"scripts"`** → atalhos de terminal:
  - `npm test` → `node --experimental-strip-types --test tests/*.test.ts` (roda TS direto + test runner nativo).
  - `npm run test:watch` → re-roda os testes ao salvar.
- **`"devDependencies"`** → só de **desenvolvimento** (não vão pro produto final):
  - `@types/node` → dá autocomplete/tipos do Node no editor.
  - `typescript` → deixa o editor checar os tipos.
