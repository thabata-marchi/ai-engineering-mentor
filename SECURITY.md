# Security Policy

> Study project (AI Engineering postgrad — UNIPDS). This document describes the
> **threat model** and the security decisions honestly and proportionally to the
> context: the mentor runs **locally** and communicates over **STDIO** (it does not
> expose a network by default).

## Threat model (what we protect, and what we don't)

**Current context:** the MCP server runs as a local process; the client (VS Code,
an agent) talks to it over standard input/output (STDIO). There is no open network port.

Honest consequence: **auth/token adds no real security here** — anyone with access
to your terminal can already run anything. So we *don't* implement auth/token at this
stage (it would be "security theater"). A token only starts to make sense if we ever
expose the server over **HTTP** to other machines — then auth, TLS and origin control
come in (out of the current scope).

### Threats we ADDRESS
- **Secret leak (the provider key).** The key comes from an environment variable
  (e.g. `OPENROUTER_API_KEY`), injected into the adapter — it never lives in the code.
  `.env` is Git-ignored (`.gitignore`), and there is a *guard* in setup that **warns**
  if the key looks like a placeholder or is empty.
- **Quota / cost abuse (a burst of calls).** A local **rate limiter** (sliding window)
  cuts excessive LLM calls before they reach the API — it protects your free quota and
  contains a runaway agent. Tune with `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`.
- **Malformed input / giant prompt.** Edge validation: an empty question is rejected;
  there's a size cap (`MAX_QUESTION_LEN`, also in the MCP tool's zod schema) to avoid
  context blow-up and cost.
- **Indirect prompt injection (via documents) — PARTIALLY mitigated (Step 14).**
  Retrieved content may contain malicious instructions. Defense in depth, in
  `src/core/guardrails.ts`:
  1. **Delimiting** — the context is fenced with markers (`CONTEXT_OPEN/CLOSE`) in the
     prompt, making clear where the untrusted DATA starts/ends.
  2. **Defensive clause** — the system prompts instruct the model to treat everything
     between the delimiters as data and to **never obey commands** coming from there.
  3. **Detection + flagging** — `detectInjection()` marks snippets with known patterns
     ("ignore the instructions", "you are now", "system:", "reveal the prompt"...) with
     a visible warning in the prompt; the retrieval span records how many snippets were
     flagged (observability).
  4. **Testable security** — the golden dataset has adversarial case(s) and the
     evaluation measures the **resistance rate** (`npm run eval`).
  ⚠️ **Honesty:** this REDUCES the risk, it doesn't eliminate it — no prompt-injection
  defense is 100%. And the MCP tools are **read-only**, which limits the damage of a
  successful injection.
- **Copyright.** The knowledge base (books/PDFs) is **not** versioned (the `data/`
  folder is in `.gitignore`) — each person brings their own material.

### Threats OUT of scope (for now)
- Multi-user authentication/authorization and HTTP transport.
- Data isolation between users in Mongo (today `SESSION_ID`/`studentId` is a
  convention, not a security boundary).
- OUTPUT filtering and content moderation (the model's answer doesn't go through a
  post-generation check).
- COMPLETE defense against prompt injection (we only have partial mitigation — see above).

## Good practices when using it
- Never paste the API key into code, commits, issues or chat. Use `.env`.
- If you ever expose the server over the network, **do not** do it without auth + TLS.
- Rotate your provider key if you suspect a leak (in the provider's dashboard).

## Reporting a vulnerability
As this is a study project, open an *issue* in the repository describing the problem
(without including secrets). For something sensitive, mark it as such in the title.
