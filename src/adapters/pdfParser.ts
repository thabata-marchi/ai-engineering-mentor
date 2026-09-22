// ============================================================================
//  PdfParser — ADAPTER that reads PDFs and extracts the text (Step 2b)
// ============================================================================
//
//  WHY A SEPARATE PARSER?
//  A PDF is not plain text: it's a LAYOUT format (positions, fonts, columns). To
//  pull the text out, we need a library that "understands" the format. We use
//  `unpdf` — modern, made for ESM/TypeScript and with NO native dependency (it
//  wraps Mozilla's pdf.js). Source: https://www.npmjs.com/package/unpdf
//
//  THE SAME CONTRACT AS ALWAYS:
//  It implements the SAME `DocumentParserPort` as TextFileParser. That is: to the
//  rest of the system, "reading a .md" and "reading a .pdf" are the same operation
//  — only the adapter changes. That's Liskov Substitution (the "L" of SOLID) in practice.
//
//  ⚠️ HONEST LIMITATION:
//  PDF extraction is imperfect: tables, code in columns and headers/footers may come
//  out scrambled. For study it's fine; if the quality bothers you, you can clean the
//  text afterward (a future improvement, not now — YAGNI).
// ============================================================================

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';

import type { Document } from '../core/models.ts';
import type { DocumentParserPort } from '../core/ports.ts';

export class PdfParser implements DocumentParserPort {
  async parse(path: string): Promise<Document> {
    const ext = extname(path).toLowerCase();
    if (ext !== '.pdf') {
      throw new Error(`PdfParser only reads .pdf (got "${ext || 'no extension'}").`);
    }

    // 1. Read the raw file (bytes) and hand it to pdf.js.
    const buffer = await readFile(path);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));

    // 2. Extract the text from all pages together (mergePages: true → 1 string).
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    return {
      id: basename(path, ext), // name without extension
      source: basename(path), // file name → used to cite the source
      text,
      metadata: { ext, totalPages }, // we keep the page count (traceability)
    };
  }
}
