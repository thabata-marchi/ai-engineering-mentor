# 🧠 AI Engineering Mentor — Análise de Arquitetura (pré-código)

> Papel assumido: **Senior SWE + AI Engineer + Architecture Mentor + Code Reviewer.**
> Regra: crítico, sem concordar automaticamente.
> **Stack (atualizada): TypeScript + Node 24 + LangChain.js/LangGraph.js + OpenRouter + Vector DB + RAG.**

> ⚙️ **Atualização de stack (Python → TypeScript):** passamos a usar **TypeScript**,
> a mesma linguagem do curso, para reforçar o que você aprendeu. A **arquitetura é a
> mesma** — só muda a sintaxe (dataclass→`interface`, `Protocol`→`interface`,
> `pytest`→`node:test`). Único trade-off relevante: na **Fase 7 (Evaluation)** a
> ferramenta pronta **RAGAS é Python**; em TS faremos a avaliação mais "na mão"
> (LLM-as-judge + LangSmith). Graças aos *ports*, dá pra plugar um pedaço de eval em
> Python isoladamente, se um dia quisermos.

---

## 0. Leitura crítica geral (o que eu penso do plano antes de detalhar)

Três elogios e três alertas, direto:

**👏 Pontos fortes do seu plano**
1. Você separou **fases incrementais** e colocou **testes + eval desde o início** — isso é maturidade rara.
2. A escolha do **modo socrático** é ótima: força o sistema a ter *lógica de conversa/estado*, não só Q&A.
3. Você pediu para **questionar a arquitetura** — então vou.

**⚠️ Três alertas que vão guiar minhas recomendações**
1. **Risco de over-engineering no MVP.** Você quer Clean Architecture + DDD + Ports/Adapters já. Mas o **coração do MVP (o pipeline RAG) é quase 100% infraestrutura/orquestração** — tem pouco "domínio rico". Aplicar DDD pesado onde não há domínio é *cerimônia sem valor*. **Recomendação:** arquitetura limpa e leve agora; DDD de verdade só onde nasce domínio real (mentor, exercícios, perfil de aprendizagem — Fases 2, 4, 5).
2. **A qualidade do RAG é o alicerce.** Se o *retrieval* for ruim, **tudo depois desaba** (mentor, code review, exercícios — todos dependem de recuperar bem). Por isso eu **inverteria a prioridade**: antes de adicionar features (Fases 2–5), **fechar retrieval + evaluation (Fase 1 + Fase 7)** e só então crescer. Construir 5 fases sobre um RAG não-avaliado é construir na areia.
3. **7 fases é muito escopo.** Ótimo como visão; perigoso como compromisso. Vamos tratar Fases 1 e 7 como **obrigatórias e primeiras**, e as demais como incrementos opcionais.

---

## 1. Visão geral da solução

Um **mentor de programação** que ensina por **método socrático**, ancorado numa **base de conhecimento própria** (RAG). Ele não "responde": ele **conduz o raciocínio**, relaciona problemas ao material recuperado e cita as fontes.

Quatro capacidades, em ordem de dependência:
1. **RAG** (recuperar conhecimento confiável) → base de tudo.
2. **Mentor conversacional socrático** (usa o RAG + memória + estado da conversa).
3. **Code Mentor / Exercícios / Perfil** (domínio de aprendizagem em cima do mentor).
4. **Observabilidade + Evaluation** (transversal — acompanha tudo desde o dia 1).

Princípio-guia: **o RAG é o motor; o socrático é o volante; observabilidade/eval são o painel.**

---

## 2. Arquitetura proposta (e crítica à sua estrutura)

### Sua proposta (Domain/Application/Infra/Presentation) — crítica honesta
Ela **não está errada**, mas para o MVP ela **antecipa complexidade**. Problemas:
- **Entities/Value Objects/Domain Services para um pipeline RAG** → o "domínio" do RAG é `Document`, `Chunk`, `Query`, `Answer`. Isso é **quase estrutura de dados**, não regra de negócio rica. Modelar como agregados DDD dá pouco retorno e muito boilerplate.
- **Repository Contracts + Use Cases logo de cara** → útil quando há regras; no MVP, o "use case" é literalmente "recuperar e responder".

### O que eu recomendo: **Arquitetura Hexagonal (Ports & Adapters) enxuta**
O padrão que **realmente** paga a conta num sistema de IA é **isolar o que é volátil e externo** (LLM, embeddings, vector store, parser) atrás de **interfaces (ports)**. Isso te dá o que importa: **trocar de LLM/vector DB sem tocar na lógica**, e **testar com mocks**.

