// ============================================================================
//  indexCache — guarda o índice de vetores em disco (pra não reindexar sempre)
// ============================================================================
//
//  O PROBLEMA QUE ISSO RESOLVE:
//  Gerar embeddings é CARO (é a parte lenta). Reindexar o mesmo PDF a cada
//  execução é desperdício. Solução: depois de indexar uma vez, SALVAMOS o
//  resultado num arquivo. Na próxima vez, se nada mudou, apenas CARREGAMOS —
//  a busca fica instantânea.
//
//  COMO SABER SE "NADA MUDOU"? Uma ASSINATURA.
//  Guardamos junto uma "impressão digital" da entrada: nomes+tamanhos+datas dos
//  arquivos + a config de chunking + o modelo + a precisão (dtype). Se a
//  assinatura salva == a assinatura atual, o cache vale. Se algo mudou (você
//  trocou o PDF ou o tamanho do chunk), a assinatura muda e reindexamos.
//  Isso é "cache invalidation" — um dos problemas clássicos da computação. :)
// ============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { StoredEntry } from './inMemoryVectorStore.ts';

export interface CachedIndex {
  readonly signature: string; // "impressão digital" da entrada
  readonly entries: StoredEntry[]; // chunks + vetores já calculados
}

/** Lê o índice salvo. Devolve null se não existir ou estiver ilegível. */
export async function loadIndex(path: string): Promise<CachedIndex | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as CachedIndex;
  } catch {
    return null; // sem cache (1ª vez) ou arquivo corrompido → reindexa
  }
}

/** Salva o índice (cria a pasta se preciso). */
export async function saveIndex(path: string, data: CachedIndex): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data), 'utf-8');
}
