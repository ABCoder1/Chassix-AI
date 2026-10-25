import { CATALOGS } from './knowledge';
import type { ChassisId } from './model';

export type ExpressionRow = { gene: string; log2fc: number; padj: number | null };
export type ExpressionDataset = { name: string; chassis: ChassisId; origin: 'synthetic' | 'uploaded'; rows: ExpressionRow[]; loadedAt: string; note: string };
export function exampleExpression(chassis: ChassisId): ExpressionDataset {
  const values = [1.52, 2.07, -0.65, 1.33, 0.84, -0.42];
  return { name: `synthetic-${chassis}-example-v1`, chassis, origin: 'synthetic', loadedAt: '2026-10-24T00:00:00Z',
    note: 'Invented example values for interface exploration. Not a published experiment; independent of environmental sliders.',
    rows: CATALOGS[chassis].genes.map((gene, index) => ({ gene: gene.id, log2fc: values[index % values.length], padj: null })) };
}

// A bounded CSV reader supports quoted fields and escaped quotes without evaluating content.
function csvRecords(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (character === ',' || character === '\n' || character === '\r')) {
      row.push(value.trim()); value = '';
      if (character !== ',') { if (row.some((cell) => cell !== '')) rows.push(row); row = []; if (character === '\r' && text[i + 1] === '\n') i++; }
    } else value += character;
  }
  if (quoted) throw new Error('A quoted CSV field is not closed. Export the table as a valid CSV and try again.');
  row.push(value.trim()); if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}
export function parseExpressionCSV(text: string, name: string, chassis: ChassisId, timestamp = new Date().toISOString()): ExpressionDataset {
  if (text.length > 1_000_000) throw new Error('Use a CSV smaller than 1 MB. Keep only the gene, log2fc, and optional padj columns.');
  const [header, ...records] = csvRecords(text.replace(/^\uFEFF/, ''));
  if (!header || !records.length) throw new Error('Include a header and at least one gene row: gene,log2fc,padj.');
  const names = header.map((cell) => cell.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('CSV column names must be unique.');
  const geneColumn = names.indexOf('gene'), foldColumn = names.indexOf('log2fc'), pColumn = names.indexOf('padj');
  if (geneColumn < 0 || foldColumn < 0) throw new Error('Required columns are gene and log2fc. padj is optional.');
  if (records.length > 10000) throw new Error('Use at most 10,000 gene rows for this local preview.');
  const seen = new Set<string>();
  const rows = records.map((cells, index) => {
    const line = index + 2;
    if (cells.length !== header.length) throw new Error(`Row ${line}: the number of fields does not match the header.`);
    const gene = cells[geneColumn].trim(); const fold = cells[foldColumn].trim();
    if (!gene || gene.length > 100 || !/^[a-zA-Z0-9_.:-]+$/.test(gene)) throw new Error(`Row ${line}: use a gene symbol or locus ID, such as HSF1 or PF1974.`);
    const normalized = gene.toUpperCase();
    if (seen.has(normalized)) throw new Error(`Row ${line}: duplicate gene ${gene}. Provide one result per gene.`);
    seen.add(normalized);
    if (!fold || !Number.isFinite(Number(fold))) throw new Error(`Row ${line}: log2fc must be a finite number.`);
    const pText = pColumn >= 0 ? cells[pColumn].trim() : '';
    const padj = pText === '' ? null : Number(pText);
    if (padj !== null && (!Number.isFinite(padj) || padj < 0 || padj > 1)) throw new Error(`Row ${line}: padj must be empty or a number from 0 to 1.`);
    return { gene, log2fc: Number(fold), padj };
  });
  return { name, chassis, origin: 'uploaded', rows, loadedAt: timestamp, note: 'User-supplied differential expression. Species, contrast, units, and analysis quality are not independently verified. No regulatory activity is inferred.' };
}
export function expressionFor(dataset: ExpressionDataset | null, gene: string): ExpressionRow | undefined {
  return dataset?.rows.find((row) => row.gene.toUpperCase() === gene.toUpperCase());
}