```
         ┌─────────────────────────────────────────────┐
         │                CORE (lógica)                 │
         │   casos de uso: Ingest, Answer, Mentor,      │
         │   GenerateExercise, Evaluate                 │
         │   ── depende só de PORTS (interfaces) ──      │
         └───────────────▲───────────────▲──────────────┘
                         │ ports          │ ports
     ┌───────────────────┴───┐   ┌────────┴───────────────┐
     │  ADAPTERS de saída     │   │  ADAPTERS de entrada    │
     │  LLM (OpenAI/OpenRouter)│  │  CLI / API (FastAPI)    │
     │  Embeddings            │   └─────────────────────────┘
     │  VectorStore (Chroma)  │
     │  Parser (PDF/MD)       │
     │  Observability (LangSmith)
     └────────────────────────┘
```

- **Core** não sabe se o LLM é OpenAI ou local, nem se o vector store é Chroma ou Qdrant. Fala só com **interfaces**.
- **DDD entra depois**, e só onde há domínio: **Fase 4/5** (Exercício, Avaliação, Perfil de Aprendizagem, Conceito) têm regras de verdade → aí `Entity`/`ValueObject`/`UseCase` se justificam.

> 🔎 Trade-off resumido: sua proposta = mais "correta no papel", mais lenta e com boilerplate cedo. Minha proposta = **mesma limpeza, menos cerimônia**, cresce pra DDD quando o domínio pedir. Para um **laboratório de estudo**, a hexagonal enxuta ensina o que importa (inversão de dependência, testabilidade) sem te afogar.

---

## 3. Componentes principais

| Componente | Responsabilidade | Port (interface) |
|---|---|---|
| **DocumentParser** | PDF/MD/txt → texto limpo + metadados | `DocumentParserPort` |
| **Chunker** | texto → chunks com overlap | (função pura, testável) |
| **Embedder** | chunk → vetor | `EmbedderPort` |
| **VectorStore** | guardar/buscar por similaridade | `VectorStorePort` |
| **Retriever** | query → top-k chunks relevantes | `RetrieverPort` |
| **LLMClient** | prompt → resposta (structured quando preciso) | `LLMPort` |
| **AnswerService** (core) | orquestra retrieval + prompt + resposta + fontes | — |
| **MentorService** (core) | estado socrático, memória, condução | — |
| **Observability** | tracing/métricas/custo | `TracerPort` (LangSmith) |
| **Evaluator** | mede qualidade do RAG e das respostas | `EvaluatorPort` |

---

## 4. Fluxo completo do RAG (com as decisões de cada estágio)

```
Documentos → Ingestão → Parsing → Chunking → Embeddings → Vector Store
                                                              │
Pergunta → Embedding da query → Retrieval (top-k) → (re-rank?) → Contexto
                                                              │
                          Prompt (contexto + pergunta + instrução) → LLM → Resposta + Fontes
```

Cada seta esconde uma **decisão que afeta a qualidade** — e é aqui que 80% dos RAGs falham:

1. **Parsing:** PDF é traiçoeiro (colunas, código, tabelas). **Decisão:** começar com PDFs "comportados" (texto puro) e Markdown. Livros escaneados/2 colunas ficam pra depois.
2. **Chunking:** o parâmetro mais subestimado. Chunk grande demais = ruído; pequeno demais = perde contexto. **Decisão inicial:** ~500–800 tokens com overlap ~10–15%, e **respeitar fronteiras semânticas** (título, parágrafo, bloco de código). Testar variações e **medir** (Fase 7).
3. **Embeddings:** modelo importa. **Decisão:** um modelo de embedding bom e barato (ver seção 6). Guardar `dimension` — trocar embedding = **reindexar tudo**.
4. **Vector store:** local no MVP (Chroma/LanceDB). Nada de servidor ainda.
5. **Retrieval:** top-k (k=4–6 no começo). **Alerta:** só similaridade vetorial às vezes falha em termos exatos (nomes de padrões, siglas). **Evolução:** *hybrid search* (vetorial + BM25) e **re-ranking** — mas **só depois de medir** que o retrieval puro é insuficiente.
6. **Contexto + Prompt:** montar com **citação de origem** (arquivo + trecho) e instruir o modelo a **responder só com base no contexto** (reduz alucinação) e a dizer "não encontrei" quando o contexto não cobre.
7. **Resposta + Fontes:** retornar a resposta **e** os chunks/documentos usados (rastreabilidade = requisito seu).

