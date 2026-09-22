# Publishing (checklist)

> ⚠️ **These steps are run by YOU.** They involve credentials (npm/GitHub login) and
> irreversible actions (publishing). The assistant prepares the package, but doesn't
> log in, doesn't touch tokens and doesn't publish for you.

## 0. First of all
- [ ] Decide whether the repository will become **public** on GitHub.
- [ ] Confirm that **no secret** is versioned: `git grep -i "sk-or"` should come back
      empty; the `data/` folder and `.env` must be ignored.

## 1. Local verification (run it freely)
```bash
npm run typecheck        # types ok
npm test                 # green suite
npm run build            # generates dist/ (plain JS) that will be published
npm pack --dry-run       # shows EXACTLY which files go in the package
```
> `npm pack --dry-run` respects the package.json `files` field. Check that `src/`,
> `tests/`, `data/`, `.env`, `.vscode/` do **not** go in — only `dist/`, `README.md`,
> `LICENSE`, `SECURITY.md` and `.env.example`.

## 2. Package name (check availability)
```bash
npm view ai-engineering-mentor   # if it returns 404, the name is free
```
- [ ] If the name is **taken**, use a scope with your npm username: set `"name"` to
      `"@YOUR_USERNAME/ai-engineering-mentor"` and add
      `"publishConfig": { "access": "public" }` in package.json.
      (This project is published as `@thabata-marchi/ai-engineering-mentor`.)

## 3. Publish to npm (YOU run it)
```bash
npm login                # opens the login flow (you do it)
npm publish              # prepublishOnly runs typecheck + tests + BUILD automatically
```
> `prepublishOnly` = `typecheck && test && build`: if any step fails, publishing is
> aborted. The `build` generates `dist/` (plain JS), which is what goes in the package.
> Note on 2FA: npm requires a second factor to publish. If your 2FA is only a security
> key (no authenticator app / TOTP), `--otp` has no code to give — either add an
> authenticator app under Account → Two-Factor Authentication, or publish using a
> **granular access token** (`npm config set //registry.npmjs.org/:_authToken <TOKEN>`).

## 4. GitHub / open source
- [ ] Make the repository public (Settings → General → Change visibility).
- [ ] Check that `LICENSE` (MIT), `README.md`, `CONTRIBUTING.md` and `SECURITY.md`
      show up on the repo page.
- [ ] (Optional) Create a *release*/tag to match the npm version.

## 5. How the package is built (Step 15 — build)
We publish **compiled JS** in `dist/`, not the raw `.ts`:
- `npm run build` runs `tsc -p tsconfig.build.json`, which compiles `src` + the MCP
  entry to `dist/` (plain JS). `rewriteRelativeImportExtensions` rewrites the imports
  `./x.ts` → `./x.js` **only in the output** — so the source keeps running native TS in
  dev (`npm run mcp`, etc.), and the published package runs on any modern Node **with
  no flags**.
- The `bin` `ai-engineering-mentor-mcp` points to `dist/examples/mcp.js` (with a
  shebang), so `npx <package>` starts the MCP server directly.
- The `files` field only includes `dist/` + docs → the `.ts`, `tests/` and `data/`
  don't go in the package.

Note: today we publish **JS without `.d.ts` types** (the package is used as an MCP
server via `bin`, not as an importable library). If you ever want to expose types for
`import`ers, you can re-enable `declaration` in `tsconfig.build.json` — but then you
need to solve the extension rewriting in the `.d.ts` files too (a current TS
limitation with `rewriteRelativeImportExtensions`).

## Versioning
Use SemVer via npm: `npm version patch|minor|major` (creates a commit + tag), then
`git push --follow-tags` and `npm publish`.
