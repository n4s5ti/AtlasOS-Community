/** Atlas App Note detection and Reading View activation. */

import { App, TFile, CachedMetadata, MarkdownView } from 'obsidian';

const ATLAS_MARKER_KEY = 'app-runtime';
const ATLAS_MARKER_VALUE = 'atlas-app-runtime';
const ACTIVATION_ATTEMPTS = 20;
const ACTIVATION_DELAY_MS = 50;

export type ActivationWait = (milliseconds: number) => Promise<void>;

const defaultWait: ActivationWait = (milliseconds) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

export function isAtlasAppNote(cache: CachedMetadata | null): boolean {
  return cache?.frontmatter?.[ATLAS_MARKER_KEY] === ATLAS_MARKER_VALUE;
}

/**
 * Switch an opt-in app note to Reading View after Obsidian's file-open event.
 * The bounded wait covers the interval before the active MarkdownView and its
 * metadata cache become visible. No active-leaf listener is registered, so a
 * user can explicitly switch back to source mode afterward.
 */
export async function activateAtlasAppNote(
  app: App,
  file: TFile,
  wait: ActivationWait = defaultWait,
): Promise<void> {
  for (let attempt = 0; attempt < ACTIVATION_ATTEMPTS; attempt += 1) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache && !isAtlasAppNote(cache)) return;

    const activeView = app.workspace.getActiveViewOfType(MarkdownView);
    if (cache && activeView?.file === file) {
      if (activeView.getMode() !== 'source') return;

      // Yield once, then revalidate identity immediately before mutating state.
      await wait(0);
      const currentView = app.workspace.getActiveViewOfType(MarkdownView);
      if (currentView !== activeView || currentView.file !== file) return;
      if (currentView.getMode() !== 'source') return;
      if (!isAtlasAppNote(app.metadataCache.getFileCache(file))) return;

      const leaf = currentView.leaf;
      const viewState = leaf.getViewState();
      await leaf.setViewState({
        ...viewState,
        state: {
          ...(viewState.state as Record<string, unknown>),
          mode: 'preview' as const,
        },
      });
      return;
    }

    await wait(ACTIVATION_DELAY_MS);
  }
}
