import { describe, expect, it, vi } from 'vitest';
import { AtlasAppChild } from '../src/main';
import { TFile } from 'obsidian';


class FakeIntersectionObserver {
  static latest: FakeIntersectionObserver;
  private readonly callback: IntersectionObserverCallback;
  readonly disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.latest = this;
  }

  observe(): void {}

  async trigger(): Promise<void> {
    this.callback([], this as unknown as IntersectionObserver);
    await Promise.resolve();
    await Promise.resolve();
  }
}

vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

class FakeIframe {
  className = '';
  srcdoc = '';
  removed = false;
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, Set<() => void>>();
  readonly contentWindow = { postMessage: vi.fn() };

  setAttr(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(name: string, listener: () => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: () => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }

  remove(): void {
    this.removed = true;
  }
}

function createHarness(visible = true) {
  let isVisible = visible;
  const iframe = new FakeIframe();
  const container = {
    isConnected: true,
    getClientRects: () => (isVisible ? ([{}] as unknown as DOMRectList) : ([] as unknown as DOMRectList)),
    createEl: vi.fn((tag: string) => {
      expect(tag).toBe('iframe');
      return iframe;
    }),
  } as unknown as HTMLElement;
  const readFile = vi.fn(async () => '<main id="app">ready</main>');
  const child = new AtlasAppChild(
    container,
    { entry: 'app.html', height: 480, connect: [] },
    new TFile(),
    readFile,
  );
  return { child, container, iframe, readFile, setVisible: (value: boolean) => { isVisible = value; } };
}

describe('AtlasAppChild lifecycle', () => {
  it('mounts one opaque sandboxed iframe and transfers one port', async () => {
    const { child, container, iframe, readFile } = createHarness();

    await child.onload();

    expect(readFile).toHaveBeenCalledOnce();
    expect(container.createEl).toHaveBeenCalledOnce();
    expect(iframe.className).toBe('atlas-app-iframe');
    expect(iframe.attributes.get('sandbox')).toBe('allow-scripts');
    expect(iframe.attributes.get('referrerpolicy')).toBe('no-referrer');
    expect(iframe.style.height).toBe('480px');
    expect(iframe.srcdoc).toContain('<main id="app">ready</main>');

    iframe.dispatch('load');
    iframe.dispatch('load');
    expect(iframe.contentWindow.postMessage).toHaveBeenCalledOnce();
    expect(iframe.listeners.get('load')?.size ?? 0).toBe(0);
  });

  it('removes the iframe and prevents remount after unload', async () => {
    const { child, iframe, readFile } = createHarness();
    await child.onload();

    child.unload();
    await child.onload();

    expect(iframe.removed).toBe(true);
    expect(readFile).toHaveBeenCalledOnce();
  });

  it('mounts, unmounts, and remounts as renderer visibility changes', async () => {
    const { child, container, iframe, readFile, setVisible } = createHarness(false);
    await child.onload();

    expect(container.createEl).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();

    setVisible(true);
    await FakeIntersectionObserver.latest.trigger();
    expect(container.createEl).toHaveBeenCalledOnce();
    expect(readFile).toHaveBeenCalledOnce();

    setVisible(false);
    await FakeIntersectionObserver.latest.trigger();
    expect(iframe.removed).toBe(true);

    setVisible(true);
    await FakeIntersectionObserver.latest.trigger();
    expect(container.createEl).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('does not mount after a hidden renderer is unloaded', async () => {
    const { child, container, readFile, setVisible } = createHarness(false);
    await child.onload();
    child.unload();

    setVisible(true);
    await FakeIntersectionObserver.latest.trigger();

    expect(container.createEl).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(FakeIntersectionObserver.latest.disconnect).toHaveBeenCalledOnce();
  });
});