> 🔑 A citação de fonte e o "não sei quando não está no contexto" são o que separam um RAG **confiável** de um gerador de plausibilidades.

---

## 5. Modelo de domínio inicial (honesto sobre o que é domínio e o que é dado)

**Fase 1 (RAG) — quase tudo é dado, não domínio rico:**
- `Document { id, source, metadata }`
- `Chunk { id, documentId, text, position, embedding, metadata }`
- `Query { text }`
- `RetrievedContext { chunks[], scores[] }`
- `Answer { text, sources[] }`

**Fases 4–5 (aqui nasce domínio de verdade — DDD se justifica):**
- `Concept` (ex.: "Repository Pattern", "SRP") — **Value Object** de um vocabulário controlado (taxonomia).
- `Exercise { objetivo, contexto, códigoInicial, dificuldade, conceitos[], critériosAvaliação[] }` — **Entity**.
- `Answer/Submission` do aluno + `Evaluation { conceitosCorretos[], ausentes[], incorretos[], raciocínio, nível }` — **Entity/VO**.
- `LearningProfile { porConceito: Map<Concept, Mastery> }` — **Aggregate** com regras (como atualizar maestria, quando recomendar revisão).

> 🧭 Decisão que vamos precisar tomar: **a taxonomia de `Concept`**. O "Perfil de Aprendizagem" (Fase 5) só funciona se cada exercício/avaliação for **etiquetado com conceitos de uma lista controlada**. Sem isso, "SOLID 80%" é chute. Isso é modelagem de domínio real — e é o pedaço mais interessante do projeto do ponto de vista de DDD.

---

## 6. Tecnologias recomendadas (com alternativas e trade-offs)

| Camada | Recomendo p/ MVP | Alternativas | Trade-off |
|---|---|---|---|
| **Linguagem** | **TypeScript + Node 24** | Python | escolhida p/ bater com o curso; Python teria ecossistema de IA mais rico (ver banner). |
| **Orquestração** | **LangGraph.js** (sobre LangChain.js) | Vercel AI SDK; SDKs diretos | LangChain tem "imposto de abstração"; **LangGraph** brilha no **fluxo socrático com estado/loops**. No MVP, escrevemos o pipeline RAG "na mão" pra entender. |
| **Embeddings** | `text-embedding-3-small` (OpenAI) **ou** um modelo local (BGE/E5 via sentence-transformers) | Cohere, Voyage | OpenAI = simples/barato; local = grátis/privado, mas roda no seu Mac (M1 aguenta modelos pequenos). |
| **Vector Store** | **Chroma** (via `chromadb`) ou **HNSWLib**/MemoryVectorStore | Qdrant, Weaviate, pgvector | **Não suba servidor no MVP.** Local basta pra dezenas/centenas de docs. Migrar depois é trocar 1 adapter. (No ecossistema JS, `MemoryVectorStore`/HNSWLib do LangChain.js são os mais simples.) |
| **LLM** | OpenRouter (multi-modelo) ou OpenAI | Anthropic, local | OpenRouter te dá liberdade de trocar modelo (você já domina isso do curso). |
| **Observabilidade** | **LangSmith** | Langfuse (open source, self-host) | LangSmith integra nativo com LangChain; **Langfuse** é grátis/self-host (você já viu no M7). Ambos servem. |
| **Eval do RAG** | **LLM-as-judge + LangSmith** (na mão) | RAGAS (Python) | RAGAS é a mais pronta, mas é **Python**. Em TS avaliamos com um "modelo juiz" + dataset. Se quisermos RAGAS, plugamos via port isolado. |
| **API (quando precisar)** | **Fastify** ou **Hono** | Express | como no curso (Fastify), tipado e rápido. |
| **Testes** | **node:test** (nativo) | Vitest | igual ao curso; sem instalar framework. |
| **Frontend** | **começar sem UI** (CLI) | Flutter/Web depois | seu objetivo é IA; UI só quando o núcleo estiver sólido. ✅ concordo com você. |

> 💬 Crítica à stack: **LangChain não é obrigatório** e às vezes atrapalha o aprendizado (esconde o que acontece). Sugestão de meio-termo: usar **LangGraph** para o fluxo/estado (onde ele agrega), mas **manter o pipeline RAG transparente** (parser/chunker/embedder você mesma escreve, pra entender). Assim você aprende de verdade, em vez de "chamar uma chain mágica".

