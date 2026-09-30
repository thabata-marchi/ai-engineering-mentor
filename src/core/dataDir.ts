// ============================================================================
//  dataDir — where the mentor keeps its files (Step 22)
// ============================================================================
//
//  The index cache and the study profile live in a `data/` folder. Before, it was
//  ALWAYS `<cwd>/data` — fine from a clone, but MCP clients (e.g. Claude Desktop
//  on macOS) start servers with cwd = "/", which is read-only: saving the index
//  failed and the server died right after indexing.
//
//  Rules, in order:
//    1. DATA_DIR set        → use it (relative paths resolve against cwd).
//    2. cwd is the fs root  → ~/.ai-engineering-mentor (a writable, stable home).
//    3. otherwise           → <cwd>/data (same as before — clones keep working).
//
//  Pure function: receives cwd/home instead of reading the process, so the tests
//  cover every branch without touching the disk.
// ============================================================================

import { isAbsolute, join, parse, resolve } from 'node:path';

export interface DataDirInput {
  readonly dataDir?: string; // DATA_DIR from the environment
  readonly cwd: string; // process.cwd()
  readonly home: string; // os.homedir()
}

export function resolveDataDir({ dataDir, cwd, home }: DataDirInput): string {
  if (dataDir) return isAbsolute(dataDir) ? dataDir : resolve(cwd, dataDir);
  if (parse(cwd).root === cwd) return join(home, '.ai-engineering-mentor');
  return join(cwd, 'data');
}
