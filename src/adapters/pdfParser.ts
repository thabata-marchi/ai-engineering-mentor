// ============================================================================
//  PdfParser — ADAPTER que lê PDFs e extrai o texto (Etapa 2b)
// ============================================================================
//
//  POR QUE UM PARSER SEPARADO?
//  PDF não é texto puro: é um formato de LAYOUT (posições, fontes, colunas). Pra
//  tirar o texto de dentro, precisamos de uma biblioteca que "entenda" o formato.
//  Usamos a `unpdf` — moderna, feita pra ESM/TypeScript e SEM dependência nativa
//  (embrulha o pdf.js da Mozilla). Fonte: https://www.npmjs.com/package/unpdf
//
//  MESMO CONTRATO DE SEMPRE:
//  Ele implementa o MESMO `DocumentParserPort` que o TextFileParser. Ou seja: pro
//  resto do sistema, "ler um .md" e "ler um .pdf" são a mesma operação — muda só
//  o adapter. É o Princípio de Substituição de Liskov (o "L" do SOLID) na prática.
//
//  ⚠️ LIMITAÇÃO HONESTA:
//  Extração de PDF é imperfeita: tabelas, código em colunas e cabeçalhos/rodapés
//  podem sair embaralhados. Pra estudo está ótimo; se a qualidade incomodar, dá
//  pra limpar o texto depois (uma melhoria futura, não agora — YAGNI).
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
      throw new Error(`PdfParser só lê .pdf (recebeu "${ext || 'sem extensão'}").`);
    }

    // 1. Lê o arquivo bruto (bytes) e entrega pro pdf.js.
    const buffer = await readFile(path);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));

    // 2. Extrai o texto de todas as páginas juntas (mergePages: true → 1 string).
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    return {
      id: basename(path, ext), // nome sem extensão
      source: basename(path), // nome do arquivo → usado pra citar a fonte
      text,
      metadata: { ext, totalPages }, // guardamos o nº de páginas (rastreabilidade)
    };
  }
}
