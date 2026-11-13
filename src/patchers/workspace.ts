import { OpenViewState, PaneType, Workspace, WorkspaceLeaf, parseLinktext, Platform } from 'obsidian';
import { around } from 'monkey-around';

import PDFPlus from 'main';
import { focusObsidian } from 'utils';


export const patchWorkspace = (plugin: PDFPlus) => {
    const app = plugin.app;
    const lib = plugin.lib;

    plugin.register(around(Workspace.prototype, {
        openLinkText(old) {
            return function (linktext: string, sourcePath: string, newLeaf?: PaneType | boolean, openViewState?: OpenViewState) {
                if ((plugin.settings.openPDFWithDefaultApp || plugin.settings.singleTabForSinglePDF || plugin.settings.openLinkNextToExistingPDFTab || plugin.settings.paneTypeForFirstPDFLeaf) && !newLeaf) { // respect `newLeaf` when it's not `false`
                    const { path } = parseLinktext(linktext);
                    const file = lib.getFirstLinkpathDest(path, sourcePath);

                    if (file && file.extension === 'pdf') {

                        if (Platform.isDesktopApp && plugin.settings.openPDFWithDefaultApp) {
                            if (plugin.settings.openPDFWithDefaultAppAndObsidian && plugin.settings.syncWithDefaultApp) {
                                return; // will be handled by the 'active-leaf-change' event handler
                            }
                            const promise = app.openWithDefaultApp(file.path);
                            if (plugin.settings.focusObsidianAfterOpenPDFWithDefaultApp) {
                                focusObsidian();
                            }
                            if (!plugin.settings.openPDFWithDefaultAppAndObsidian) {
                                return promise;
                            }
                        }

                        if (plugin.settings.singleTabForSinglePDF) {
                            const { exists, promise } = lib.workspace.openPDFLinkTextInExistingLeafForTargetPDF(linktext, sourcePath, openViewState, file);
                            if (exists) return promise;
                        }

                        if (plugin.settings.openLinkNextToExistingPDFTab || plugin.settings.paneTypeForFirstPDFLeaf) {
                            const pdfLeaf = lib.getPDFView()?.leaf;
                            if (pdfLeaf) {
                                if (plugin.settings.openLinkNextToExistingPDFTab && pdfLeaf.parentSplit) {
                                    const newLeaf = app.workspace.createLeafInParent(pdfLeaf.parentSplit, -1);
                                    return lib.workspace.openPDFLinkTextInLeaf(newLeaf, linktext, sourcePath, openViewState);
                                }
                            } else if (plugin.settings.paneTypeForFirstPDFLeaf) {
                                const newLeaf = lib.workspace.getLeaf(plugin.settings.paneTypeForFirstPDFLeaf);
                                return lib.workspace.openPDFLinkTextInLeaf(newLeaf, linktext, sourcePath, openViewState);
                            }
                        }
                    }
                }

                return old.call(this, linktext, sourcePath, newLeaf, openViewState);
            };
        }
    }));

    // Obsidian can open a file outside the vault ("file:/..."), but `WorkspaceLeaf.openLinkText`
    // refuses a link to it with a "file not found" notice because the link is never resolved.
    plugin.register(around(WorkspaceLeaf.prototype, {
        openLinkText(old) {
            return async function (this: WorkspaceLeaf, linktext: string, sourcePath: string, openViewState?: OpenViewState) {
                const { path, subpath } = parseLinktext(linktext);
                if (lib.isOutsideVaultPath(path)) {
                    const file = lib.getFirstLinkpathDest(path, sourcePath);
                    if (file) {
                        openViewState = openViewState ?? {};
                        openViewState.eState = { ...openViewState.eState, ...(subpath ? { subpath } : {}) };
                        return this.openFile(file, openViewState);
                    }
                }
                return old.call(this, linktext, sourcePath, openViewState);
            };
        }
    }));

    plugin.patchStatus.workspace = true;
};
