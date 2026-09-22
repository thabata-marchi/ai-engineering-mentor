// ============================================================================
//  TextFileParser — ADAPTER that reads text files (.md / .txt)
// ============================================================================
//
//  WHY IS THIS AN "ADAPTER" (and not in the core)?
//  Because it does real I/O: it READS FILES from disk. It depends on the outside
//  world (the file system). In Hexagonal Architecture, anything that touches the
//  "outside world" becomes an adapter and implements a Port — here, the
//  `DocumentParserPort`. That keeps the core pure, and lets us swap/mock reads in tests.
//
//  SCOPE (a conscious MVP decision):
//  This parser reads only TEXT and MARKDOWN. PDF requires a separate library and
//  more delicate handling (columns, code, tables) — that's the PdfParser.
//  Starting simple = "small, correct and testable".
// ============================================================================

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import type { Document } from '../core/models.ts';
import type { DocumentParserPort } from '../core/ports.ts';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

export class TextFileParser implements DocumentParserPort {
  async parse(path: string): Promise<Document> {
    const ext = extname(path).toLowerCase();

    // Fail early and with a clear message if the type is unsupported.
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(
        `TextFileParser only reads ${[...SUPPORTED_EXTENSIONS].join(', ')}. ` +
          `For "${ext || 'no extension'}", use a specific parser (PDF uses PdfParser).`,
      );
    }

    const text = await readFile(path, 'utf-8'); // async I/O → hence Promise

    return {
      id: basename(path, ext), // name without extension, e.g. "clean_code"
      source: basename(path), // file name, e.g. "clean_code.md" → to cite the source
      text,
      metadata: { ext },
    };
  }
}
