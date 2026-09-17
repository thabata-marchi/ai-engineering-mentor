# 🧠 AI Engineering Mentor (TypeScript)

[![CI](https://github.com/thabata-marchi/ai-engineering-mentor/actions/workflows/ci.yml/badge.svg)](https://github.com/thabata-marchi/ai-engineering-mentor/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D22.6-3c873a)
![TypeScript](https://img.shields.io/badge/TypeScript-nativo%20(sem%20build)-3178c6)
![License](https://img.shields.io/badge/license-MIT-blue)
![Framework](https://img.shields.io/badge/framework-nenhum%20(feito%20do%20zero)-orange)

Mentor de programação com IA construído **do zero** em TypeScript: um sistema
**RAG** (respostas ancoradas numa base de conhecimento, com citação de fontes),
com **método socrático**, exposto como **servidor MCP** e consumível por um
**agente autônomo** — tudo sobre **arquitetura hexagonal** e **testes desde o dia 1**.

> Não é um chatbot: é um mentor que **conduz o raciocínio**, ancora as respostas
> numa base de conhecimento própria (RAG) e **cita as fontes** (não inventa).

> 🇬🇧 **In short:** a from-scratch, RAG-based Socratic programming mentor in
> TypeScript — hexagonal architecture, tests from day one, exposed over MCP and
> driven by an autonomous agent. Comments are in Portuguese on purpose (a learning
> log). Bring your own knowledge base (books/PDFs are not included).

## Destaques (o que este projeto demonstra)
- **RAG completo, sem framework** — chunking, embeddings **locais** (transformers.js),
  busca por similaridade de cosseno, prompt aterrado e resposta **com fontes**.
- **Arquitetura hexagonal + SOLID** — o núcleo depende só de *ports* (interfaces);
  trocar LLM, banco ou embedder = trocar 1 adapter. Padrões: Strategy, Decorator, Repository.
- **MCP (Model Context Protocol)** — o mentor vira ferramenta pra IA (tools
  `perguntar`/`meu_progresso`, resource e prompt).
- **Agente autônomo** — loop ReAct com *tool-calling* que **consome o próprio MCP**.
- **Persistência real** — MongoDB como vector store, memória de conversa e perfil de estudo.
- **Rigor de engenharia** — rate limiting, validação, observabilidade (tracing),
  **avaliação** (dataset dourado + LLM-as-judge) e **guardrails contra prompt
  injection** (defesa em profundidade + resistência medida). **80 testes** (node:test).

> ⚠️ **Projeto de estudo / portfólio.** O objetivo é *aprender construindo* — por
> isso os comentários do código são detalhados e em português (um diário de
> aprendizado). A **base de conhecimento não vem incluída**: livros/PDFs têm
> direitos autorais, então você coloca os seus na pasta `data/` (ignorada pelo Git).

**Stack:** TypeScript rodando **nativo** no Node (≥22.6, ideal 24) — sem passo de
build. Embeddings locais via **transformers.js**; LLM via **OpenRouter**;
persistência opcional em **MongoDB**; MCP via **@modelcontextprotocol/sdk**;
schemas com **zod**. Sem LangChain/LangGraph — a orquestração (RAG e agente) é
feita à mão, de propósito, para entender cada peça.

## Como foi construído
Etapa por etapa, entendendo cada peça. Ver `ANALISE-ARQUITETURA.md` (a análise
completa) e `GUIA-ETAPA-1.md` (passo a passo da Etapa 1).

**Progresso (13 etapas — completo):**
- [x] **Etapa 1 — Fundação**: esqueleto hexagonal (`core` = models + ports) + testes.
- [x] **Etapa 2 — Ingestão**: parser de texto/Markdown + chunking (sliding window).
- [x] **Etapa 2b — PDF**: `PdfParser` (unpdf) + `FileParser` (despachante por extensão: .pdf/.md/.txt).
- [x] **Etapa 3a — Vector Store**: banco de vetores em memória + similaridade de cosseno.
- [x] **Etapa 3b — Embedder**: embedder local (transformers.js, modelo multilíngue) + `FakeEmbedder` p/ testes.
- [x] **Etapa 4 — Resposta com fontes**: caso de uso `AnswerQuestion` (retrieval → prompt aterrado → geração) + `FakeLLM` p/ testes.
- [x] **Etapa 4b — LLM real**: adapter `OpenRouterLLM` + CLI `npm run ask` (embedder local + LLM ao vivo).
- [x] **Etapa 5 — Desempenho**: índice persistido em disco (embeda 1x) + embedder q8 + timeout/retry no LLM.
- [x] **Etapa 6 — Método socrático**: mentor guiado (pergunta + dica, revela se você pedir); modo `direto` opcional (`MODE`).
- [x] **Etapa 7 — MongoDB**: `MongoVectorStore` (mesmo `VectorStorePort`) — persiste os vetores num banco de verdade (`VECTOR_STORE=mongo`).
- [x] **Etapa 8 — Memória**: `MemoryPort` + adapters (memória/Mongo) e **modo conversa** (`npm run chat`) — o mentor lembra do diálogo.
- [x] **Etapa 9 — Servidor MCP**: o mentor exposto como MCP (tool `perguntar`, resource + prompt) — consumível no VSCode/agentes (`npm run mcp`).
- [x] **Etapa 10 — Perfil do aluno**: `ProfilePort` + adapters (memória/Mongo, coleção `study_log`) registram o que você estuda; 2ª tool MCP `meu_progresso` e comando `/progresso` no chat.
- [x] **Etapa 11 — Agente**: agente autônomo (loop ReAct) que **consome o MCP** — `ToolCallingLLMPort` (OpenRouter) + `AgentToolsPort` (cliente MCP); dado um objetivo, ele decide quais tools chamar (`npm run agent`).
- [x] **Etapa 12 — Segurança + publicação**: rate limiting (janela deslizante, protege a cota), validação/limites de entrada, guard de segredos + `SECURITY.md` (modelo de ameaças), e pacote pronto pra npm (`files`, `exports`, `prepublishOnly`, `CONTRIBUTING.md`, `PUBLISHING.md`).
- [x] **Etapa 13 — Observabilidade + avaliação**: `TracerPort` (spans locais: retrieval/generation) + harness de avaliação (`npm run eval`) com dataset dourado e métricas (source-hit, citação, menção) — e **LLM-as-judge** opcional pra medir fidelidade.
- [x] **Etapa 14 — Guardrails (prompt injection)**: `guardrails.ts` — contexto delimitado como dado não-confiável + cláusula defensiva nos prompts + detecção/sinalização de trechos suspeitos (`detectInjection`); casos adversariais no eval medem a **taxa de resistência**.
- [x] **Etapa 15 — Distribuição npx**: build `tsc → dist/` (JS puro, `rewriteRelativeImportExtensions` mantém o TS nativo em dev) + `bin` (`ai-engineering-mentor-mcp`) — dá pra rodar o servidor MCP via `npx`, sem clonar (traga seus próprios docs via `DOCS_DIR`).
- [x] **Etapa 16 — Multi-provedor**: escolha o provedor de LLM (`LLM_PROVIDER=openrouter|openai|anthropic|gemini`) e use a **sua** chave — adapters `OpenAICompatibleLLM` (OpenAI/Gemini) e `AnthropicLLM` atrás do mesmo `LLMPort`, selecionados por uma factory. (O agente/tool-calling segue no OpenRouter por ora.)

## Estrutura
```
src/core/         → lógica pura (models, ports, chunker, similarity). NÃO depende de nada externo.
src/adapters/     → implementações concretas (parser, embeddings, vetores, LLM, MCP tools).
src/application/  → casos de uso (AnswerQuestion, MentorAgent) — orquestram as peças.
src/mcp/          → o mentor exposto como servidor MCP (tools/resource/prompt).
src/index.ts      → API pública (barrel) para quem importar o pacote.
examples/         → executáveis: demo, ask, chat, mcp, agent, eval (+ golden.json).
tests/            → testes desde o dia 1 (node:test); tests/helpers = dublês (fakes).
```

**Fluxo (visão geral):**
```
arquivos → parse → chunks → embeddings → vector store
                                              │
pergunta → embed → busca top-k → prompt aterrado → LLM → resposta + fontes
                                              │
             MCP (perguntar/meu_progresso) ← agente (loop ReAct)
```

## Rodar os testes
```bash
npm install     # instala @types/node + typescript (ajudam o editor). Opcional p/ rodar.
npm test        # roda os testes com o test runner nativo do Node
```
> Requer **Node >= 22.6** (ideal Node 24). O TypeScript roda **nativo**, sem transpilar,
> graças à flag `--experimental-strip-types` (já configurada no script `test`).

## Ver funcionar

> 📋 **Quer um roteiro linear "testar do zero" com solução de problemas?** Veja o
> [`GUIA-DE-TESTE.md`](./GUIA-DE-TESTE.md). As seções abaixo cobrem cada modo separadamente.

**Demo sem configurar nada** (usa dublês — mostra o fluxo, não "pensa"):
```bash
npm run demo
```

**Rodar de verdade** (embedder local + LLM ao vivo via OpenRouter):
```bash
npm install                       # baixa a transformers.js
cp .env.example .env              # crie seu .env (é ignorado pelo Git)
# edite o .env e cole sua chave em OPENROUTER_API_KEY (crie em openrouter.ai/keys)
npm run ask -- "o que é o single responsibility principle?"
```
> O `npm run ask` carrega o `.env` automaticamente (`--env-file-if-exists`, nativo do Node).

**Escolher o provedor de LLM** (Etapa 16 — use a sua chave): no `.env`, defina
`LLM_PROVIDER` e a chave correspondente. Todos passam pelo mesmo `LLMPort`:
```bash
# OpenRouter (padrão) — 1 chave, roteia p/ GPT/Claude/Gemini via OPENROUTER_MODEL
LLM_PROVIDER=openrouter   OPENROUTER_API_KEY=sk-or-...
# OpenAI nativo
LLM_PROVIDER=openai       OPENAI_API_KEY=sk-...        LLM_MODEL=gpt-4o-mini
# Anthropic (Claude) nativo
LLM_PROVIDER=anthropic    ANTHROPIC_API_KEY=sk-ant-... LLM_MODEL=claude-3-5-sonnet-latest
# Google Gemini nativo
LLM_PROVIDER=gemini       GEMINI_API_KEY=...           LLM_MODEL=gemini-2.0-flash
```
> Os nomes de modelo mudam com o tempo — ajuste `LLM_MODEL` conforme o provedor.
> Dica: no OpenRouter você já alcança GPT/Claude/Gemini só trocando `OPENROUTER_MODEL`,
> com **uma** chave. Os provedores nativos servem pra quem prefere usar a conta própria.

**Conversar com memória** (Etapa 8 — o mentor lembra do diálogo):
```bash
npm run chat        # abre um loop; escreva, ele responde e LEMBRA. "sair" encerra.
```
> Com `VECTOR_STORE=mongo`, a conversa fica salva na coleção `conversations` do
> Mongo (dá pra ver no Mongo Express). A sessão é `SESSION_ID` (padrão `default`).
> Digite **`/progresso`** durante o chat para ver o que você vem estudando
> (Etapa 10 — perfil do aluno): total de perguntas, fontes mais consultadas e as
> últimas dúvidas. Com Mongo, isso persiste na coleção `study_log`.

**Usar como servidor MCP** (Etapa 9 — o mentor vira uma ferramenta pra IA):
```bash
npm run mcp                         # sobe o servidor MCP (STDIO). Espera um cliente.
```
No **VSCode**: abra esta pasta como projeto — o `.vscode/mcp.json` já registra o
servidor `ai-engineering-mentor`. O editor mostra as tools `perguntar` e
`meu_progresso` (perfil do aluno), o resource `mentor://base` e o prompt
`estudo-guiado`. Para inspecionar manualmente, use o MCP Inspector apontando
para o **node direto** (não use `npm run` aqui — o banner do npm suja o STDIO):
```bash
npx @modelcontextprotocol/inspector node --dns-result-order=ipv4first \
  --env-file-if-exists=.env --experimental-strip-types examples/mcp.ts
```

**Usar via `npx`, sem clonar** (Etapa 15 — depois de publicado no npm):
```json
{
  "mcpServers": {
    "ai-engineering-mentor": {
      "command": "npx",
      "args": ["-y", "ai-engineering-mentor-mcp"],
      "env": { "OPENROUTER_API_KEY": "sk-or-...", "DOCS_DIR": "/caminho/para/seus/docs" }
    }
  }
}
```
> É um McpServer **plug-and-play**: o `npx` baixa e roda o `bin` compilado (JS puro,
> sem precisar de flags nem clonar o repo). Como a base de conhecimento **não** vem
> incluída (direitos autorais), **você traz a sua** apontando `DOCS_DIR` para uma
> pasta com seus PDFs/`.md`/`.txt`. Pense nele como um *template* de mentor RAG que
> roda sobre os **seus** materiais. Para desenvolver localmente, gere o build com
> `npm run build` (compila `src` + o entry MCP para `dist/`).

**Usar como agente autônomo** (Etapa 11 — ele decide quais tools chamar):
```bash
npm run agent -- "me ajude a entender o Extrair Função"
```
> O agente conecta um cliente MCP ao próprio servidor do mentor (em memória) e
> usa as tools `perguntar`/`meu_progresso` num loop ReAct até responder — mostrando
> o passo a passo real (rastreabilidade). Diferente do `ask`/`chat` (onde NÓS
> definimos o fluxo), aqui **o modelo decide** as ações.
> ⚠️ Precisa de um modelo com **tool-calling** confiável — nem todo `:free` tem.
> Fixe um em `OPENROUTER_MODEL` (procure "Tools" em https://openrouter.ai/models).
> Se o modelo ignorar as tools, o agente responde direto (sem passos) — o
> comportamento fica **visível**, não falha em silêncio.

**Usar MongoDB como vector store** (Etapa 7 — persiste os vetores num banco real):
```bash
open -a Docker            # 1. abre o Docker Desktop (espere a baleia estabilizar)
docker compose up -d      # 2. sobe Mongo + Mongo Express (usa o docker-compose.yml)
docker compose ps         # 3. confere: os dois devem estar "running"
VECTOR_STORE=mongo npm run ask -- "o que é extrair função?"   # 4. roda com Mongo
```
> Inspecione os dados no navegador em **http://localhost:8081** (Mongo Express).
> Desligar: `docker compose down` (os dados ficam salvos no volume).
> Precisa do **Docker** (ou um MongoDB instalado). O core não muda: o mesmo software
> roda sobre o banco só trocando o adapter (`VECTOR_STORE=mongo`). ⚠️ O Mongo Community
> local calcula a similaridade **na aplicação** (busca vetorial nativa é do Atlas).
> Teste de integração (opcional, precisa do Mongo no ar):
> `MONGO_TEST_URL="mongodb://localhost:27017" npm test`
> A 1ª execução baixa o modelo de embeddings (~alguns MB) e o cacheia.
> Modelo do LLM: padrão gratuito; troque com `export OPENROUTER_MODEL="..."`
> (modelos `:free` rotacionam — veja https://openrouter.ai/models).

**Usar seus próprios materiais (PDF, .md, .txt):**
Coloque os arquivos numa pasta `data/` (ignorada pelo Git) e aponte pra ela:
```bash
mkdir -p data && cp "meu-livro.pdf" data/
echo 'DOCS_DIR=./data' >> .env
npm run ask -- "sua pergunta sobre o material"
```
> PDFs grandes (centenas de páginas) geram muitos chunks e a 1ª indexação demora.
> Depois disso o índice fica salvo em `data/vectorstore/index.json` e as próximas
> execuções são **instantâneas** — ele só reindexa se você trocar os arquivos ou a
> configuração. Para forçar reindexação, apague esse arquivo.

**Avaliar a qualidade** (Etapa 13 — "responde" ≠ "responde bem"):
```bash
npm run eval                                   # dataset padrão (pareado com examples/docs)
DOCS_DIR=./examples/docs npm run eval          # garante a base que casa com o dataset padrão
npm run eval -- examples/golden.fowler.json    # dataset sob medida p/ a sua base (livro do Fowler)
EVAL_JUDGE=1 npm run eval                       # + LLM-as-judge (mede fidelidade; gasta cota)
EVAL_RUNS=3 npm run eval                         # roda cada caso 3x e tira a MÉDIA (reduz o ruído)
EVAL_TRACE=1 npm run eval                       # + trace ao vivo de cada passo (retrieval/generation)
```
> ⚠️ **Modelos grátis são não-determinísticos** — as métricas de geração (citação,
> menção, fidelidade) oscilam entre rodadas. Use `EVAL_RUNS=N` para tirar a média de
> N execuções por caso (metodologia correta) em vez de confiar numa rodada só. As
> métricas determinísticas (source-hit, resistência) são estáveis.
> Métricas determinísticas (rodam de graça): **source-hit** (a fonte esperada
> apareceu no retrieval?), **citação** (citou `[n]`?), **menção** (trouxe os
> termos-chave?) e **resistência** (Etapa 14 — resistiu à injeção?).
> ⚠️ **O dataset precisa casar com a base** (`DOCS_DIR`): as `expectedSources` são os
> nomes dos arquivos indexados. Dataset e base descasados → **source-hit 0%** (não é
> falha de retrieval, é comparação errada). O `golden.json` pareia com `examples/docs`;
> passe seu próprio dataset como argumento (`npm run eval -- caminho.json`) pra medir a sua base.
> Com **base de fonte única** (ex.: um só livro), source-hit tende a 100% e o sinal forte
> passa a ser **menção/citação/fidelidade**.

## Segurança (Etapa 12)
Hardening proporcional ao contexto (roda **local via STDIO**, sem rede):
- **Rate limiting** — limitador de janela deslizante protege sua cota do OpenRouter
  e contém um agente em loop. Ajuste com `RATE_LIMIT_MAX` (padrão 20) e
  `RATE_LIMIT_WINDOW_MS` (padrão 60000). RAG e agente somam no mesmo teto.
- **Validação de entrada** — pergunta vazia é recusada e há teto de tamanho
  (`MAX_QUESTION_LEN`, também no schema zod da tool MCP).
- **Segredos** — chave só via `.env` (ignorado pelo Git); um *guard* avisa cedo se
  ela parecer placeholder. Detalhes e modelo de ameaças em [`SECURITY.md`](./SECURITY.md).
- **Guardrails contra prompt injection (Etapa 14)** — o contexto recuperado é
  delimitado e tratado como **dado não-confiável**; os prompts instruem o modelo a
  não obedecer comandos vindos dos documentos; trechos suspeitos são detectados e
  sinalizados; e o `npm run eval` mede a **taxa de resistência** a ataques. É
  mitigação *parcial* (nenhuma defesa é 100%) — detalhes no `SECURITY.md`.
> Auth/token **não** foi implementado de propósito: num servidor STDIO local não
> agrega segurança real (só faria sentido expondo por HTTP). Veja o `SECURITY.md`.

## Publicar (npm / open source)
Pacote pronto pra publicar (campo `files`, `exports`, `prepublishOnly` rodando
tipos+testes). O passo a passo — que **você** executa, porque envolve login e
publicação — está em [`PUBLISHING.md`](./PUBLISHING.md). Para inspecionar o que
iria no pacote sem publicar: `npm pack --dry-run`.

## Entendendo o `package.json`
> ⚠️ O `package.json` é um arquivo **JSON**, e **JSON não aceita comentários** (`//`
> quebraria o arquivo). Por isso a explicação de cada campo fica aqui:

- **`"type": "module"`** → o projeto usa `import/export` (ES Modules), não o `require` antigo.
- **`"engines": { "node": ">=22.6.0" }`** → declara a versão mínima do Node (pra rodar TS nativo).
- **`"scripts"`** → atalhos de terminal:
  - `npm test` → `node --experimental-strip-types --test tests/*.test.ts` (roda TS direto + test runner nativo).
  - `npm run test:watch` → re-roda os testes ao salvar.
- **`"dependencies"`** → o que o produto **usa em runtime**:
  - `@huggingface/transformers` → roda o modelo de embeddings **localmente** (Etapa 3b).
    Na 1ª execução, baixa o modelo (~alguns MB) e o cacheia. Os **testes não usam**
    isto (usam o `FakeEmbedder`), então não baixam nada.
- **`"devDependencies"`** → só de **desenvolvimento** (não vão pro produto final):
  - `@types/node` → dá autocomplete/tipos do Node no editor.
  - `typescript` → deixa o editor checar os tipos.
