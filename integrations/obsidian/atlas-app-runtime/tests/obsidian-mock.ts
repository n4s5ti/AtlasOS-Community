export class Plugin {}

export class TFile {
  extension = 'html';
}

export class MarkdownRenderChild {
  readonly containerEl: HTMLElement;
  private readonly callbacks: Array<() => void> = [];

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }

  register(callback: () => void): void {
    this.callbacks.push(callback);
  }

  unload(): void {
    for (const callback of this.callbacks.splice(0)) callback();
    this.onunload();
  }

  onload(): void | Promise<void> {}
  onunload(): void {}
}

// ── Atlas App Note activation mocks ───────────────────────────────────

/** Minimal CachedMetadata shape used by isAtlasAppNote. */
export interface CachedMetadata {
  frontmatter?: Record<string, unknown> | null;
}

/** Mock MarkdownView — supports file identity, getMode, and leaf access. */
export class MarkdownView {
  file: TFile | null = null;
  leaf: WorkspaceLeaf;
  private _mode: 'source' | 'preview' = 'source';

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
  }

  getMode(): 'source' | 'preview' {
    return this._mode;
  }

  setMode(mode: 'source' | 'preview'): void {
    this._mode = mode;
  }
}

/** Mock WorkspaceLeaf — supports view state get/set. */
export class WorkspaceLeaf {
  viewState: ViewState = { type: 'empty' };

  getViewState(): ViewState {
    return { ...this.viewState };
  }

  async setViewState(state: ViewState): Promise<void> {
    this.viewState = { ...state };
  }
}

export interface ViewState {
  type: string;
  state?: Record<string, unknown>;
  active?: boolean;
  pinned?: boolean;
}

/** Mock MetadataCache — supports getFileCache. */
export class MetadataCache {
  getFileCache(_file: TFile): CachedMetadata | null {
    return null;
  }
}

/** Mock Workspace — supports getActiveViewOfType. */
export class Workspace {
  getActiveViewOfType<T>(_type: new (...args: unknown[]) => T): T | null {
    return null;
  }
}

/** Mock App — provides metadataCache and workspace. */
export class App {
  metadataCache = new MetadataCache();
  workspace = new Workspace();
}
