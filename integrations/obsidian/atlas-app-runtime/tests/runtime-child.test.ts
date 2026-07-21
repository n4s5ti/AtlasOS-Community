import { describe, it, expect } from 'vitest';
import { Script } from 'node:vm';
import { buildChildScript } from '../src/runtime-child';

/**
 * Contract tests for buildChildScript(channelId: string): string
 *
 * Produces a self-executing IIFE string for the sandboxed iframe.
 * Includes message port handshake, ready/resize protocol, dispose lifecycle,
 * and the frozen window.atlasHost.request API.
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
    expect(script).toContain('sendResize');
    expect(script).toContain('\'resize\'');
  });

  it('includes document.documentElement.scrollHeight in resize', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('document.documentElement.scrollHeight');
  });

  it('uses a ResizeObserver', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('ResizeObserver');
    expect(script).toContain('resizeObserver.observe');
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

  it('rejects all pending requests on dispose', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('for (var id in pendingRequests)');
    expect(script).toContain('.reject(new Error(\'Disposed\'))');
  });
});

describe('buildChildScript — atlasHost.request API', () => {
  it('exposes window.atlasHost as a frozen object', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('window.atlasHost = Object.freeze');
  });

  it('exposes a request method', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('request: function(method, params)');
  });

  it('returns a Promise from request', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('return new Promise');
  });

  it('generates request IDs using crypto.getRandomValues', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('crypto.getRandomValues');
    expect(script).toContain('generateRequestId');
  });

  it('includes request ID character set', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-');
  });

  it('sets a 10 second timeout on pending requests', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('setTimeout');
    expect(script).toContain('Request timed out');
    expect(script).toContain('10000');
  });

  it('sends typed request messages over the port', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain("type: 'request'");
    expect(script).toContain('channelId: CHANNEL_ID');
    expect(script).toContain('id: id');
    expect(script).toContain('method: method');
    expect(script).toContain('params: params');
  });

  it('keeps a pending requests map', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('var pendingRequests');
    expect(script).toContain('pendingRequests[id]');
  });

  it('handles response messages from the parent', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toMatch(/data\.type === ['"]response['"]/);
  });

  it('resolves pending promise on successful response', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('pending.resolve(data.result)');
  });

  it('rejects pending promise on error response', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('pending.reject');
    expect(script).toContain('data.error');
  });

  it('clears timeout timer on response', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('clearTimeout(pending.timer)');
    expect(script).toContain('delete pendingRequests[data.id]');
  });

  it('catches port.postMessage failure and rejects', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('try {');
    expect(script).toContain('port.postMessage(');
    expect(script).toContain('Failed to send request');
  });

  it('generates request IDs using the configured character set', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('REQ_CHARS');
    expect(script).toContain('REQ_ID_LEN');
    expect(script).toContain('REQ_TIMEOUT_MS');
  });

  it('signals when the authenticated host API becomes available', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain("CustomEvent('atlas-host-ready')");
  });

  it('does not overwrite an existing pending request on an ID collision', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('while (pendingRequests[id])');
  });

  it('removes the host API during disposal', () => {
    const script = buildChildScript(sampleChannel);
    expect(script).toContain('delete window.atlasHost');
  });


  it.each([sampleChannel, `quote'"`, '</script><script>throw 1</script>'])(
    'emits syntactically valid JavaScript for channel data',
    (channelId) => {
      expect(() => new Script(buildChildScript(channelId))).not.toThrow();
    },
  );

});
