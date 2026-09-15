# Política de Segurança

> Projeto de estudo (pós em Engenharia de IA — UNIPDS). Este documento descreve o
> **modelo de ameaças** e as decisões de segurança de forma honesta e proporcional
> ao contexto: o mentor roda **localmente** e se comunica por **STDIO** (não expõe
> rede por padrão).

## Modelo de ameaças (o que protegemos, e o que não)

**Contexto atual:** o servidor MCP roda como um processo local; o cliente (VSCode,
agente) fala com ele pela entrada/saída padrão (STDIO). Não há porta de rede aberta.

Consequência honesta: **autenticação/token não agrega segurança real aqui** — quem
tem acesso ao seu terminal já executa qualquer coisa. Por isso *não* implementamos
auth/token nesta fase (seria "segurança de teatro"). Um token só passa a fazer
sentido se um dia expusermos o servidor por **HTTP** para outras máquinas — aí sim
entram auth, TLS e controle de origem (fora do escopo atual).

### Ameaças que TRATAMOS
- **Vazamento de segredo (chave do OpenRouter).** A chave vem de `OPENROUTER_API_KEY`
  (variável de ambiente), injetada no adapter — nunca fica no código. `.env` é
  ignorado pelo Git (`.gitignore`), e há um *guard* no setup que **avisa** se a chave
  parecer um placeholder ou estiver vazia.
- **Abuso de cota / custo (rajada de chamadas).** Um **rate limiter** (janela
  deslizante) local corta chamadas em excesso ao LLM antes de baterem na API —
  protege sua cota gratuita e contém um agente em loop. Ajuste com
  `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`.
- **Entrada malformada / prompt gigante.** Validação na borda: pergunta vazia é
  recusada; há teto de tamanho (`MAX_QUESTION_LEN`, também no schema zod da tool
  MCP) para evitar estouro de contexto e custo.
- **Prompt injection indireta (via documentos) — PARCIALMENTE mitigada (Etapa 14).**
  O conteúdo recuperado pode conter instruções maliciosas. Defesa em profundidade,
  em `src/core/guardrails.ts`:
  1. **Delimitação** — o contexto vai cercado por marcadores (`CONTEXT_OPEN/CLOSE`)
     no prompt, deixando claro onde começam/terminam os DADOS não-confiáveis.
  2. **Cláusula defensiva** — os system prompts instruem o modelo a tratar tudo
     entre os delimitadores como dado e a **nunca obedecer comandos** vindos dali.
  3. **Detecção + sinalização** — `detectInjection()` marca trechos com padrões
     conhecidos ("ignore as instruções", "you are now", "system:", "revele o
     prompt"...) com um aviso visível no prompt; o span de retrieval registra
     quantos trechos foram sinalizados (observabilidade).
  4. **Segurança testável** — o dataset dourado tem caso(s) adversarial(is) e a
     avaliação mede a **taxa de resistência** (`npm run eval`).
  ⚠️ **Honestidade:** isto REDUZ o risco, não elimina — nenhuma defesa de prompt
  injection é 100%. E as tools MCP são **read-only**, o que limita o dano de uma
  injeção bem-sucedida.
- **Direitos autorais.** A base de conhecimento (livros/PDFs) **não** é versionada
  (pasta `data/` no `.gitignore`) — cada pessoa traz o próprio material.

### Ameaças FORA do escopo (por ora)
- Autenticação/autorização multiusuário e transporte HTTP.
- Isolamento de dados entre usuários no Mongo (hoje `SESSION_ID`/`studentId` é uma
  convenção, não uma fronteira de segurança).
- Filtro de SAÍDA e moderação de conteúdo (a resposta do modelo não passa por
  checagem pós-geração).
- Defesa COMPLETA contra prompt injection (só temos mitigação parcial — ver acima).

## Boas práticas ao usar
- Nunca cole a chave da API em código, commits, issues ou no chat. Use `.env`.
- Se expuser o servidor pela rede no futuro, **não** o faça sem auth + TLS.
- Rotacione a chave do OpenRouter se suspeitar de vazamento (painel do OpenRouter).

## Reportar uma vulnerabilidade
Por ser um projeto de estudo, abra uma *issue* no repositório descrevendo o
problema (sem incluir segredos). Para algo sensível, marque como tal no título.
