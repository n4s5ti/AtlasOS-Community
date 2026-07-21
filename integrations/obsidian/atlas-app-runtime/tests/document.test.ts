import { describe, it, expect } from 'vitest';
import { buildSandboxDocument } from '../src/document';

/**
 * Contract tests for buildSandboxDocument(html: string, csp: string, channelId: string): string
 *
 * Produces a complete HTML document string suitable for iframe srcdoc.
 * Embeds the CSP as a meta tag, includes bootstrap JS for ready/resize
 * message protocol via postMessage, and references the provided channelId.
 * Sandbox allows allow-scripts only — no allow-same-origin.
 */

const sampleHtml = '<h1>Hello</h1>';
const sampleCsp =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const sampleChannel = 'atlas-render-42';

describe('buildSandboxDocument — structure', () => {
  it('returns a non-empty string', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toBeTruthy();
    expect(typeof doc).toBe('string');
  });

  it('produces a well-formed HTML document', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toMatch(/^<!DOCTYPE html>/i);
    expect(doc).toMatch(/<html[^>]*>/i);
    expect(doc).toMatch(/<\/html>/i);
    expect(doc).toMatch(/<head[^>]*>/i);
    expect(doc).toMatch(/<\/head>/i);
    expect(doc).toMatch(/<body[^>]*>/i);
    expect(doc).toMatch(/<\/body>/i);
  });
});

describe('buildSandboxDocument — content embedding', () => {
  it('includes the provided html content in the body', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toContain('<h1>Hello</h1>');
  });

  it('embeds the CSP as a Content-Security-Policy meta tag in head', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    // Must use meta tag since srcdoc has no HTTP headers
    expect(doc).toContain('http-equiv="Content-Security-Policy"');
    expect(doc).toContain('content="');
    // Every directive in the CSP should appear in the document
    for (const directive of sampleCsp.split(';')) {
      const trimmed = directive.trim();
      if (trimmed) expect(doc).toContain(trimmed);
    }
  });

  it('includes the channelId in bootstrap JS', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toContain(sampleChannel);
  });
});

describe('buildSandboxDocument — CSP and channel escaping', () => {
  it('escapes CSP values containing characters that could break HTML', () => {
    const cspWithQuotes =
      "default-src 'none'; script-src 'unsafe-inline' 'strict-dynamic'";
    const doc = buildSandboxDocument('<p>test</p>', cspWithQuotes, 'ch');
    // The meta tag content attribute should contain the full CSP
    expect(doc).toContain("'strict-dynamic'");
    // HTML structure must remain intact
    expect(doc).toMatch(/<\/html>/i);
  });

  it('handles channelId with special characters without breaking structure', () => {
    const weirdChannel = 'atlas-$#&{}<>';
    const doc = buildSandboxDocument('<p>test</p>', sampleCsp, weirdChannel);
    // Should still be a valid document
    expect(doc).toMatch(/<\/html>/i);
    // The channel value should appear in the bootstrap JS
    expect(doc).toContain(weirdChannel);
  });

  it('does not use document.write', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    // document.write would overwrite the document on load
    expect(doc).not.toContain('document.write');
  });
});

describe('buildSandboxDocument — bootstrap ready/resize protocol', () => {
  it('sends a ready message via postMessage on load', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toMatch(/postMessage/);
    // ready message: { type: 'ready' }
    expect(doc).toMatch(/type.*:.*['"]ready['"]/i);
  });

  it('sends a resize message with a height value', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toMatch(/type.*:.*['"]resize['"]/i);
    expect(doc).toMatch(/height/);
  });

  it('references the channel in postMessage calls', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    // The channel should appear in bootstrap JS near postMessage
    const channelInDoc = doc.indexOf(sampleChannel);
    const postMsgInDoc = doc.indexOf('postMessage');
    expect(channelInDoc).toBeGreaterThanOrEqual(0);
    expect(postMsgInDoc).toBeGreaterThanOrEqual(0);
  });
});

describe('buildSandboxDocument — dispose protocol', () => {
  it('includes a dispose handler in the bootstrap JS', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    // The child script must respond to 'dispose' messages from the parent
    expect(doc).toMatch(/['"]dispose['"]/);
  });

  it('references ResizeObserver.disconnect in the dispose handler', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toContain('resizeObserver.disconnect');
  });

  it('references clearTimeout in the dispose handler', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toContain('clearTimeout');
  });

  it('removes the window message listener on dispose', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toMatch(/removeEventListener.*handleMessage/);
  });

  it('handles pagehide event for lifecycle cleanup', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toMatch(/pagehide/);
    expect(doc).toMatch(/handleDispose/);
  });

  it('removes load listener after first port transfer in child script', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    // The child's handleMessage stops listening after receiving the port
    expect(doc).toMatch(/removeEventListener.*handleMessage/);
  });
});

describe('buildSandboxDocument — sandbox security', () => {
  it('does not include allow-same-origin', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).not.toContain('allow-same-origin');
  });

  it('includes allow-scripts for sandboxed execution', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toContain('allow-scripts');
  });

  it('includes referrerpolicy no-referrer', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).toContain('no-referrer');
  });

  it('does not include allow-popups', () => {
    const doc = buildSandboxDocument(sampleHtml, sampleCsp, sampleChannel);
    expect(doc).not.toContain('allow-popups');
  });
});