---

## 7. Estrutura inicial do projeto (mais enxuta que a sua)

```
ai-engineering-mentor/
├── README.md
├── package.json             # deps + scripts (node:test)
├── tsconfig.json
├── .env.example
├── data/
│   ├── raw/                  # PDFs/MD originais
│   └── vectorstore/          # índice local
├── src/
│   ├── core/                 # lógica pura, SEM dependência externa
│   │   ├── ports.ts          # interfaces (LLMPort, EmbedderPort, VectorStorePort, ...)
│   │   ├── models.ts         # Document, Chunk, Query, Answer (interfaces)
│   │   ├── ingest.ts         # caso de uso: ingestão
│   │   └── answer.ts         # caso de uso: perguntar (RAG)
│   ├── adapters/             # implementações concretas (trocáveis)
│   │   ├── parserPdf.ts
│   │   ├── embedderOpenai.ts
│   │   ├── vectorstoreChroma.ts
│   │   ├── llmOpenrouter.ts
│   │   └── tracerLangsmith.ts
│   ├── mentor/               # Fase 2+ (socrático, memória) — DDD começa aqui
│   ├── eval/                 # dataset + métricas (Fase 7, mas criado cedo)
│   └── cli.ts                # interface inicial
└── tests/                    # node:test → arquivos *.test.ts
```

Diferença pra sua proposta: **sem camadas Domain/Application/Presentation cheias de subpastas vazias.** `core` (lógica + ports) vs `adapters` (o volátil). DDD real cresce dentro de `mentor/` e `eval/` quando houver domínio. **Menos pastas, mesma inversão de dependência.**

---

## 8. Estratégia de testes (desde o dia 1 — concordo 100%)

- **Unitários (rápidos, sem rede):** chunker (fronteiras/overlap), montagem de prompt, parsing de saída, regras de perfil. Estes você roda a cada commit.
- **Integração:** pipeline ingest→retrieve com adapters reais, mas base pequena e fixa.
- **Testes de retrieval:** dado um conjunto de perguntas, o chunk certo aparece no top-k? (métrica: *hit rate / recall@k*).
- **Testes de prompt:** validar formato estruturado (**Zod**, como no curso) e comportamento (cita fonte? diz "não sei"?).
- **Eval de LLM (LLM-as-judge):** com cautela — o juiz também erra; sempre com um **golden dataset** humano de referência.
- **Regressão:** quando mudar chunking/embedding/prompt, rodar o dataset e **comparar métricas** com a versão anterior (evita "melhorei aqui, quebrei ali").

> ⚠️ Alerta: teste de sistema com LLM é **não-determinístico**. Não use `assert resposta == "x"`. Use **estrutura** (schema), **retrieval** (o chunk certo veio?) e **score** (eval). Isso você já aprendeu no curso (M6/M7).

---

## 9. Estratégia de observabilidade (o "porquê", não só o "como")

**Por que observabilidade é requisito em IA (e não em software comum):**
- O sistema é **não-determinístico** → você não consegue "ler o código" e prever a saída. Precisa **ver execuções reais**.
- O **custo é variável e invisível** → tokens/latência por chamada podem explodir sem você notar.
- **Falhas silenciosas:** o RAG pode recuperar o chunk errado e o LLM responder com confiança → só o **trace do retrieval** revela.

**O que instrumentar (com LangSmith/Langfuse):** prompt de entrada, resposta, **documentos recuperados + scores**, tokens, latência por etapa, custo, erros, e o **trace completo** (query → embedding → retrieval → prompt → resposta). O item mais valioso e específico de RAG: **ver QUAIS chunks foram recuperados** — é o que te diz se o problema foi *retrieval* ou *geração*.

---

## 10. Estratégia de avaliação do RAG

Dois níveis, porque "a resposta é boa?" se divide em **recuperou certo?** + **respondeu fiel?**:

**A) Qualidade da recuperação (retrieval):**
- *Context Precision / Recall* — os chunks recuperados são os relevantes? (precisa de um golden set).
- *Hit rate @k* — o chunk que contém a resposta apareceu no top-k?

**B) Qualidade da geração (grounded):**
- *Faithfulness / Groundedness* — a resposta está **fundamentada** no contexto (não inventou)?
- *Answer Relevancy* — respondeu **a pergunta**?
- *Hallucination rate* — afirmou algo que não está nas fontes?

