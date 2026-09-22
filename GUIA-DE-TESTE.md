# 🧪 Test guide — run the project from zero

A linear walkthrough to test the mentor, from the fastest/most-guaranteed (no key, no
internet) to the most complete. If something fails, see **Troubleshooting** at the end.

> Requires **Node >= 22.6** (ideally 24). Check: `node -v`.

---

## 0. Install
```bash
cd ai-engineering-mentor
npm install
```

## 1. Automated tests (fastest proof — NO key needed)
```bash
npm test          # ~89 tests → all pass + 1 skipped (Mongo, opt-in)
npm run typecheck # checks the types (tsc --noEmit)
```
Uses doubles (fakes) — no quota, no network. If both pass, the core is healthy.

## 2. Demo, no config (see the RAG flow)
```bash
npm run demo
```
Fake embedder and LLM — shows the pipeline (ingestion → search → answer with sources)
without "thinking" for real.

## 3. Run for real (local embedder + live LLM)
Needs an LLM key. Pick your provider and set it in `.env`. **Once:**
```bash
cp .env.example .env
# set LLM_PROVIDER (openrouter | openai | anthropic | gemini) and the matching key,
# e.g. OPENROUTER_API_KEY=sk-or-...  (no quotes, no space around the =)
```
Then:
```bash
npm run ask -- "what is the single responsibility principle?"
```
> The first run downloads the embedding model (~a few MB) and caches it; after that
> it's fast. `.env` is Git-ignored — your key never goes to the repository.
> Answer language: `MENTOR_LANG=en` (default) or `pt`.

## 4. Chat with memory (+ study profile)
```bash
npm run chat
```
It **remembers** the dialogue. Type `/progress` to see what you studied; `exit` quits.

## 5. MCP server
```bash
npm run mcp        # starts the STDIO server and waits for a client
```
Inspect it visually (in another terminal):
```bash
npx @modelcontextprotocol/inspector node --dns-result-order=ipv4first \
  --env-file-if-exists=.env --experimental-strip-types examples/mcp.ts
```
You'll see the `ask` and `my_progress` tools, the resource and the prompt.

## 6. Autonomous agent
```bash
npm run agent -- "help me understand the Single Responsibility Principle"
```
It decides on its own which tools to call and shows the step-by-step.
> Needs a model with **tool-calling** — it uses the `LLM_PROVIDER` provider; pick a
> tool-capable model in `LLM_MODEL` (on OpenRouter, the "Tools" badge at
> https://openrouter.ai/models). Without it, it answers directly (0 steps).

## 7. Quality evaluation
```bash
npm run eval                 # deterministic scorecard (source-hit, citation, mention)
EVAL_JUDGE=1 npm run eval     # + LLM-as-judge (measures faithfulness; uses quota)
EVAL_RUNS=3 npm run eval      # runs each case 3x and averages (reduces noise)
EVAL_TRACE=1 npm run eval     # + live trace of each step
```

## 8. (Optional) MongoDB as the store
```bash
open -a Docker            # open Docker Desktop (wait for it to settle)
docker compose up -d      # starts Mongo + Mongo Express
VECTOR_STORE=mongo npm run ask -- "what is extract function?"
```
See the data at http://localhost:8081. Stop it with: `docker compose down`.

## 9. (Optional) Your own base (PDF/.md/.txt)
```bash
mkdir -p data && cp "my-book.pdf" data/
echo 'DOCS_DIR=./data' >> .env
npm run ask -- "your question about the material"
```

---

## ✅ Smoke test (the minimum to prove it works)
No key/internet: **Step 1** (`npm test`) + **Step 2** (`npm run demo`).
To see it "really thinking": **Step 3** (`npm run ask`).

---

## 🛠️ Troubleshooting

**`<KEY> is missing or looks like a placeholder`**
It's the secret *guard* working. Your key isn't in `.env`, or it's still the
placeholder. Run `cp .env.example .env` and paste the real key in the provider's env
var (the whole key, without `cole-sua-chave`, no quotes). See Step 3.

**404 `This model is unavailable for free`**
A `:free` model rotated to paid. The app **auto-heals** by falling back to
`openrouter/free`. If you pinned `OPENROUTER_MODEL`/`LLM_MODEL`, comment that line in
`.env` or switch to another model.

**Timeout / `This operation was aborted`**
A slow reasoning model + free-tier queue. Increase `LLM_TIMEOUT_MS` in `.env`
(default 120000) or use `LLM_MODEL=openrouter/free`.

**`fetch failed` / `ENOTFOUND`**
Intermittent network / IPv6. The scripts already use `--dns-result-order=ipv4first`; try again.

**`Rate limit exceeded`**
Quota protection (Step 12). Wait a few seconds, or tune `RATE_LIMIT_MAX` /
`RATE_LIMIT_WINDOW_MS` in `.env`.

**Agent answers without using tools (0 steps)**
The chosen model doesn't support tool-calling. Pick a tool-capable model in
`LLM_MODEL` (see Step 6).

**Docker: `Cannot connect to the Docker daemon`**
Docker Desktop isn't running. `open -a Docker`, wait for it to settle and try again.

**`mutex lock failed` crash on exit**
Cosmetic (onnxruntime teardown, happens *after* the output). You can ignore it.
