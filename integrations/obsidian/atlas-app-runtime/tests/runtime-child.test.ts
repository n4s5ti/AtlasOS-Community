import { describe, it, expect } from 'vitest';
import { buildChildScript } from '../src/runtime-child';

/**
 * Contract tests for buildChildScript(channelId: string): string
 *
 * Produces a self-executing IIFE string for the sandboxed iframe.
 * Includes message port handshake, ready/resize protocol, and dispose lifecycle.
 */

const sampleChannel = 'atlas-render-42';

describe('buildChildScript — structure', () => {
  it('returns a non-empty string', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toBeTruthy();
    expect(typeof script).toBe('string');
  });

  it('is a valid IIFE', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/^\(function\(\)/);
    expect(script.endsWith('})();')).toBe(true);
  });
});

describe('buildChildScript — port handshake', () => {
  it('embeds the channel ID in the script', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain(sampleChannel);
  });

  it('listens for window message events', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/addEventListener\(['"]message['"]/);
  });

  it('accepts and wires the transferred MessagePort', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('event.ports');
    expect(script).toContain('port.onmessage =');
    expect(script).toContain('port.start()');
  });

  it('sends a ready message once port is connected', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/type.*['"]ready['"]/);
  });

  it('removes the window message listener after first port transfer', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/removeEventListener\(['"]message['"]/);
  });
});

describe('buildChildScript — resize protocol', () => {
  it('sends a resize message', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/type.*['"]resize['"]/);
  });

  it('includes document.documentElement.scrollHeight in resize', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('scrollHeight');
  });

  it('uses a ResizeObserver', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('ResizeObserver');
  });

  it('debounces resize notifications with setTimeout', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('setTimeout');
    expect(script).toContain('resizeTimer');
  });
});

describe('buildChildScript — dispose lifecycle', () => {
  it('handles dispose messages from the parent', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/type.*['"]dispose['"]/);
    expect(script).toContain('handleDispose');
  });

  it('rejects parent messages for a different channel', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/handlePortMessage[\s\S]*data\.channelId !== CHANNEL_ID/);
  });

  it('disconnects the ResizeObserver on dispose', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('resizeObserver.disconnect()');
  });

  it('clears the resize timer on dispose', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('clearTimeout');
    expect(script).toContain('resizeTimer = null');
  });

  it('clears initial resize work and load listeners on dispose', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('clearTimeout(initialResizeTimer)');
    expect(script).toContain("removeEventListener('load', loadListener)");
  });

  it('closes the MessagePort on dispose', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('port.close()');
    expect(script).toContain('port.onmessage = null');
    expect(script).toContain('port = null');
  });

  it('cleans up on pagehide event', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/pagehide/);
    expect(script).toMatch(/handleDispose/);
  });
});
