# 📘 Guia — Etapa 1 (Fundação) — TypeScript

## Parte A — Como rodar os testes no seu Mac (passo a passo)

Abra o **Terminal** e digite um comando por vez:

```bash
# 1. Entrar na pasta do projeto
cd ~/Projects/unipds/ESTUDOS/erick-modulos.2-7/ai-engineering-mentor

# 2. Instalar as dependências de desenvolvimento (tipos + typescript)
#    → não são necessárias pra RODAR os testes, mas ajudam o VS Code a te dar
#      autocompletar e apontar erros de tipo.
npm install

# 3. Rodar os testes
npm test
```

**Resultado esperado (algo assim):**
```
# tests 3
# pass 3
# fail 0
```
`pass 3` = os 3 testes passaram. ✅

### Comandos úteis
```bash
npm run test:watch   # re-roda os testes sozinho toda vez que você salva um arquivo
```

### Por que funciona sem "compilar"?
- Você viu isso no curso: o **Node 24 roda TypeScript nativamente**, sem etapa de build,
  usando a flag `--experimental-strip-types` (ele "remove os tipos" e roda como JS).
- Essa flag já está dentro do script `test` no `package.json`.
- O **`node:test`** é o test runner **nativo** do Node (o mesmo que o Erick usou) —
  não precisa instalar Jest nem nada.

---

## Parte B — O que foi feito na Etapa 1 (passo a passo)

Objetivo: montar a **fundação** — pequena, correta e testável. Ainda **sem IA**;
só o esqueleto onde tudo vai se encaixar.

### 1. Estrutura de pastas (Arquitetura Hexagonal)
```
src/core/      → lógica pura. NÃO depende de nada externo (LLM, banco).
src/adapters/  → implementações concretas (PDF, embeddings...). [vazio ainda]
tests/         → testes desde o dia 1.
```

### 2. `src/core/models.ts` — as peças de dado
`interface`s TypeScript com campos `readonly` (imutáveis):
- `Document` → um arquivo-fonte (PDF/MD) já em texto + de onde veio.
- `Chunk` → um pedaço do documento (vira vetor depois).
- `Query` → a pergunta do usuário.
- `ScoredChunk` / `RetrievedContext` → chunks recuperados + o quão parecidos são.
- `Source` / `Answer` → a resposta final **+ as fontes** (rastreabilidade).

### 3. `src/core/ports.ts` — os contratos (interfaces)
`interface`s que o núcleo usa **sem saber quem implementa**:
- `DocumentParserPort`, `ChunkerPort`, `EmbedderPort`, `VectorStorePort`, `LLMPort`.
> Isso é **Inversão de Dependência** (o "D" do SOLID). Os métodos de I/O retornam
> `Promise` porque, em Node, ler arquivo/chamar LLM são operações **assíncronas**.

### 4. `tests/models.test.ts` — os testes
3 testes unitários com `node:test` (rápidos, sem IA), provando que as peças funcionam.

### 5. `package.json` e `tsconfig.json`
Config do projeto (scripts de teste + tipos). Dependências entram **por etapa**.

---

## Diferenças Python → TypeScript (o que muda)
| Python | TypeScript |
|---|---|
| `@dataclass(frozen=True)` | `interface` com campos `readonly` |
| `typing.Protocol` (port) | `interface` (nativo pra port) |
| `pytest` | `node:test` (nativo do Node) |
| imutabilidade checada em **runtime** | `readonly` checado em **compilação** (o TS te impede) |
| `pip install` / `venv` | `npm install` / `package.json` |

## O que essa etapa te ensina (fundamentos)
- **Arquitetura Hexagonal (Ports & Adapters)** — isolar o volátil (LLM, banco).
- **SOLID (D — Dependency Inversion)** — depender de interfaces.
- **Clean Code** — nomes claros, imutabilidade, comentários que explicam o *porquê*.
- **Testes desde o início** — não deixar pro final.

## Onde conecta com o curso
- É o começo do **RAG** (Retrieval-Augmented Generation), visto no **Módulo 1**
  (embeddings + Neo4j) e no **Módulo 6** (RAG avançado). E agora na **mesma
  linguagem do curso** (TypeScript/Node).

## Próxima etapa
**Etapa 2 — Ingestão:** implementar o parser (ler PDF/MD) e o chunking (quebrar em
pedaços), com a decisão de tamanho de chunk fundamentada em fontes.
