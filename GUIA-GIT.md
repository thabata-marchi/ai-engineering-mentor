# 📦 Guia de Git — commits de estudo + repo privado

## Convenção de commit (Conventional Commits)
Formato: `tipo: descrição curta no imperativo`
- **feat**: nova funcionalidade
- **fix**: correção de bug
- **test**: adiciona/ajusta testes
- **docs**: documentação
- **refactor**: melhora o código sem mudar comportamento
- **chore**: setup, config, tarefas gerais

Exemplos: `feat: Etapa 3 - embeddings com OpenAI`, `test: cobre chunk vazio`.

## Fluxo a cada passinho
```bash
npm test                       # 1. garanta que está tudo verde
git add -A                     # 2. prepara as mudanças
git commit -m "feat: ..."      # 3. commit pequeno e atômico
```
> Regra de ouro: **um commit = uma ideia**. Se a descrição precisa de "e", talvez sejam 2 commits.

---

## Criar o repositório PRIVADO no GitHub

> ⚠️ Esta parte precisa da **sua conta** (login) — por isso você faz, eu te guio.

### Opção A — pelo site (mais simples)
1. Vá em https://github.com/new
2. Nome: `ai-engineering-mentor` · Visibilidade: **Private** ·
   **NÃO** marque "Add a README" (o projeto já tem um).
3. Crie. O GitHub mostra a URL do repo.
4. No terminal, dentro da pasta do projeto:
```bash
git remote add origin https://github.com/SEU_USUARIO/ai-engineering-mentor.git
git push -u origin main
```

### Opção B — pelo GitHub CLI (se tiver o `gh` instalado)
```bash
gh auth login     # só na primeira vez
gh repo create ai-engineering-mentor --private --source=. --remote=origin --push
```

### Depois do primeiro push
Toda vez que quiser mandar novos commits pro GitHub:
```bash
git push
```

---

## Checagem de segurança (importante!)
- O `.gitignore` já impede subir `node_modules/`, `.venv/`, segredos (`.env`) e a `.qodo/`.
- **Nunca** faça commit de chaves de API. Quando criarmos o `.env` (Etapa 3), ele
  fica de fora do Git; só o `.env.example` (com placeholders) é versionado.
