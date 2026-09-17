# Publicação (checklist)

> ⚠️ **Estes passos são executados por VOCÊ.** Eles envolvem credenciais (login no
> npm/GitHub) e ações irreversíveis (publicar). Eu (assistente) preparo o pacote,
> mas não faço login, não toco em tokens e não publico por você.

## 0. Antes de tudo
- [ ] Decida se o repositório vai virar **público** no GitHub (hoje é privado).
- [ ] Confirme que **nenhum segredo** está versionado: `git grep -i "sk-or"` deve
      voltar vazio; a pasta `data/` e o `.env` devem estar ignorados.

## 1. Verificação local (pode rodar à vontade)
```bash
npm run typecheck        # tipos ok
npm test                 # suíte verde
npm run build            # gera o dist/ (JS puro) que será publicado
npm pack --dry-run       # mostra EXATAMENTE quais arquivos irão no pacote
```
> O `npm pack --dry-run` respeita o campo `files` do package.json. Confira que
> **não** entram `src/`, `tests/`, `data/`, `.env`, `.vscode/` — só `dist/`,
> `README.md`, `LICENSE`, `SECURITY.md` e `.env.example`.

## 2. Nome do pacote (checar disponibilidade)
```bash
npm view ai-engineering-mentor   # se responder 404, o nome está livre
```
- [ ] Se o nome estiver **ocupado**, use um escopo com seu usuário npm:
      troque `"name"` para `"@SEU_USUARIO/ai-engineering-mentor"` e adicione
      `"publishConfig": { "access": "public" }` no package.json.

## 3. Publicar no npm (VOCÊ executa)
```bash
npm login                # abre o fluxo de login (você faz)
npm publish              # o prepublishOnly roda typecheck + testes + BUILD automaticamente
```
> `prepublishOnly` = `typecheck && test && build`: se qualquer etapa falhar, a
> publicação é abortada. O `build` gera o `dist/` (JS puro) que é o que vai no pacote.
> Rode `npm run build` sozinho antes, se quiser inspecionar o `dist/`.

## 4. GitHub / open source
- [ ] Torne o repositório público (Settings → General → Change visibility).
- [ ] Confira que `LICENSE` (MIT), `README.md`, `CONTRIBUTING.md` e `SECURITY.md`
      aparecem na página do repo.
- [ ] (Opcional) Crie uma *release*/tag `v0.1.0` para casar com a versão do npm.

## 5. Como o pacote é montado (Etapa 15 — build)
Publicamos **JS compilado** em `dist/`, não o `.ts` cru:
- `npm run build` roda `tsc -p tsconfig.build.json`, que compila `src` + o entry MCP
  para `dist/` (JS puro). O `rewriteRelativeImportExtensions` reescreve os imports
  `./x.ts` → `./x.js` **só na saída** — assim o código-fonte continua rodando TS
  nativo em dev (`npm run mcp`, etc.), e o pacote publicado roda em qualquer Node
  moderno **sem flags**.
- O `bin` `ai-engineering-mentor-mcp` aponta para `dist/examples/mcp.js` (com shebang),
  então `npx ai-engineering-mentor-mcp` sobe o servidor MCP direto.
- O campo `files` só inclui `dist/` + docs → o `.ts`, `tests/` e `data/` não vão no pacote.

Nota: hoje publicamos **JS sem tipos `.d.ts`** (o pacote é usado como servidor MCP via
`bin`, não como biblioteca importável). Se um dia quiser expor tipos para consumidores
`import`arem, dá pra reativar `declaration` no `tsconfig.build.json` — mas aí é preciso
resolver a reescrita de extensões também nos `.d.ts` (limitação atual do TS com
`rewriteRelativeImportExtensions`).

## Versionamento
Use SemVer via npm: `npm version patch|minor|major` (cria commit + tag), depois
`git push --follow-tags` e `npm publish`.
