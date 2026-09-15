# 🧪 Guia de teste — rodar o projeto do zero

Roteiro linear para testar o mentor, do mais rápido/garantido (sem chave, sem
internet) ao mais completo. Se algo falhar, veja **Solução de problemas** no fim.

> Requer **Node >= 22.6** (ideal 24). Confira: `node -v`.

---

## 0. Instalar
```bash
cd ai-engineering-mentor
npm install
```

## 1. Testes automatizados (prova mais rápida — NÃO precisa de chave)
```bash
npm test          # 74 testes → 73 passam + 1 pulado (Mongo, opt-in)
npm run typecheck # confere os tipos (tsc --noEmit)
```
Usa dublês (fakes) — não gasta cota nem usa rede. Se os dois passam, o núcleo está saudável.

## 2. Demo sem configurar nada (vê o fluxo do RAG)
```bash
npm run demo
```
Embedder e LLM falsos — mostra o pipeline (ingestão → busca → resposta com fontes)
sem "pensar" de verdade.

## 3. Rodar de verdade (embedder local + LLM ao vivo via OpenRouter)
Precisa de uma chave (grátis) do OpenRouter. **Uma vez:**
```bash
cp .env.example .env
# 1) crie a chave em https://openrouter.ai/keys (login com Google/GitHub → Create Key)
# 2) edite o .env e cole em OPENROUTER_API_KEY=sk-or-...  (sem aspas, sem espaço no =)
```
Depois:
```bash
npm run ask -- "o que é o single responsibility principle?"
```
> A 1ª execução baixa o modelo de embeddings (~alguns MB) e cacheia; depois fica rápido.
> O `.env` é ignorado pelo Git — sua chave nunca vai pro repositório.

## 4. Conversa com memória (+ perfil de estudo)
```bash
npm run chat
```
Ele **lembra** do diálogo. Digite `/progresso` pra ver o que estudou; `sair` encerra.

## 5. Servidor MCP
```bash
npm run mcp        # sobe o servidor STDIO e espera um cliente
```
Inspecionar visualmente (em outro terminal):
```bash
npx @modelcontextprotocol/inspector node --dns-result-order=ipv4first \
  --env-file-if-exists=.env --experimental-strip-types examples/mcp.ts
```
Você verá as tools `perguntar` e `meu_progresso`, o resource e o prompt.

## 6. Agente autônomo
```bash
npm run agent -- "me ajude a entender o Single Responsibility Principle"
```
Ele decide sozinho quais tools chamar e mostra o passo a passo.
> Precisa de um modelo com **tool-calling** — fixe um em `OPENROUTER_MODEL` (selo
> "Tools" em https://openrouter.ai/models). Sem isso, responde direto (0 passos).

## 7. Avaliação da qualidade
```bash
npm run eval                 # placar determinístico (source-hit, citação, menção)
EVAL_JUDGE=1 npm run eval     # + LLM-as-judge (mede fidelidade; gasta cota)
EVAL_TRACE=1 npm run eval     # + trace ao vivo de cada passo
```

## 8. (Opcional) MongoDB como banco
```bash
open -a Docker            # abra o Docker Desktop (espere estabilizar)
docker compose up -d      # sobe Mongo + Mongo Express
VECTOR_STORE=mongo npm run ask -- "o que é extrair função?"
```
Veja os dados em http://localhost:8081. Desligar: `docker compose down`.

## 9. (Opcional) Sua própria base (PDF/.md/.txt)
```bash
mkdir -p data && cp "meu-livro.pdf" data/
echo 'DOCS_DIR=./data' >> .env
npm run ask -- "sua pergunta sobre o material"
```

---

## ✅ Teste de fumaça (o mínimo pra provar que funciona)
Sem chave/internet: **Passo 1** (`npm test`) + **Passo 2** (`npm run demo`).
Pra ver "pensando de verdade": **Passo 3** (`npm run ask`).

---

## 🛠️ Solução de problemas

**`OPENROUTER_API_KEY ausente ou parece um placeholder`**
É o *guard* de segredo funcionando. Sua chave não está no `.env` ou ainda é o
placeholder. Rode `cp .env.example .env` e cole a chave real em `OPENROUTER_API_KEY`
(a chave inteira, sem `cole-sua-chave`, sem aspas). Veja o Passo 3.

**404 `This model is unavailable for free`**
Um modelo `:free` rotacionou para pago. O app **se auto-cura** caindo no
`openrouter/free`. Se você fixou `OPENROUTER_MODEL`, comente essa linha no `.env`
ou troque por outro modelo.

**Timeout / `This operation was aborted`**
Modelo de raciocínio lento + fila do tier grátis. Aumente `LLM_TIMEOUT_MS` no `.env`
(padrão 120000) ou use `OPENROUTER_MODEL=openrouter/free`.

**`fetch failed` / `ENOTFOUND`**
Rede intermitente / IPv6. Os scripts já usam `--dns-result-order=ipv4first`; tente de novo.

**`Limite de chamadas excedido` (rate limit)**
Proteção de cota (Etapa 12). Espere alguns segundos, ou ajuste `RATE_LIMIT_MAX` /
`RATE_LIMIT_WINDOW_MS` no `.env`.

**Agente responde sem usar tools (0 passos)**
O modelo escolhido não suporta tool-calling. Fixe um modelo com selo "Tools" em
`OPENROUTER_MODEL` (veja o Passo 6).

**Docker: `Cannot connect to the Docker daemon`**
O Docker Desktop não está rodando. `open -a Docker`, espere a baleia estabilizar e
tente de novo.

**Crash `mutex lock failed` ao encerrar**
Cosmético (teardown do onnxruntime, acontece *depois* da saída). Pode ignorar.
