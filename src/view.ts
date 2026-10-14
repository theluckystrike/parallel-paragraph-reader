import { ItemView, MarkdownView, Modal, Notice, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type ParallelParagraphReaderPlugin from './main';
import { isPro } from './pro';
import { alignmentText, buildReading, contentStamp, layoutForWidth, pairInOrder, pairKey, parseAlignment, restorePair, validAlignment, type Alignment, type Paragraph, type ReadingRow } from './reader';

export const VIEW_ID = 'parallel-paragraph-reader';

function isDefaultMap(map: Alignment): boolean {
	const count = (side: 0 | 1) => map.filter((e) => e[side] !== null).length;
	return JSON.stringify(map) === JSON.stringify(pairInOrder(new Array<Paragraph>(count(0)), new Array<Paragraph>(count(1))));
}

function button(parent: HTMLElement, text: string, action: () => void): HTMLButtonElement {
	const b = parent.createEl('button', { text });
	b.addEventListener('click', action);
	return b;
}

class AlignmentModal extends Modal {
	constructor(private reader: ReaderView) { super(reader.app); }
	onOpen(): void {
		this.setTitle('Manual alignment (pro)');
		this.contentEl.createEl('p', { text: 'One row per line: left paragraph,right paragraph. Use - for an empty cell. Use each paragraph once, in order. Example: 1,1 then 2,- then 3,2.' });
		const input = this.contentEl.createEl('textarea', { cls: 'ppr-map', attr: { 'aria-label': 'Alignment rows', rows: '12' } });
		input.value = this.reader.editText();
		const message = this.contentEl.createEl('p', { attr: { role: 'status' } });
		button(this.contentEl, 'Save alignment', () => {
			const map = parseAlignment(input.value, this.reader.leftBlocks.length, this.reader.rightBlocks.length);
			if (!map) { message.textContent = 'Use each paragraph once, in order, with no row that has two empty cells.'; return; }
			void this.reader.saveAlignment(map).then((ok) => { if (ok) this.close(); });
		});
	}
	onClose(): void { this.contentEl.empty(); }
}

export class ReaderView extends ItemView {
	left = '';
	right = '';
	leftBlocks: Paragraph[] = [];
	rightBlocks: Paragraph[] = [];
	map: Alignment = [];
	rows: ReadingRow[] = [];
	selected = 0;
	private stamp = '';
	/** A manual map saved for older prose. Row clicks do not replace it. */
	private staleMap: Alignment | null = null;
	private generation = 0;
	private closed = false;
	private observer: ResizeObserver | null = null;
	constructor(leaf: WorkspaceLeaf, readonly reader: ParallelParagraphReaderPlugin) { super(leaf); }
	getViewType(): string { return VIEW_ID; }
	getDisplayText(): string { return 'Parallel paragraph reader'; }
	getState(): Record<string, unknown> { return { left: this.left, right: this.right }; }
	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (state && typeof state === 'object') {
			const s = state as { left?: unknown; right?: unknown };
			this.left = typeof s.left === 'string' ? s.left : '';
			this.right = typeof s.right === 'string' ? s.right : '';
		}
		await this.reload();
		await super.setState(state, result);
	}
	async onOpen(): Promise<void> {
		this.reader.views.add(this);
		this.closed = false;
		this.contentEl.addClass('ppr');
		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(this.contentEl);
		await this.reload();
	}
	async onClose(): Promise<void> {
		this.closed = true; this.generation++;
		this.observer?.disconnect(); this.observer = null;
		this.reader.views.delete(this);
		this.contentEl.empty();
		await Promise.resolve();
	}
	private resize(): void { this.contentEl.toggleClass('ppr-stacked', layoutForWidth(this.contentEl.clientWidth) === 'stacked'); }
	async reload(): Promise<void> {
		const generation = ++this.generation;
		const left = this.app.vault.getFileByPath(this.left);
		const right = this.app.vault.getFileByPath(this.right);
		this.rows = []; this.leftBlocks = []; this.rightBlocks = []; this.map = []; this.staleMap = null;
		if (!left || !right || left.extension !== 'md' || right.extension !== 'md') { this.draw('Choose two Markdown notes. If a note was moved or deleted, choose the pair again.'); return; }
		try {
			const [a, b] = await Promise.all([this.app.vault.cachedRead(left), this.app.vault.cachedRead(right)]);
			if (this.closed || generation !== this.generation) return;
			const reading = buildReading(a, b);
			if (reading.error) { this.draw(reading.error); return; }
			this.leftBlocks = reading.rows.flatMap((r) => r.left ? [r.left] : []);
			this.rightBlocks = reading.rows.flatMap((r) => r.right ? [r.right] : []);
			this.stamp = contentStamp(this.leftBlocks, this.rightBlocks);
			const saved = this.reader.settings.pairs[pairKey(this.left, this.right)];
			const restored = restorePair(this.leftBlocks, this.rightBlocks, saved, isPro());
			this.map = restored.map;
			this.staleMap = isPro() && saved?.map && saved.stamp !== this.stamp && !isDefaultMap(saved.map) ? saved.map : null;
			this.selected = restored.row;
			this.rows = this.map.map(([l, r]) => ({ left: l === null ? null : this.leftBlocks[l]!, right: r === null ? null : this.rightBlocks[r]! }));
			this.draw(restored.message);
			if (isPro() && this.selected > 0) this.scrollSelected();
		} catch (error) {
			if (!this.closed && generation === this.generation) this.draw(`Could not read the notes: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	private draw(message: string): void {
		this.contentEl.empty();
		const header = this.contentEl.createDiv({ cls: 'ppr-header' });
		header.createDiv({ text: 'Parallel Paragraph Reader', cls: 'ppr-title' });
		const toolbar = header.createDiv({ cls: 'ppr-toolbar' });
		button(toolbar, 'Choose notes', () => this.reader.chooseNotes());
		button(toolbar, 'Reload notes', () => { void this.reload(); });
		button(toolbar, 'Edit alignment (Pro)', () => { if (this.requirePro()) new AlignmentModal(this).open(); });
		button(toolbar, 'Reset alignment (Pro)', () => { void this.saveAlignment(pairInOrder(this.leftBlocks, this.rightBlocks)); });
		header.createDiv({ text: `${this.left || 'Left note'} → ${this.right || 'Right note'}`, cls: 'ppr-paths' });
		header.createDiv({ text: `${this.rows.length} rows. Select a row to mark your place. Pro saves the selected row.`, cls: 'ppr-summary' });
		if (message) header.createEl('p', { text: message, cls: 'ppr-message', attr: { role: 'status' } });
		if (!this.rows.length && !message) header.createEl('p', { text: 'No supported prose blocks. Use paragraphs separated by blank lines.' });
		const list = this.contentEl.createDiv({ cls: 'ppr-rows' });
		this.rows.forEach((row, i) => {
			const el = list.createDiv({ cls: 'ppr-row', attr: { 'data-row': String(i) } });
			el.toggleClass('ppr-selected', i === this.selected);
			const marker = button(el, `Read row ${i + 1}`, () => { void this.selectRow(i); });
			marker.addClass('ppr-marker'); marker.setAttribute('aria-pressed', String(i === this.selected));
			this.cell(el, row.left, this.left, 'left', i);
			this.cell(el, row.right, this.right, 'right', i);
		});
		this.resize();
	}
	private cell(row: HTMLElement, block: Paragraph | null, path: string, side: string, index: number): void {
		const el = row.createDiv({ cls: `ppr-cell ppr-${side}` });
		if (!block) { el.createDiv({ text: 'No paragraph', cls: 'ppr-empty' }); return; }
		button(el, `Open ${side} · line ${block.line + 1}`, () => { void this.openSource(path, block, index); });
		el.createDiv({ text: block.text, cls: 'ppr-text', attr: { dir: 'auto' } });
	}
	async selectRow(index: number): Promise<void> {
		if (!Number.isInteger(index) || index < 0 || index >= this.rows.length) return;
		this.selected = index;
		for (const el of Array.from(this.contentEl.querySelectorAll<HTMLElement>('.ppr-row'))) {
			const selected = el.dataset.row === String(index);
			el.toggleClass('ppr-selected', selected);
			el.querySelector('button')?.setAttribute('aria-pressed', String(selected));
		}
		if (isPro() && !this.staleMap) await this.persist();
	}
	/** The text for the map editor. A stale manual map is a better start than the default order. */
	editText(): string { return alignmentText(this.staleMap ?? this.map); }
	private scrollSelected(): void { this.contentEl.querySelector(`[data-row="${this.selected}"]`)?.scrollIntoView({ block: 'start' }); }
	async openSource(path: string, block: Paragraph, row: number): Promise<void> {
		try {
			await this.selectRow(row);
			const file = this.app.vault.getFileByPath(path);
			if (!file) { new Notice('The source note is missing. Choose the notes again.'); return; }
			const leaf = this.app.workspace.getLeaf('tab');
			await leaf.openFile(file, { active: true, state: { mode: 'source' } });
			if (leaf.view instanceof MarkdownView) {
				const editor = leaf.view.editor;
				const position = { line: Math.min(block.line, Math.max(0, editor.lineCount() - 1)), ch: 0 };
				editor.setCursor(position); editor.scrollIntoView({ from: position, to: position }, true);
			}
		} catch (error) { new Notice(`Could not open the source: ${error instanceof Error ? error.message : String(error)}`); }
	}
	private requirePro(): boolean {
		if (isPro()) return true;
		new Notice('This is a pro feature. Sponsor on GitHub, then sign in from the plugin settings.'); return false;
	}
	async saveAlignment(map: Alignment): Promise<boolean> {
		if (!this.requirePro() || !this.rows.length || !validAlignment(map, this.leftBlocks.length, this.rightBlocks.length)) return false;
		const stale = this.staleMap;
		this.map = map; this.selected = 0; this.staleMap = null;
		if (!await this.persist()) { this.staleMap = stale; return false; }
		await this.reload(); return true;
	}
	private async persist(): Promise<boolean> {
		if (!isPro()) return false;
		const key = pairKey(this.left, this.right);
		delete this.reader.settings.pairs[key];
		this.reader.settings.pairs[key] = { stamp: this.stamp, map: this.map, row: this.selected };
		try { await this.reader.saveSettings(); return true; }
		catch (error) {
			new Notice(`Could not save the pair: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}
}
