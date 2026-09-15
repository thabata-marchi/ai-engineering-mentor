# Contribuindo

Obrigada pelo interesse! Este é um **projeto de estudo** (pós em Engenharia de IA —
UNIPDS), construído etapa por etapa com foco didático. Contribuições e dúvidas são
bem-vindas.

## Princípios do projeto
- **Arquitetura hexagonal:** `core` (lógica pura, sem I/O) → `application` (casos de
  uso) → `adapters` (tecnologia concreta). Dependa de **ports** (interfaces), nunca
  de implementações.
- **Testes desde o dia 1:** todo comportamento novo vem com teste (`node:test`),
  usando dublês (fakes) — nada de rede/custo nos testes.
- **TypeScript nativo, sem build:** rodamos com `--experimental-strip-types`. Por
  isso **não** use "parameter properties" (`constructor(private x)`) — declare os
  campos explicitamente.
- **Comentários em português, didáticos:** o código é um diário de aprendizado.
- **Commits pequenos e descritivos.**

## Rodando localmente
```bash
npm install
npm test          # roda toda a suíte
npm run typecheck # checa os tipos (tsc --noEmit)
npm run demo      # fluxo com dublês, sem configurar nada
```
Requer **Node >= 22.6** (ideal Node 24).

## Antes de abrir um PR
1. `npm run typecheck` sem erros.
2. `npm test` verde.
3. Comentários e nomes claros; mantenha o padrão hexagonal.
4. Descreva o "porquê" no PR, não só o "o quê".

## Base de conhecimento e segredos
- **Nunca** comite livros/PDFs (direitos autorais) — a pasta `data/` é ignorada.
- **Nunca** comite segredos. Use `.env` (ignorado); veja `.env.example`.
- Reporte questões de segurança conforme o `SECURITY.md`.
