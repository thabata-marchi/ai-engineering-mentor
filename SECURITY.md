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
- **Direitos autorais.** A base de conhecimento (livros/PDFs) **não** é versionada
  (pasta `data/` no `.gitignore`) — cada pessoa traz o próprio material.

### Ameaças FORA do escopo (por ora)
- Autenticação/autorização multiusuário e transporte HTTP.
- Isolamento de dados entre usuários no Mongo (hoje `SESSION_ID`/`studentId` é uma
  convenção, não uma fronteira de segurança).
- Sanitização de conteúdo malicioso vindo dos **documentos** indexados (assuma que
  você confia na sua própria base).

## Boas práticas ao usar
- Nunca cole a chave da API em código, commits, issues ou no chat. Use `.env`.
- Se expuser o servidor pela rede no futuro, **não** o faça sem auth + TLS.
- Rotacione a chave do OpenRouter se suspeitar de vazamento (painel do OpenRouter).

## Reportar uma vulnerabilidade
Por ser um projeto de estudo, abra uma *issue* no repositório descrevendo o
problema (sem incluir segredos). Para algo sensível, marque como tal no título.
