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
npm pack --dry-run       # mostra EXATAMENTE quais arquivos irão no pacote
```
> O `npm pack --dry-run` respeita o campo `files` do package.json. Confira que
> **não** entram `tests/`, `data/`, `.env`, `.vscode/` — só `src/`, `examples/`,
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
npm publish              # o prepublishOnly roda typecheck + testes automaticamente
```
> `prepublishOnly` já está configurado: se os testes falharem, a publicação é
> abortada. Bom seguro contra publicar algo quebrado.

## 4. GitHub / open source
- [ ] Torne o repositório público (Settings → General → Change visibility).
- [ ] Confira que `LICENSE` (MIT), `README.md`, `CONTRIBUTING.md` e `SECURITY.md`
      aparecem na página do repo.
- [ ] (Opcional) Crie uma *release*/tag `v0.1.0` para casar com a versão do npm.

## 5. Sobre "publicar TypeScript sem build" (decisão honesta)
Este pacote publica o **código-fonte `.ts`** (não há passo de build), coerente com a
escolha do projeto de rodar TS nativo. Implicação para quem instalar:
- Precisa de **Node >= 22.6** e rodar com `--experimental-strip-types`.
- Isso é ótimo para **estudo/portfólio**, mas incomum para uma lib de produção
  ampla. Se um dia quiser distribuição "tradicional" (JS + tipos `.d.ts` para
  qualquer consumidor), aí sim adicionamos um passo de build (`tsc` → `dist/`) e
  apontamos `main`/`types`/`exports` para o `dist`. Fica como evolução futura —
  não é necessário para o objetivo atual.

## Versionamento
Use SemVer via npm: `npm version patch|minor|major` (cria commit + tag), depois
`git push --follow-tags` e `npm publish`.
