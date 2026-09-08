// ============================================================================
//  FileParser — despachante: escolhe o parser certo pela extensão do arquivo
// ============================================================================
//
//  O PROBLEMA:
//  Agora temos DOIS parsers (texto e PDF). O CLI não deveria ficar cheio de "if
//  é .pdf faz isso, se é .md faz aquilo". Isso é acoplamento e repetição.
//
//  A SOLUÇÃO (padrão de projeto):
//  Um "despachante" que TAMBÉM implementa o `DocumentParserPort` e, por dentro,
//  delega para o parser adequado conforme a extensão. Pra quem chama, continua
//  sendo "um parser" só. Isso combina o padrão Composite (um objeto que agrupa
//  outros do mesmo tipo) com o Strategy (escolhe a estratégia em tempo de execução).
//
//  BENEFÍCIO: pra suportar um novo formato (ex.: .docx) amanhã, criamos o adapter
//  e registramos aqui — o CLI e o caso de uso não mudam NADA.
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
      `FileParser não sabe ler "${ext || 'sem extensão'}". Suportados: .pdf, .md, .markdown, .txt.`,
    );
  }

  /** Diz se um arquivo é suportado (útil pro CLI filtrar a pasta). */
  static suporta(path: string): boolean {
    const ext = extname(path).toLowerCase();
    return ['.pdf', '.md', '.markdown', '.txt'].includes(ext);
  }
}
