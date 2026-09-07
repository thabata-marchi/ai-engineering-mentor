// ============================================================================
//  TextFileParser — ADAPTER que lê arquivos de texto (.md / .txt)
// ============================================================================
//
//  POR QUE ISSO É UM "ADAPTER" (e não fica no core)?
//  Porque ele faz I/O de verdade: LÊ ARQUIVOS do disco. Depende do mundo externo
//  (sistema de arquivos). Na Arquitetura Hexagonal, tudo que toca o "mundo lá
//  fora" vira adapter e implementa um Port — aqui, o `DocumentParserPort`.
//  Assim o núcleo continua puro, e a gente pode trocar/mockar a leitura nos testes.
//
//  ESCOPO (decisão consciente de MVP):
//  Este parser lê só TEXTO e MARKDOWN. PDF exige uma biblioteca à parte e um
//  tratamento mais delicado (colunas, código, tabelas) — fica pra Etapa 2b.
//  Começar pelo simples = "pequeno, correto e testável".
// ============================================================================

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import type { Document } from '../core/models.ts';
import type { DocumentParserPort } from '../core/ports.ts';

const EXTENSOES_SUPORTADAS = new Set(['.md', '.markdown', '.txt']);

export class TextFileParser implements DocumentParserPort {
  async parse(path: string): Promise<Document> {
    const ext = extname(path).toLowerCase();

    // Falha cedo e com mensagem clara se o tipo não for suportado.
    if (!EXTENSOES_SUPORTADAS.has(ext)) {
      throw new Error(
        `TextFileParser só lê ${[...EXTENSOES_SUPORTADAS].join(', ')}. ` +
          `Para "${ext || 'sem extensão'}", use um parser específico (PDF vem na Etapa 2b).`,
      );
    }

    const text = await readFile(path, 'utf-8'); // I/O assíncrono → por isso Promise

    return {
      id: basename(path, ext), // nome sem extensão, ex.: "clean_code"
      source: basename(path), // nome do arquivo, ex.: "clean_code.md" → p/ citar a fonte
      text,
      metadata: { ext },
    };
  }
}
