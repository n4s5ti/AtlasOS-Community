/**
 * Atlas App Runtime — Obsidian Plugin
 *
 * Renders vault-local single-file HTML apps in secure sandboxed iframes
 * with origin isolation via manifest-declared connect-src, per-render
 * MessageChannel, and bounded resize.
 */

import { Plugin, MarkdownRenderChild, TFile } from 'obsidian';
import { parseManifest, AppManifest } from './manifest';
import { buildCsp } from './csp';
import { buildSandboxDocument } from './document';

/** Sentinel key used to secure MessagePort transfer. */
const CHANNEL_ID_SENTINEL = '__atlas_channel_id__';

export default class AtlasAppRuntimePlugin extends Plugin {
  override onload(): void {
    this.registerMarkdownCodeBlockProcessor(
      'atlas-app',
      (source: string, el: HTMLElement, ctx) => {
        // ── Parse manifest synchronously ──────────────────────────────
        const result = parseManifest(source);
        if (!result.ok) {
          el.createEl('pre', { text: `Atlas App error: ${result.error}` });
          return;
        }

        const manifest = result.data;

        // ── Resolve entry file (must be .html TFile) ──────────────────
        const file = this.app.metadataCache.getFirstLinkpathDest(
          manifest.entry,
          ctx.sourcePath,
        );
        if (!file || !(file instanceof TFile) || file.extension.toLowerCase() !== 'html') {
          el.createEl('pre', {
            text: `Atlas App error: entry "${manifest.entry}" not found`,
          });
          return;
        }

        // ── Create child synchronously, BEFORE any await ──────────────
        // ctx.addChild establishes ownership immediately so the child
        // can safely await file reading inside its async onload().
        const child = new AtlasAppChild(
          el,
          manifest,
          file,
          (f: TFile) => this.app.vault.cachedRead(f),
        );
        ctx.addChild(child);
      },
    );
  }
}

// ── UUID generation ───────────────────────────────────────────────────────

/**
 * Generate a version-4 UUID using crypto.randomUUID() when available,
 * falling back to crypto.getRandomValues() for older environments.
 */
function generateUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback: UUID v4 via getRandomValues
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  let uuid = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) uuid += '-';
    uuid += bytes[i].toString(16).padStart(2, '0');
  }
  return uuid;
}

// ── Iframe child component ────────────────────────────────────────────────

const MIN_HEIGHT = 240;
const MAX_HEIGHT = 4000;

/** Function signature for vault file reading. */
export type FileReader = (file: TFile) => Promise<string>;

/**
 * Owns one renderer instance. A host ResizeObserver mounts only while this
 * Reading/Live Preview container is visible and tears the frame down when
 * Obsidian hides that renderer tree.
 */
export class AtlasAppChild extends MarkdownRenderChild {
  private readonly manifest: AppManifest;
  private readonly entryFile: TFile;
  private readonly readFile: FileReader;
  private channel: MessageChannel | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private channelId: string | null = null;
  private loadHandler: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private mountGeneration = 0;
  private mounting = false;
  private disposed = false;

  constructor(
    containerEl: HTMLElement,
    manifest: AppManifest,
    entryFile: TFile,
    readFile: FileReader,
  ) {
    super(containerEl);
    this.manifest = manifest;
    this.entryFile = entryFile;
    this.readFile = readFile;
  }

  override async onload(): Promise<void> {
    const sync = (): void => {
      void this.syncVisibility();
    };
    this.resizeObserver = new ResizeObserver(sync);
    this.intersectionObserver = new IntersectionObserver(sync);
    this.resizeObserver.observe(this.containerEl);
    this.intersectionObserver.observe(this.containerEl);
    this.register(() => this.cleanup());
    await this.syncVisibility();
  }

  override onunload(): void {
    this.cleanup();
  }

  private isMountable(): boolean {
    return this.containerEl.isConnected && this.containerEl.getClientRects().length > 0;
  }

  private async syncVisibility(): Promise<void> {
    if (this.disposed) return;
    if (!this.isMountable()) {
      this.unmountFrame();
      return;
    }
    if (this.iframe || this.mounting) return;

    const generation = ++this.mountGeneration;
    this.mounting = true;
    try {
      const html = await this.readFile(this.entryFile);
      if (
        this.disposed ||
        generation !== this.mountGeneration ||
        !this.isMountable()
      ) {
        return;
      }
      this.mountFrame(html);
    } catch {
      if (!this.disposed && generation === this.mountGeneration && this.isMountable()) {
        this.containerEl.createEl('pre', {
          text: `Atlas App error: failed to read "${this.manifest.entry}"`,
        });
      }
    } finally {
      if (generation === this.mountGeneration) this.mounting = false;
    }
  }

  private mountFrame(html: string): void {
    const channelId = generateUUID();
    const csp = buildCsp({ connect: this.manifest.connect });
    const doc = buildSandboxDocument(html, csp, channelId);
    const iframe = this.containerEl.createEl('iframe');

    this.channelId = channelId;
    this.iframe = iframe;
    iframe.className = 'atlas-app-iframe';
    iframe.setAttr('sandbox', 'allow-scripts');
    iframe.setAttr('loading', 'lazy');
    iframe.setAttr('referrerpolicy', 'no-referrer');
    iframe.style.height = `${this.manifest.height}px`;

    const channel = new MessageChannel();
    this.channel = channel;
    channel.port1.onmessage = (event: MessageEvent) => this.handlePortMessage(event);
    channel.port1.start();

    this.loadHandler = () => {
      if (!this.channel || this.disposed || !this.loadHandler) return;
      iframe.removeEventListener('load', this.loadHandler);
      this.loadHandler = null;
      iframe.contentWindow?.postMessage(
        { [CHANNEL_ID_SENTINEL]: channelId },
        '*',
        [channel.port2],
      );
    };
    iframe.addEventListener('load', this.loadHandler);
    iframe.srcdoc = doc;
  }

  private unmountFrame(): void {
    ++this.mountGeneration;
    this.sendDispose();
    this.channel?.port1.close();
    this.channel = null;
    if (this.iframe && this.loadHandler) {
      this.iframe.removeEventListener('load', this.loadHandler);
    }
    this.loadHandler = null;
    this.iframe?.remove();
    this.iframe = null;
    this.channelId = null;
    this.mounting = false;
  }

  private cleanup(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver = null;
    this.unmountFrame();
  }

  private sendDispose(): void {
    if (!this.channel || !this.channelId) return;
    try {
      this.channel.port1.postMessage({
        type: 'dispose',
        channelId: this.channelId,
      });
    } catch {
      // The transferred port may already be closed during renderer teardown.
    }
  }

  private handlePortMessage(event: MessageEvent): void {
    const data = event.data;
    if (!data || typeof data !== 'object' || data.channelId !== this.channelId) return;
    if (data.type !== 'resize') return;
    const height = data.height;
    if (typeof height !== 'number' || !Number.isInteger(height)) return;
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));
    if (this.iframe) this.iframe.style.height = `${clamped}px`;
  }
}

