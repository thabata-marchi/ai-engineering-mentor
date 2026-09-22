// ============================================================================
//  FileParser — dispatcher: picks the right parser by the file extension
// ============================================================================
//
//  THE PROBLEM:
//  We now have TWO parsers (text and PDF). The CLI shouldn't be full of "if it's
//  a .pdf do this, if it's .md do that". That's coupling and repetition.
//
//  THE SOLUTION (design pattern):
//  A "dispatcher" that ALSO implements `DocumentParserPort` and, internally,
//  delegates to the right parser based on the extension. To the caller it stays
//  "a single parser". This combines the Composite pattern (an object that groups
//  others of the same type) with Strategy (picks the strategy at runtime).
//
//  BENEFIT: to support a new format tomorrow (e.g. .docx), we create the adapter
//  and register it here — the CLI and the use case change NOTHING.
// ============================================================================

import { extname } from 'node:path';

import type { Document } from '../core/models.ts';
import type { DocumentParserPort } from '../core/ports.ts';
import { TextFileParser } from './textFileParser.ts';
import { PdfParser } from './pdfParser.ts';

export class FileParser implements DocumentParserPort {
  private readonly text = new TextFileParser();
  private readonly pdf = new PdfParser();

  async parse(path: string): Promise<Document> {
    const ext = extname(path).toLowerCase();

    if (ext === '.pdf') return this.pdf.parse(path);
    if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
      return this.text.parse(path);
    }

    throw new Error(
      `FileParser cannot read "${ext || 'no extension'}". Supported: .pdf, .md, .markdown, .txt.`,
    );
  }

  /** Tells whether a file is supported (handy for the CLI to filter the folder). */
  static supports(path: string): boolean {
    const ext = extname(path).toLowerCase();
    return ['.pdf', '.md', '.markdown', '.txt'].includes(ext);
  }
}
