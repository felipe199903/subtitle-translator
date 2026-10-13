import { promises as fs } from 'fs';
import path from 'path';
import { config } from './config';

/**
 * "Sincronia" tab: reads the CSVs written on the media server by tools/bazarr/medir_sincronia.py
 * (sincronia.csv, how far each PT-BR film subtitle is from the video) and corrigir_sincronia.py
 * (correcao.csv, what was done about it). Read-only; the files are mounted at SYNC_DIR.
 */
export const SYNC_FILES = ['sincronia.csv', 'correcao.csv'];

/** Minimal RFC 4180 parser (paths may contain commas and quotes). */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endField();
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    endField();
    rows.push(row);
  }
  const [head, ...body] = rows.filter(r => r.length > 1 || r[0]);
  if (!head) return [];
  const names = head.map(h => h.replace(/^﻿/, ''));
  return body.map(r => Object.fromEntries(names.map((h, i) => [h, r[i] ?? ''])));
}

export type Measure = 'ok' | 'leve' | 'atraso' | 'enorme' | 'ritmo' | 'nao_confiavel' | 'erro';

export const MEASURE_LABELS: Record<Measure, string> = {
  ok: 'Em sincronia (≤ 0,3 s)',
  leve: 'Leve (0,3–1 s)',
  atraso: 'Atraso de 1–60 s',
  enorme: 'Enorme (> 60 s)',
  ritmo: 'Ritmo diferente (PAL/NTSC)',
  nao_confiavel: 'Medição não confiável',
  erro: 'Erro ao medir',
};

/** Same thresholds as the scripts on the server. */
export function measure(r: Record<string, string>): Measure {
  if (r.erro) return 'erro';
  if (r.confiavel === '0') return 'nao_confiavel';
  if (Math.abs(Number(r.ritmo || 1) - 1) > 0.001) return 'ritmo';
  const d = Math.abs(Number(r.atraso_s || 0));
  return d <= 0.3 ? 'ok' : d <= 1 ? 'leve' : d <= 60 ? 'atraso' : 'enorme';
}

export const ACTION_LABELS: Record<string, string> = {
  corrigida: 'Corrigidas (ressincronizadas)',
  ja_estava_ok: 'Mantidas (já estavam certas)',
  apagada: 'Apagadas (de outra versão)',
  sumiu: 'Sumiram antes da correção',
  erro: 'Erro na correção',
};
const actionKey = (a: string) => (a.startsWith('erro') ? 'erro' : a);

export interface SyncData {
  measured: Array<Record<string, string>>;
  actions: Array<Record<string, string>>;
  updatedAt: Record<string, Date | null>;
}

export async function loadSync(): Promise<SyncData | null> {
  const read = async (f: string) => {
    const file = path.join(config.syncDir, f);
    const st = await fs.stat(file).catch(() => null);
    return st ? { rows: parseCsv(await fs.readFile(file, 'utf8')), at: st.mtime } : { rows: [], at: null };
  };
  const [m, c] = await Promise.all(SYNC_FILES.map(read));
  if (!m.at && !c.at) return null;
  return { measured: m.rows, actions: c.rows, updatedAt: { 'sincronia.csv': m.at, 'correcao.csv': c.at } };
}

export function summary(d: SyncData) {
  const byMeasure = Object.fromEntries(Object.keys(MEASURE_LABELS).map(k => [k, 0])) as Record<Measure, number>;
  for (const r of d.measured) byMeasure[measure(r)]++;
  const byAction: Record<string, number> = {};
  const treated = new Set<string>();
  for (const r of d.actions) {
    const k = actionKey(r.acao);
    byAction[k] = (byAction[k] ?? 0) + 1;
    treated.add(r.legenda);
  }
  const toFix = d.measured.filter(r => !['ok', 'erro'].includes(measure(r)) && !treated.has(r.legenda)).length;
  const inSync = byMeasure.ok + (byAction.corrigida ?? 0) + (byAction.ja_estava_ok ?? 0);
  return { byMeasure, byAction, toFix, inSync, total: d.measured.length };
}

/** Rows of correcao.csv with one action (or the latest ones), newest first. */
export function actionsOf(d: SyncData, action: string | null, limit: number) {
  const rows = action ? d.actions.filter(r => actionKey(r.acao) === action) : d.actions;
  return rows.slice(-limit).reverse();
}
