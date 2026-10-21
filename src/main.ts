import { FuzzySuggestModal, Notice, Plugin, type TFile } from 'obsidian';
import { createGitHubSponsors } from './license/github-obsidian';
import type { SponsorsManager } from './license/index';
import { SPONSORS, bindPro, resetPro } from './pro';
import { DEFAULT_SETTINGS, normalizeSettings, ReaderSettingTab, type ReaderSettings } from './settings';
import { ReaderView, VIEW_ID } from './view';
import { setupHello } from './hello/index';
import WHATS_NEW from './whats-new.json';

class NotePicker extends FuzzySuggestModal<TFile> {
	constructor(private reader: ParallelParagraphReaderPlugin, title: string, private choose: (file: TFile) => void) { super(reader.app); this.setPlaceholder(title); }
	getItems(): TFile[] { return this.reader.app.vault.getFiles().filter((f) => f.extension === 'md'); }
	getItemText(file: TFile): string { return file.path; }
	onChooseItem(file: TFile): void { this.choose(file); }
}

export default class ParallelParagraphReaderPlugin extends Plugin {
	settings: ReaderSettings = { pairs: { ...DEFAULT_SETTINGS.pairs } };
	pro: SponsorsManager | null = null;
	readonly views = new Set<ReaderView>();
	private writes: Promise<void> = Promise.resolve();
	async onload(): Promise<void> {
		// First: "What's new" reads its state before the settings load (packages/hello). It does not wait.
		setupHello(this, WHATS_NEW);
		await this.loadSettings();
		const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
		pro.init(); this.pro = pro; bindPro(pro);
		const tab = new ReaderSettingTab(this);
		this.addSettingTab(tab);
		this.register(pro.onChange(() => { tab.update(); for (const view of this.views) void view.reload(); }));
		this.registerView(VIEW_ID, (leaf) => new ReaderView(leaf, this));
		this.addCommand({ id: 'choose-notes', name: 'Choose two notes', callback: () => this.chooseNotes() });
		this.app.workspace.onLayoutReady(() => {
			void pro.refresh();
			this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000));
		});
	}
	onunload(): void { resetPro(); }
	chooseNotes(): NotePicker {
		const picker = new NotePicker(this, 'Choose the left note', (left) => {
			new NotePicker(this, 'Choose the right note', (right) => { void this.openPair(left.path, right.path); }).open();
		});
		picker.open();
		return picker;
	}
	async openPair(left: string, right: string): Promise<void> {
		try { await this.app.workspace.getLeaf('tab').setViewState({ type: VIEW_ID, active: true, state: { left, right } }); }
		catch (error) { new Notice(`Could not open the pair: ${error instanceof Error ? error.message : String(error)}`); }
	}
	async loadSettings(): Promise<void> { this.settings = normalizeSettings(await this.loadData() as unknown); }
	saveSettings(): Promise<void> {
		this.settings = normalizeSettings(this.settings);
		const snapshot = JSON.parse(JSON.stringify(this.settings)) as ReaderSettings;
		this.writes = this.writes.catch(() => undefined).then(() => this.saveData(snapshot));
		return this.writes;
	}
}
