import { describe, it, expect, vi } from 'vitest';
import { isAtlasAppNote, activateAtlasAppNote } from '../src/app-note-activation';
import { TFile, MarkdownView, WorkspaceLeaf, MetadataCache, Workspace, App, CachedMetadata } from 'obsidian';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeFile(path = 'test.md'): TFile {
  const f = new TFile();
  Object.assign(f, { path, basename: path.replace(/\.[^.]+$/, ''), extension: 'md' });
  return f;
}

function makeCache(frontmatter?: Record<string, unknown> | null): CachedMetadata {
  return frontmatter !== undefined ? { frontmatter } : {};
}

function makeView(overrides?: Partial<MarkdownView>): MarkdownView {
  const leaf = new WorkspaceLeaf();
  const view = new MarkdownView(leaf);
  if (overrides) {
    if ('file' in overrides) view.file = overrides.file as TFile | null;
    if ('mode' in overrides) view.setMode(overrides.mode as 'source' | 'preview');
  }
  return view;
}

interface ViewStateShape {
  type?: string;
  state?: Record<string, unknown>;
  [key: string]: unknown;
}

function captureViewState(leaf: WorkspaceLeaf): ViewStateShape {
  return leaf.getViewState() as ViewStateShape;
}

// ── isAtlasAppNote ──────────────────────────────────────────────────────

describe('isAtlasAppNote', () => {
  it('returns false for null cache', () => {
    expect(isAtlasAppNote(null)).toBe(false);
  });

  it('returns false for cache without frontmatter', () => {
    expect(isAtlasAppNote({})).toBe(false);
  });

  it('returns false for frontmatter without the marker key', () => {
    expect(isAtlasAppNote({ frontmatter: { tags: ['test'] } })).toBe(false);
  });

  it('returns false for wrong marker value', () => {
    expect(isAtlasAppNote({ frontmatter: { 'app-runtime': 'some-other-value' } })).toBe(false);
  });

  it('returns true for exact frontmatter marker', () => {
    expect(isAtlasAppNote({ frontmatter: { 'app-runtime': 'atlas-app-runtime' } })).toBe(true);
  });

  it('returns true with other frontmatter fields alongside the marker', () => {
    expect(isAtlasAppNote({
      frontmatter: { 'app-runtime': 'atlas-app-runtime', tags: ['atlas'], title: 'My App' },
    })).toBe(true);
  });

  it('returns false for null frontmatter', () => {
    expect(isAtlasAppNote({ frontmatter: null })).toBe(false);
  });
});

// ── activateAtlasAppNote ─────────────────────────────────────────────────