**Ferramenta:** **RAGAS** (traz essas métricas). **Dataset:** um **golden set** pequeno (10–20 pares pergunta→resposta_esperada→fonte_esperada) que **eu te ajudo a construir** a partir dos seus documentos. Sem esse dataset, "o RAG está bom?" é opinião.

---

## 11. Roadmap das 7 fases (com meus ajustes)

Mantenho suas 7 fases, mas com **duas mudanças de prioridade** (justificadas):

| Fase | Sua ordem | Minha recomendação |
|---|---|---|
| **1 — RAG MVP** | 1ª | 1ª ✅ |
| **7 — Evaluation** | 7ª (por último) | **2ª** ⚠️ — sem medir o RAG, não dá pra evoluir com segurança. Um eval mínimo entra logo após o MVP. |
| **6 — Observability** | 6ª | **transversal, desde a Fase 1** — instrumentar cedo custa pouco e revela problemas. |
| 2 — Mentor (socrático) | 2ª | 3ª |
| 3 — Code Mentor | 3ª | 4ª |
| 4 — Exercises | 4ª | 5ª |
| 5 — Learning Profile | 5ª | 6ª (é o mais dependente de domínio/persistência) |

> Racional: **RAG + Eval + Observabilidade primeiro** = base medível e observável. Só então empilhar mentor/exercícios/perfil. Você constrói sobre chão firme.

---

## 12. Riscos técnicos (os que realmente machucam)

1. **Retrieval ruim** (chunking/embedding mal calibrados) → maior risco; mitiga com eval desde cedo.
2. **Alucinação** (LLM responde além do contexto) → mitiga com prompt "só o contexto" + faithfulness.
3. **Parsing de PDF** (código/tabelas viram lixo) → mitiga começando com material limpo.
4. **Prompt injection via código colado** (o usuário cola um código que contém "ignore instruções...") → **você já estudou isso (M5)**; trate o código como **dado não confiável**.
5. **Custo** (embeddings + LLM + eval com LLM-judge) → monitorar; usar modelos baratos no dev.
6. **LLM-as-judge não confiável** (eval automática também erra) → sempre com golden set humano.
7. **Modo socrático "vaza" a resposta** (o LLM entrega tudo em vez de perguntar) → precisa de prompt + estado firmes, e **eval do comportamento socrático**.
8. **Scope creep** (7 fases) → tratar Fases 1–2(eval) como núcleo; o resto é bônus.
9. **Perfil de aprendizagem sem taxonomia** → vira chute; exige modelar `Concept`.

---

## 13. Decisões arquiteturais que precisamos tomar (preciso da sua opinião)

Aqui é onde eu **te pergunto primeiro**, como você pediu. Para cada uma, quero saber **o que você faria e por quê** — aí eu critico:

1. **Arquitetura:** aceita começar com **Hexagonal enxuta** (core + adapters) e trazer DDD só nas Fases 4–5, ou quer DDD completo já (assumindo o boilerplate)?
2. **Orquestração:** **LangGraph.js + pipeline RAG "na mão"** (mais aprendizado) ou **LangChain.js "fazendo mágica"** (mais rápido, menos transparente)?
3. **Vector store:** topa **Chroma/LanceDB local** no MVP, ou quer já aprender um servidor (Qdrant/pgvector)?
4. **Embeddings:** **OpenAI** (simples, custa centavos) ou **modelo local** no seu M1 (grátis/privado, mais setup)?
5. **Prioridade:** concorda em **subir Eval e Observabilidade para bem cedo** (minha recomendação), ou prefere seguir sua ordem original (eval por último)?
6. **Escopo do MVP (Fase 1):** topa um alvo bem estreito — *"3–5 PDFs/MDs → responder 10 perguntas do golden set com fonte, faithfulness medido"*? Isso é "pequeno, correto e testável" como você pediu.

---

## ✅ Minha recomendação final (resumida)
Comece **estreito e medível**: Hexagonal enxuta, RAG "na mão" com LangGraph só onde agrega, Chroma local, embeddings OpenAI (troca fácil depois), **eval + observabilidade desde a Fase 1**, e um **golden set de 10–20 perguntas** como bússola. DDD e as features de mentor/exercícios/perfil entram quando houver **domínio real** e **base medida**.

**Não vou implementar nada até você reagir a esta análise** — principalmente às 6 decisões da seção 13.
