export interface Paragraph { text: string; line: number }
export type Alignment = [number | null, number | null][];
export interface ReadingRow { left: Paragraph | null; right: Paragraph | null }
export const BLOCK_LIMIT = 100;
export const SOURCE_LIMIT = 1_000_000;
export const SIZE_MESSAGE = 'Size limit: use notes with at most 100 prose blocks and 1,000,000 characters each.';

/** Prose lines retain their zero-based source line. Unsupported blocks end at a blank line. */
export function extractProse(source: string): Paragraph[] {
	const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
	const blocks: Paragraph[] = [];
	let start = 0;
	if (lines[0]?.trim() === '---') {
		const end = lines.findIndex((s, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(s));
		if (end < 0) return [];
		start = end + 1;
	}
	let pending: string[] = [];
	let line = 0;
	let fence: { char: string; size: number } | null = null;
	let excluded = false;
	const flush = () => {
		if (pending.length) blocks.push({ text: pending.join('\n'), line });
		pending = [];
	};
	for (let i = start; i < lines.length; i++) {
		const s = lines[i]!;
		if (fence) {
			const close = s.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
			if (close && close[1]![0] === fence.char && close[1]!.length >= fence.size) fence = null;
			continue;
		}
		const open = s.match(/^ {0,3}(`{3,}|~{3,})/);
		if (open) { flush(); fence = { char: open[1]![0]!, size: open[1]!.length }; excluded = false; continue; }
		if (!s.trim()) { flush(); excluded = false; continue; }
		if (excluded) continue;
		if (/^ {0,3}#{1,6}(\s|$)/.test(s) || /^ {0,3}(?:[-*_]\s*){3,}$/.test(s)) { flush(); continue; }
		if (/^ {0,3}(?:>|[-+*]\s|\d+[.)]\s)/.test(s) || /^(?: {4}|\t)/.test(s) || s.includes('|')) {
			flush(); excluded = true; continue;
		}
		if (i + 1 < lines.length && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1]!)) { pending = []; i++; continue; }
		if (!pending.length) line = i;
		pending.push(s);
		if (blocks.length > BLOCK_LIMIT) break;
	}
	flush();
	return blocks;
}

export function pairInOrder(left: Paragraph[], right: Paragraph[]): Alignment {
	return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [i < left.length ? i : null, i < right.length ? i : null]);
}

/** A map uses each paragraph once, in source order, with an optional empty cell. */
export function validAlignment(value: unknown, leftCount: number, rightCount: number): value is Alignment {
	if (!Array.isArray(value) || value.length > leftCount + rightCount) return false;
	let l = 0;
	let r = 0;
	for (const entry of value as unknown[]) {
		if (!Array.isArray(entry) || entry.length !== 2 || (entry[0] === null && entry[1] === null)) return false;
		if (entry[0] !== null && entry[0] !== l++) return false;
		if (entry[1] !== null && entry[1] !== r++) return false;
	}
	return l === leftCount && r === rightCount;
}

export function parseAlignment(text: string, leftCount: number, rightCount: number): Alignment | null {
	const value: Alignment = [];
	for (const s of text.trim().split('\n').filter((v) => v.trim())) {
		const m = s.match(/^\s*(\d+|-)\s*,\s*(\d+|-)\s*$/);
		if (!m) return null;
		value.push([m[1] === '-' ? null : Number(m[1]) - 1, m[2] === '-' ? null : Number(m[2]) - 1]);
	}
	return validAlignment(value, leftCount, rightCount) ? value : null;
}

export function alignmentText(map: Alignment): string {
	return map.map(([l, r]) => `${l === null ? '-' : l + 1},${r === null ? '-' : r + 1}`).join('\n');
}

export function layoutForWidth(width: number): 'stacked' | 'columns' { return width < 600 ? 'stacked' : 'columns'; }

export function buildReading(leftText: string, rightText: string): { rows: ReadingRow[]; error: string | null } {
	if (leftText.length > SOURCE_LIMIT || rightText.length > SOURCE_LIMIT) return { rows: [], error: SIZE_MESSAGE };
	const l = extractProse(leftText);
	const r = extractProse(rightText);
	if (l.length > BLOCK_LIMIT || r.length > BLOCK_LIMIT) return { rows: [], error: SIZE_MESSAGE };
	return { rows: pairInOrder(l, r).map(([a, b]) => ({ left: a === null ? null : l[a]!, right: b === null ? null : r[b]! })), error: null };
}

export function pairKey(left: string, right: string): string { return JSON.stringify([left, right]); }
export function contentStamp(left: Paragraph[], right: Paragraph[]): string { return JSON.stringify([left.map((b) => b.text), right.map((b) => b.text)]); }

export interface PairSnapshot { stamp: string; map: Alignment | null; row: number }

/** Saved state applies only to unchanged prose while the sponsor check enables Pro. */
export function restorePair(left: Paragraph[], right: Paragraph[], saved: PairSnapshot | undefined, pro: boolean): { map: Alignment; row: number; message: string } {
	const fallback = { map: pairInOrder(left, right), row: 0, message: '' };
	if (!pro || !saved) return fallback;
	if (saved.stamp !== contentStamp(left, right)) return { ...fallback, message: 'The prose changed. The saved map and row were not used. Review and save a new map.' };
	const map = validAlignment(saved.map, left.length, right.length) ? saved.map : fallback.map;
	return { map, row: Math.min(saved.row, Math.max(0, map.length - 1)), message: '' };
}
