# 🧠 AI Engineering Mentor (TypeScript)

[![CI](https://github.com/thabata-marchi/ai-engineering-mentor/actions/workflows/ci.yml/badge.svg)](https://github.com/thabata-marchi/ai-engineering-mentor/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D22.6-3c873a)
[![npm](https://img.shields.io/npm/v/@thabata-marchi/ai-engineering-mentor?logo=npm&color=cb3837)](https://www.npmjs.com/package/@thabata-marchi/ai-engineering-mentor)
![License](https://img.shields.io/badge/license-MIT-blue)
![Framework](https://img.shields.io/badge/framework-none%20(from%20scratch)-orange)

An AI programming mentor built **from scratch** in TypeScript: a **RAG** system
(answers grounded in a knowledge base, with source citations), with a **Socratic
method**, exposed as an **MCP server** and consumable by an **autonomous agent** —
all on **hexagonal architecture** with **tests from day one**.

> It's not a chatbot: it's a mentor that **guides the reasoning**, grounds its
> answers in an own knowledge base (RAG) and **cites the sources** (it doesn't make
> things up).

> 🇧🇷 Answers in **English by default**; set `MENTOR_LANG=pt` to have the mentor
> answer in Portuguese. The project was built step by step as a learning log — some
> older commit messages are in Portuguese.

## Highlights (what this project demonstrates)
- **Complete RAG, no framework** — chunking, **local** embeddings (transformers.js),
  cosine-similarity search, grounded prompt and answer **with sources**.
- **Hexagonal architecture + SOLID** — the core depends only on *ports* (interfaces);
  swapping the LLM, database or embedder = swapping 1 adapter. Patterns: Strategy, Decorator, Repository.
- **MCP (Model Context Protocol)** — the mentor becomes a tool for AI (tools
  `ask`/`my_progress`, a resource and a prompt).
- **Autonomous agent** — a ReAct loop with *tool-calling* that **consumes its own MCP**.
- **Study profile + difficulty detection** — the mentor tracks what you study and
  **infers where you may be struggling** (topics you revisit, questions you re-ask,
  points where you flagged confusion) — a pure, deterministic heuristic, not a diagnosis.
- **Real persistence** — MongoDB as vector store, conversation memory and study profile.
- **Multi-provider** — pick your LLM provider (OpenRouter, OpenAI, Anthropic, Gemini) with your own key.
- **Engineering rigor** — rate limiting, validation, observability (tracing),
  **evaluation** (golden dataset + LLM-as-judge) and **prompt-injection guardrails**
  (defense in depth + measured resistance). **~99 tests** (node:test).

> ⚠️ **Study / portfolio project.** The goal is *learning by building*. The
> **knowledge base is not included**: books/PDFs are copyrighted, so you put your
> own into a `data/` folder (Git-ignored). Bring your own material.

**Stack:** TypeScript running **natively** on Node (≥22.6, ideally 24) in dev — no
build step; the published npm package ships compiled JS. Local embeddings via
**transformers.js**; LLM via **OpenRouter / OpenAI / Anthropic / Gemini**; optional
persistence in **MongoDB**; MCP via **@modelcontextprotocol/sdk**; schemas with
**zod**. No LangChain/LangGraph — the orchestration (RAG and agent) is hand-built on
purpose, to understand every piece.

## Quick start (use it as an MCP server via npx)
No cloning required — add this to your MCP client (VS Code, Cursor, Claude Desktop…)
and bring your own key + docs:
```json
{
  "mcpServers": {
    "ai-engineering-mentor": {
      "command": "npx",
      "args": ["-y", "@thabata-marchi/ai-engineering-mentor"],
      "env": {
        "LLM_PROVIDER": "openrouter",
        "OPENROUTER_API_KEY": "sk-or-...",
        "DOCS_DIR": "/path/to/your/docs",
        "MENTOR_LANG": "en"
      }
    }
  }
}
```
The client starts the server; on first run it downloads the embedding model and
indexes your `DOCS_DIR` (PDFs/`.md`/`.txt`). Then the `ask` and `my_progress` tools
show up in your assistant, answering grounded in **your** material with sources.

## How it was built
Step by step, understanding every piece. **Progress (19 steps — complete):**
- [x] **Step 1 — Foundation**: hexagonal skeleton (`core` = models + ports) + tests.
- [x] **Step 2 — Ingestion**: text/Markdown parser + chunking (sliding window).
- [x] **Step 2b — PDF**: `PdfParser` (unpdf) + `FileParser` (extension dispatcher: .pdf/.md/.txt).
- [x] **Step 3a — Vector store**: in-memory vector store + cosine similarity.
- [x] **Step 3b — Embedder**: local embedder (transformers.js, multilingual model) + `FakeEmbedder` for tests.
- [x] **Step 4 — Answer with sources**: `AnswerQuestion` use case (retrieval → grounded prompt → generation) + `FakeLLM` for tests.
- [x] **Step 4b — Real LLM**: `OpenRouterLLM` adapter + CLI `npm run ask` (local embedder + live LLM).
- [x] **Step 5 — Performance**: index persisted to disk (embed once) + q8 embedder + LLM timeout/retry.
- [x] **Step 6 — Socratic method**: guided mentor (question + hint, reveals if you ask); optional `direct` mode (`MODE`).
- [x] **Step 7 — MongoDB**: `MongoVectorStore` (same `VectorStorePort`) — persists vectors in a real database (`VECTOR_STORE=mongo`).
- [x] **Step 8 — Memory**: `MemoryPort` + adapters (memory/Mongo) and **chat mode** (`npm run chat`) — the mentor remembers the dialogue.
- [x] **Step 9 — MCP server**: the mentor exposed over MCP (tool `ask`, resource + prompt) — consumable in VS Code/agents (`npm run mcp`).
- [x] **Step 10 — Student profile**: `ProfilePort` + adapters (memory/Mongo, `study_log` collection) record what you study; 2nd MCP tool `my_progress` and `/progress` command in chat.
- [x] **Step 11 — Agent**: autonomous agent (ReAct loop) that **consumes the MCP** — `ToolCallingLLMPort` + `AgentToolsPort` (MCP client); given a goal, it decides which tools to call (`npm run agent`).
- [x] **Step 12 — Security + publishing**: rate limiting (sliding window), input validation, secret guard + `SECURITY.md` (threat model), and an npm-ready package.
- [x] **Step 13 — Observability + evaluation**: `TracerPort` (local spans: retrieval/generation) + an evaluation harness (`npm run eval`) with a golden dataset and metrics — plus optional **LLM-as-judge**.
- [x] **Step 14 — Guardrails (prompt injection)**: `guardrails.ts` — context delimited as untrusted data + defensive clause in the prompts + detection/flagging of suspicious snippets; adversarial eval cases measure a **resistance rate**.
- [x] **Step 15 — npx distribution**: build `tsc → dist/` (plain JS; `rewriteRelativeImportExtensions` keeps native TS in dev) + a `bin` — run the MCP server via `npx`, no cloning (bring your own docs via `DOCS_DIR`).
- [x] **Step 16 — Multi-provider**: pick the LLM provider (`LLM_PROVIDER=openrouter|openai|anthropic|gemini`) and use **your** key — `OpenAICompatibleLLM` (OpenAI/Gemini) and `AnthropicLLM` behind the same `LLMPort`, chosen by a factory.
- [x] **Step 17 — Multi-provider tool-calling**: the **agent** also respects `LLM_PROVIDER` — `OpenAICompatibleChatLLM` and `AnthropicChatLLM` behind `ToolCallingLLMPort`, via `createChatLLM`.
- [x] **Step 18 — Language option**: the mentor answers in **English by default**; `MENTOR_LANG=pt` switches to Portuguese (system prompts built per `[language][mode]`).
- [x] **Step 19 — Difficulty detection**: `core/difficulty.ts` — a pure, deterministic heuristic over the study profile that infers **areas that may need review** from four signals (revisited sources, recurring topics, re-asked questions via lexical similarity, and explicit confusion markers in PT/EN). Surfaced in the `my_progress` tool and the `/progress` chat command. It flags *patterns*, not a diagnosis (semantic matching via the embedder is a natural next step).

## Structure
```
src/core/         → pure logic (models, ports, chunker, similarity). Depends on nothing external.
src/adapters/     → concrete implementations (parser, embeddings, vectors, LLM, MCP tools).
src/application/  → use cases (AnswerQuestion, MentorAgent) — orchestrate the pieces.
src/mcp/          → the mentor exposed as an MCP server (tools/resource/prompt).
src/index.ts      → public API (barrel) for importers.
examples/         → executables: demo, ask, chat, mcp, agent, eval (+ golden.json).
tests/            → tests from day one (node:test); tests/helpers = doubles (fakes).
```

**Flow (overview):**
```
files → parse → chunks → embeddings → vector store
                                          │
question → embed → top-k search → grounded prompt → LLM → answer + sources
                                          │
             MCP (ask/my_progress) ← agent (ReAct loop)
```

## Run the tests
```bash
npm install     # installs @types/node + typescript (editor help). Optional to run.
npm test        # runs the tests with Node's native test runner
```
> Requires **Node >= 22.6** (ideally Node 24). TypeScript runs **natively**, without
> transpiling, thanks to the `--experimental-strip-types` flag (already set in the `test` script).

## See it work (from a local clone)

> 📋 **Want a linear "test from zero" walkthrough with troubleshooting?** See
> [`GUIA-DE-TESTE.md`](./GUIA-DE-TESTE.md).

**Demo, no config** (uses doubles — shows the flow, doesn't "think"):
```bash
npm run demo
```

**Run for real** (local embedder + live LLM):
```bash
npm install                       # downloads transformers.js
cp .env.example .env              # create your .env (Git-ignored)
# edit .env: set LLM_PROVIDER + the matching key (see below)
npm run ask -- "what is the single responsibility principle?"
```

**Pick the LLM provider** (Step 16 — use your key): in `.env`, set `LLM_PROVIDER`
and the matching key. All go through the same `LLMPort`:
```bash
# OpenRouter (default) — 1 key, routes to GPT/Claude/Gemini via OPENROUTER_MODEL
LLM_PROVIDER=openrouter   OPENROUTER_API_KEY=sk-or-...
# Native OpenAI
LLM_PROVIDER=openai       OPENAI_API_KEY=sk-...        LLM_MODEL=gpt-4o-mini
# Native Anthropic (Claude)
LLM_PROVIDER=anthropic    ANTHROPIC_API_KEY=sk-ant-... LLM_MODEL=claude-3-5-sonnet-latest
# Native Google Gemini
LLM_PROVIDER=gemini       GEMINI_API_KEY=...           LLM_MODEL=gemini-2.0-flash
```
> Model names change over time — set `LLM_MODEL` per provider. Tip: on OpenRouter you
> already reach GPT/Claude/Gemini by just changing `OPENROUTER_MODEL`, with **one**
> key. The native providers are for people who prefer using each own account.
> **Answer language:** `MENTOR_LANG=en` (default) or `pt`.

**Chat with memory** (Step 8 — the mentor remembers the dialogue):
```bash
npm run chat        # opens a loop; type, it answers and REMEMBERS. "sair" quits.
```
> With `VECTOR_STORE=mongo`, the conversation is saved in Mongo's `conversations`
> collection. The session is `SESSION_ID` (default `default`). Type **`/progress`**
> to see what you've been studying (Step 10 — student profile) plus **areas that may
> need review** (Step 19 — difficulty detection). With Mongo it persists in the
> `study_log` collection.

**Use as an MCP server, from a clone** (Step 9):
```bash
npm run mcp                         # starts the MCP server (STDIO). Waits for a client.
```
In **VS Code**: open this folder as a project — `.vscode/mcp.json` already registers
the `ai-engineering-mentor` server. The editor shows the `ask` and `my_progress`
tools, the `mentor://base` resource and the `guided-study` prompt. To inspect it
manually, use the MCP Inspector pointing at **node directly** (don't use `npm run`
here — npm's banner pollutes STDIO):
```bash
npx @modelcontextprotocol/inspector node --dns-result-order=ipv4first \
  --env-file-if-exists=.env --experimental-strip-types examples/mcp.ts
```

**Use as an autonomous agent** (Step 11 — it decides which tools to call):
```bash
npm run agent -- "help me understand Extract Function"
```
> The agent connects an MCP client to the mentor's own server (in memory) and uses
> the `ask`/`my_progress` tools in a ReAct loop until it answers — showing the real
> step-by-step (traceability). Unlike `ask`/`chat` (where WE define the flow), here
> **the model decides** the actions.
> ⚠️ Needs a model with reliable **tool-calling**. The agent uses the `LLM_PROVIDER`
> provider (Step 17) — works with OpenAI, Gemini, Claude or OpenRouter; pick a
> tool-capable model in `LLM_MODEL` (on OpenRouter, look for "Tools"). If the model
> ignores the tools, the agent answers directly (no steps) — visible, not silent.

**Use MongoDB as vector store** (Step 7 — persists vectors in a real database):
```bash
open -a Docker            # 1. open Docker Desktop (wait for the whale to settle)
docker compose up -d      # 2. start Mongo + Mongo Express (uses docker-compose.yml)
docker compose ps         # 3. check: both should be "running"
VECTOR_STORE=mongo npm run ask -- "what is extract function?"   # 4. run with Mongo
```
> Inspect the data at **http://localhost:8081** (Mongo Express). Stop it with
> `docker compose down` (data stays in the volume). Needs **Docker** (or an installed
> MongoDB). The core doesn't change: the same software runs over the database by
> swapping the adapter (`VECTOR_STORE=mongo`). ⚠️ Local Mongo Community computes
> similarity **in the app** (native vector search is Atlas-only).

**Use your own material (PDF, .md, .txt):**
Put the files in a `data/` folder (Git-ignored) and point to it:
```bash
mkdir -p data && cp "my-book.pdf" data/
echo 'DOCS_DIR=./data' >> .env
npm run ask -- "your question about the material"
```
> Large PDFs (hundreds of pages) generate many chunks and the first indexing takes a
> while. After that the index is saved to `data/vectorstore/index.json` and later runs
> are **instant** — it only re-indexes if you change the files or the configuration.

**Evaluate the quality** (Step 13 — "answers" ≠ "answers well"):
```bash
npm run eval                                   # default dataset (paired with examples/docs)
DOCS_DIR=./examples/docs npm run eval          # ensures the base that matches the default dataset
npm run eval -- examples/golden.fowler.json    # a dataset tailored to your base
EVAL_JUDGE=1 npm run eval                       # + LLM-as-judge (measures faithfulness; uses quota)
EVAL_RUNS=3 npm run eval                         # runs each case 3x and AVERAGES (reduces noise)
EVAL_TRACE=1 npm run eval                       # + live trace of each step (retrieval/generation)
```
> ⚠️ **Free models are non-deterministic** — generation metrics (citation, mention,
> faithfulness) fluctuate between runs. Use `EVAL_RUNS=N` to average N runs per case
> instead of trusting a single run. The deterministic metrics (source-hit, resistance)
> are stable.
> Deterministic metrics (run for free): **source-hit** (did the expected source show
> up in retrieval?), **citation** (did it cite `[n]`?), **mention** (did it bring the
> key terms?) and **resistance** (Step 14 — did it resist injection?).
> ⚠️ **The dataset must match the base** (`DOCS_DIR`): `expectedSources` are the
> indexed file names. Mismatched dataset/base → **source-hit 0%** (not a retrieval
> failure, a wrong comparison). With a **single-source base** (e.g. one book),
> source-hit trends to 100% and the strong signal becomes mention/citation/faithfulness.

## Security (Step 12)
Hardening proportional to the context (runs **locally over STDIO**, no network):
- **Rate limiting** — a sliding-window limiter protects your provider quota and contains
  a runaway agent. Tune with `RATE_LIMIT_MAX` (default 20) and `RATE_LIMIT_WINDOW_MS`
  (default 60000). RAG and agent share the same cap.
- **Input validation** — empty questions are rejected and there's a size cap
  (`MAX_QUESTION_LEN`, also in the MCP tool's zod schema).
- **Secrets** — key only via `.env` (Git-ignored); a *guard* warns early if it looks
  like a placeholder. Details and threat model in [`SECURITY.md`](./SECURITY.md).
- **Prompt-injection guardrails (Step 14)** — retrieved context is delimited and treated
  as **untrusted data**; the prompts instruct the model not to obey commands coming from
  documents; suspicious snippets are detected and flagged; and `npm run eval` measures the
  **resistance rate**. It's *partial* mitigation (no defense is 100%) — see `SECURITY.md`.
> Auth/token was **not** implemented on purpose: on a local STDIO server it adds no real
> security (it would only make sense when exposed over HTTP). See `SECURITY.md`.

## Publishing (npm / open source)
The package is publish-ready (`files`, `exports`, `bin`, `prepublishOnly` running
typecheck + tests + build). The step-by-step — which **you** run, since it involves
login and publishing — is in [`PUBLISHING.md`](./PUBLISHING.md). To inspect what would
go in the package without publishing: `npm pack --dry-run`.

## License
MIT — see [`LICENSE`](./LICENSE).
