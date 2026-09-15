# 🧠 AI Engineering Mentor (TypeScript)

> 🇬🇧 **In short:** a study project — a RAG-based programming mentor built step by
> step in TypeScript, with hexagonal architecture and tests from day one. Code
> comments are in Portuguese on purpose (it's a learning log). The knowledge base
> (books/PDFs) is **not** included for copyright reasons — you bring your own.

Mentor de programação com IA (RAG + método socrático) — **laboratório de estudo**
da pós em Engenharia de IA + fundamentos de Engenharia de Software.

> Não é um chatbot: é um mentor que **conduz o raciocínio**, ancora as respostas
> numa base de conhecimento própria (RAG) e **cita as fontes**.

> ⚠️ **Projeto de estudo.** O objetivo é *aprender construindo* — por isso os
> comentários do código são detalhados e em português (um diário de aprendizado).
> A **base de conhecimento não vem incluída**: livros/PDFs têm direitos autorais,
> então você coloca os seus na pasta `data/` (ignorada pelo Git).

**Stack:** TypeScript + Node (24) — a mesma linguagem do curso. LangChain.js /
LangGraph.js + OpenRouter entram nas próximas etapas.

## Como estamos construindo
Etapa por etapa, entendendo cada peça. Ver `ANALISE-ARQUITETURA.md` (a análise completa)
e `GUIA-ETAPA-1.md` (passo a passo da Etapa 1).

**Progresso (Fase 1 — RAG MVP):**
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

## Estrutura
```
src/core/         → lógica pura (models, ports, chunker, similarity). NÃO depende de nada externo.
src/adapters/     → implementações concretas (parser, embeddings, vetores, LLM, MCP tools).
src/application/  → casos de uso (AnswerQuestion, MentorAgent) — orquestram as peças.
src/mcp/          → o mentor exposto como servidor MCP (tools/resource/prompt).
examples/         → executáveis: demo, ask, chat, mcp, agent.
tests/            → testes desde o dia 1 (node:test); tests/helpers = dublês (fakes).
```

## Rodar os testes
```bash
npm install     # instala @types/node + typescript (ajudam o editor). Opcional p/ rodar.
npm test        # roda os testes com o test runner nativo do Node
```
> Requer **Node >= 22.6** (ideal Node 24). O TypeScript roda **nativo**, sem transpilar,
> graças à flag `--experimental-strip-types` (já configurada no script `test`).

## Ver funcionar

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

## Segurança (Etapa 12)
Hardening proporcional ao contexto (roda **local via STDIO**, sem rede):
- **Rate limiting** — limitador de janela deslizante protege sua cota do OpenRouter
  e contém um agente em loop. Ajuste com `RATE_LIMIT_MAX` (padrão 20) e
  `RATE_LIMIT_WINDOW_MS` (padrão 60000). RAG e agente somam no mesmo teto.
- **Validação de entrada** — pergunta vazia é recusada e há teto de tamanho
  (`MAX_QUESTION_LEN`, também no schema zod da tool MCP).
- **Segredos** — chave só via `.env` (ignorado pelo Git); um *guard* avisa cedo se
  ela parecer placeholder. Detalhes e modelo de ameaças em [`SECURITY.md`](./SECURITY.md).
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