describe('activateAtlasAppNote', () => {
  it('no-op when file has no atlas marker (guard 1)', async () => {
    const file = makeFile();
    const app = new App();
    const workspaceGetActiveViewOfType = vi.spyOn(app.workspace, 'getActiveViewOfType');
    const metadataGetFileCache = vi.spyOn(app.metadataCache, 'getFileCache');
    metadataGetFileCache.mockReturnValue({ frontmatter: { tags: ['test'] } });

    await activateAtlasAppNote(app, file);

    // Should not have proceeded past guard 1 — no view lookup needed
    expect(workspaceGetActiveViewOfType).not.toHaveBeenCalled();
  });

  it('no-op when no active view (guard 2)', async () => {
    const file = makeFile();
    const app = new App();
    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue(
      { frontmatter: { 'app-runtime': 'atlas-app-runtime' } },
    );
    vi.spyOn(app.workspace, 'getActiveViewOfType').mockReturnValue(null);

    await activateAtlasAppNote(app, file);

    // No exception, no state changes
    expect(app.workspace.getActiveViewOfType).toHaveBeenCalledWith(MarkdownView);
  });

  it('no-op when active view has a different file (guard 2)', async () => {
    const file = makeFile('note.md');
    const app = new App();
    const otherFile = makeFile('other.md');
    const activeView = makeView({ file: otherFile });

    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue(
      { frontmatter: { 'app-runtime': 'atlas-app-runtime' } },
    );
    vi.spyOn(app.workspace, 'getActiveViewOfType').mockReturnValue(activeView);

    await activateAtlasAppNote(app, file);

    // Leaf state unchanged
    const state = captureViewState(activeView.leaf);
    expect(state).not.toHaveProperty('state.mode');
  });

  it('no-op when already in preview mode (guard 3)', async () => {
    const file = makeFile();
    const app = new App();
    const leaf = new WorkspaceLeaf();
    leaf.viewState = { type: 'markdown', state: { file: file.path, mode: 'preview' } };
    const activeView = makeView({ file, mode: 'preview' });
    activeView.leaf = leaf;

    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue(
      { frontmatter: { 'app-runtime': 'atlas-app-runtime' } },
    );
    vi.spyOn(app.workspace, 'getActiveViewOfType').mockReturnValue(activeView);

    await activateAtlasAppNote(app, file);

    // State preserved as-is
    const state = captureViewState(leaf);
    expect(state.state?.mode).toBe('preview');
  });

  it('converts source mode to preview mode (happy path)', async () => {
    const file = makeFile('my-app.md');
    const app = new App();
    const leaf = new WorkspaceLeaf();
    leaf.viewState = {
      type: 'markdown',
      state: { file: file.path, mode: 'source' },
      active: true,
    };
    const activeView = makeView({ file, mode: 'source' });
    activeView.leaf = leaf;

    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue(
      { frontmatter: { 'app-runtime': 'atlas-app-runtime' } },
    );
    vi.spyOn(app.workspace, 'getActiveViewOfType').mockReturnValue(activeView);

    await activateAtlasAppNote(app as App, file);

    // State preserved except mode flipped to preview
    const state = captureViewState(leaf);
    expect(state.type).toBe('markdown');
    expect(state.active).toBe(true);
    expect(state.state?.mode).toBe('preview');
    expect(state.state?.file).toBe(file.path);
    // Other state fields unchanged
    expect(Object.keys(state.state ?? {})).toContain('file');
    expect(Object.keys(state.state ?? {})).toContain('mode');
  });

  it('preserves additional view state fields through the update', async () => {
    const file = makeFile();
    const app = new App();
    const leaf = new WorkspaceLeaf();
    leaf.viewState = {
      type: 'markdown',
      state: { file: file.path, mode: 'source', someExistingKey: 'preserved-value' },
      pinned: true,
    };
    const activeView = makeView({ file, mode: 'source' });
    activeView.leaf = leaf;

    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue(
      { frontmatter: { 'app-runtime': 'atlas-app-runtime' } },
    );
    vi.spyOn(app.workspace, 'getActiveViewOfType').mockReturnValue(activeView);

    await activateAtlasAppNote(app, file);

    const state = captureViewState(leaf);
    expect(state.pinned).toBe(true);
    expect(state.state?.someExistingKey).toBe('preserved-value');
    expect(state.state?.mode).toBe('preview');
  });

  it('is idempotent — calling twice keeps preview mode', async () => {
    const file = makeFile();
    const app = new App();
    const leaf = new WorkspaceLeaf();
    leaf.viewState = { type: 'markdown', state: { file: file.path, mode: 'source' } };
    const activeView = makeView({ file, mode: 'source' });
    activeView.leaf = leaf;

    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue(
      { frontmatter: { 'app-runtime': 'atlas-app-runtime' } },
    );
    // getActiveViewOfType returns the active view (first call)
    // After the first activation, if called again while still active & source it would
    // hit guard 3 because the view is still in 'source' mode in our mock (the leaf
    // state changed but the view's _mode is still 'source'). But in practice the view
    // re-renders and its getMode changes. Let's simulate properly:
    const getActiveView = vi.spyOn(app.workspace, 'getActiveViewOfType');
    getActiveView.mockReturnValue(activeView);

    await activateAtlasAppNote(app, file);
    expect(captureViewState(leaf).state?.mode).toBe('preview');

    // Second call: view's getMode() still returns 'source' in our mock
    // (the view doesn't auto-transition). The function will attempt another
    // setViewState which sets 'preview' again. This is fine — idempotent in effect.
    await activateAtlasAppNote(app, file);
    expect(captureViewState(leaf).state?.mode).toBe('preview');
  });

  it('does not update a leaf that changes during activation', async () => {
    const file = makeFile();
    const otherFile = makeFile('unrelated.md');
    const app = new App();
    const leaf = new WorkspaceLeaf();
    leaf.viewState = { type: 'markdown', state: { file: file.path, mode: 'source' } };
    const activeView = makeView({ file, mode: 'source' });
    activeView.leaf = leaf;
    const otherView = makeView({ file: otherFile, mode: 'source' });

    vi.spyOn(app.metadataCache, 'getFileCache').mockReturnValue(
      { frontmatter: { 'app-runtime': 'atlas-app-runtime' } },
    );
    const getActiveView = vi.spyOn(app.workspace, 'getActiveViewOfType');
    getActiveView.mockReturnValue(activeView);
    const setViewState = vi.spyOn(leaf, 'setViewState');

    await activateAtlasAppNote(app, file, async () => {
      getActiveView.mockReturnValue(otherView);
    });

    expect(setViewState).not.toHaveBeenCalled();
    expect(captureViewState(leaf).state?.mode).toBe('source');
  });
});
