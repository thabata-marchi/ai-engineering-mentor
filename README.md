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

## Estrutura
```
src/core/         → lógica pura (models, ports, chunker, similarity). NÃO depende de nada externo.
src/adapters/     → implementações concretas (parser, embeddings, vetores, LLM).
src/application/  → casos de uso (AnswerQuestion) — orquestram as peças.
examples/         → demo executável do RAG (ingestão → busca → resposta com fontes).
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
