# Public API check

The builder read the signatures in obsidian 1.14.4 at node_modules/obsidian/obsidian.d.ts before use. The minimum API gate gives 1.13.0. The first supported public app release is 1.13.4.

| Purpose | Public signatures used |
| --- | --- |
| Plugin life cycle | Plugin.onload, Plugin.onunload, Component.register, Component.registerInterval |
| Commands and tabs | Plugin.addCommand, Plugin.registerView, Plugin.addSettingTab |
| Data | Plugin.loadData, Plugin.saveData |
| Note picker | FuzzySuggestModal constructor, getItems, getItemText, onChooseItem, SuggestModal.setPlaceholder, Modal.open, Modal.close |
| Reading view | ItemView constructor and contentEl, View.getViewType, getDisplayText, getState, setState, onOpen, onClose |
| Note reads | Vault.getFiles, Vault.getFileByPath, Vault.cachedRead, TFile.path, TFile.extension |
| Workspace | Workspace.getLeaf, Workspace.onLayoutReady, WorkspaceLeaf.setViewState, WorkspaceLeaf.openFile, WorkspaceLeaf.view |
| Source cursor | MarkdownView.editor, Editor.lineCount, Editor.setCursor, Editor.scrollIntoView |
| Map dialog | Modal constructor, Modal.setTitle, Modal.contentEl, Modal.onOpen, Modal.onClose |
| Settings | PluginSettingTab constructor, getSettingDefinitions, SettingTab.update, Setting.addButton, ButtonComponent.setButtonText, ButtonComponent.onClick |
| Messages and DOM | Notice constructor, HTMLElement.createEl, createDiv, empty, addClass, toggleClass |
| Sponsor adapter | requestUrl, App.secretStorage, SecretStorage.getSecret, SecretStorage.setSecret, App.loadLocalStorage, App.saveLocalStorage |

ResizeObserver, DOM event listeners, textContent, dataset and scrollIntoView are browser APIs. The product runtime imports no Node or Electron module. The tests and the screenshot harness use those modules outside the runtime bundle.
