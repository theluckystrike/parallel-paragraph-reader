import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { PRO_UI } from './pro';
import type ParallelParagraphReaderPlugin from './main';
import { validAlignment, type Alignment } from './reader';
import { helloSettingItems } from './hello/settings';

export interface SavedPair { stamp: string; map: Alignment | null; row: number }
export interface ReaderSettings { pairs: Record<string, SavedPair> }
export const DEFAULT_SETTINGS: ReaderSettings = { pairs: {} };

export function normalizeSettings(value: unknown): ReaderSettings {
	const pairs: Record<string, SavedPair> = {};
	if (!value || typeof value !== 'object' || !('pairs' in value) || !value.pairs || typeof value.pairs !== 'object') return { pairs };
	for (const [key, raw] of Object.entries(value.pairs).slice(-50)) {
		if (!raw || typeof raw !== 'object') continue;
		const v = raw as Partial<SavedPair>;
		if (typeof v.stamp !== 'string' || v.stamp.length > 12_001_000 || !Number.isInteger(v.row) || v.row! < 0 || v.row! >= 200) continue;
		let map: Alignment | null = null;
		if (Array.isArray(v.map)) {
			const l = v.map.filter((e) => Array.isArray(e) && e[0] !== null).length;
			const r = v.map.filter((e) => Array.isArray(e) && e[1] !== null).length;
			if (l > 100 || r > 100 || !validAlignment(v.map, l, r)) continue;
			map = v.map;
		}
		pairs[key] = { stamp: v.stamp, row: v.row!, map };
	}
	return { pairs };
}

export class ReaderSettingTab extends PluginSettingTab {
	constructor(private reader: ParallelParagraphReaderPlugin) { super(reader.app, reader); }
	getSettingDefinitions(): SettingDefinitionItem[] {
		// The product rows, then the "More from NoteMods" card (packages/hello).
		return [...this.productSettingDefinitions(), ...helloSettingItems()];
	}

	productSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ name: 'Reading pane', desc: 'Choose two notes from the command palette. Use Reload notes after a source edit. Notes are read as plain text.' },
			...(this.reader.pro ? sponsorsSettingItems(this.reader.pro, PRO_UI) : []),
			{ name: 'Clear saved pairs', desc: 'Remove saved alignment maps and row positions from this vault.', render: (setting) => { setting.addButton((b) => b.setButtonText('Clear saved pairs').onClick(async () => { this.reader.settings.pairs = {}; await this.reader.saveSettings(); for (const v of this.reader.views) await v.reload(); })); } },
		];
	}
}
