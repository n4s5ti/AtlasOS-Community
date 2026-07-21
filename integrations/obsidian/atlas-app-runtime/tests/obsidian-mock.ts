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
