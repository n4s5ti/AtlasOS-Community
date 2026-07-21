import { describe, it, expect } from 'vitest';
import { buildCsp } from '../src/csp';

/**
 * Contract tests for buildCsp(manifest: { connect: string[] }): string
 *
 * Produces a Content-Security-Policy header value as a single string.
 * Every directive is explicitly set — no browser defaults leak through.
 * connect-src lists manifest origins or 'none'.
 * All directives use 'none' as their fallback-safe default.
 */

// ── Core structure ──────────────────────────────────────────────────────

describe('buildCsp — structure', () => {
  it('returns a non-empty string for empty connect', () => {
    const csp = buildCsp({ connect: [] });
    expect(csp).toBeTruthy();
    expect(typeof csp).toBe('string');
  });

  it('contains all required directives', () => {
    const csp = buildCsp({ connect: [] });
    expect(csp).toContain('default-src');
    expect(csp).toContain('script-src');
    expect(csp).toContain('style-src');
    expect(csp).toContain('img-src');
    expect(csp).toContain('font-src');
    expect(csp).toContain('media-src');
    expect(csp).toContain('connect-src');
    expect(csp).toContain('frame-src');
    expect(csp).toContain('object-src');
    expect(csp).toContain('base-uri');
    expect(csp).toContain('form-action');
    expect(csp).toContain('worker-src');
  });

  it('directives are separated by semicolons', () => {
    const csp = buildCsp({ connect: [] });
    const parts = csp.split(';').map((s) => s.trim()).filter(Boolean);
    expect(parts.length).toBeGreaterThanOrEqual(11);
  });

  it('uses single quotes for CSP keyword values', () => {
    const csp = buildCsp({ connect: [] });
    expect(csp).toContain("'none'");
    expect(csp).toContain("'unsafe-inline'");
  });

  it('does not use double quotes for CSP directives', () => {
    const csp = buildCsp({ connect: [] });
    expect(csp).not.toContain('"none"');
    expect(csp).not.toContain('"unsafe-inline"');
  });
});

// ── Directive-specific values ────────────────────────────────────────────

describe('buildCsp — directive values', () => {
  it('sets default-src to none', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/default-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe("'none'");
  });

  it('sets script-src to unsafe-inline', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/script-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe("'unsafe-inline'");
  });

  it('sets style-src to unsafe-inline', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/style-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe("'unsafe-inline'");
  });

  it('sets img-src to data: blob:', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/img-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    const sources = match![1].trim().split(/\s+/);
    expect(sources).toContain('data:');
    expect(sources).toContain('blob:');
    expect(sources).toHaveLength(2);
  });

  it('sets font-src to data:', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/font-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe('data:');
  });

  it('sets media-src to data: blob:', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/media-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    const sources = match![1].trim().split(/\s+/);
    expect(sources).toContain('data:');
    expect(sources).toContain('blob:');
    expect(sources).toHaveLength(2);
  });

  it('sets frame-src to none', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/frame-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe("'none'");
  });

  it('sets object-src to none', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/object-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe("'none'");
  });

  it('sets base-uri to none', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/base-uri\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe("'none'");
  });

  it('sets form-action to none', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/form-action\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe("'none'");
  });
});

// ── connect-src ─────────────────────────────────────────────────────────

describe('buildCsp — connect-src', () => {
  it('sets connect-src to none when connect array is empty', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/connect-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).toBe("'none'");
  });

  it('sets connect-src to a single origin', () => {
    const csp = buildCsp({ connect: ['https://api.example.com'] });
    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://api.example.com');
    expect(csp).toContain("default-src 'none'");
  });

  it('does not grant connect origins to unrelated directives', () => {
    const origin = 'https://api.example.com';
    const csp = buildCsp({ connect: [origin] });

    for (const directive of ['default-src', 'frame-src', 'object-src', 'base-uri', 'form-action']) {
      expect(csp).toContain(`${directive} 'none'`);
      expect(csp).not.toContain(`${directive} ${origin}`);
    }
  });

  it('sets connect-src with multiple origins separated by space', () => {
    const origins = ['https://api.example.com', 'https://cdn.example.com'];
    const csp = buildCsp({ connect: origins });
    const match = csp.match(/connect-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    const sources = match![1].trim().split(/\s+/);
    expect(sources).toEqual(origins);
  });

  it('sets connect-src with http:// origin', () => {
    const csp = buildCsp({ connect: ['http://localhost:8080'] });
    expect(csp).toContain('http://localhost:8080');
  });

  it('sets connect-src with http:// and https:// mixed', () => {
    const origins = ['http://localhost:8080', 'https://api.example.com'];
    const csp = buildCsp({ connect: origins });
    const match = csp.match(/connect-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    const sources = match![1].trim().split(/\s+/);
    expect(sources).toHaveLength(2);
    expect(sources).toContain('http://localhost:8080');
    expect(sources).toContain('https://api.example.com');
  });
});

// ── Determinism ─────────────────────────────────────────────────────────

describe('buildCsp — determinism', () => {
  it('returns identical output for same input', () => {
    const manifest = { connect: ['https://api.example.com'] };
    const a = buildCsp(manifest);
    const b = buildCsp(manifest);
    expect(a).toBe(b);
  });

  it('returns identical output for empty connect', () => {
    const a = buildCsp({ connect: [] });
    const b = buildCsp({ connect: [] });
    expect(a).toBe(b);
  });

  it('preserves origin order in connect-src', () => {
    const origins = ['https://first.example.com', 'https://second.example.com'];
    const csp = buildCsp({ connect: origins });
    const match = csp.match(/connect-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    const sources = match![1].trim().split(/\s+/);
    expect(sources[0]).toBe('https://first.example.com');
    expect(sources[1]).toBe('https://second.example.com');
  });

  it('no directive appears more than once', () => {
    const csp = buildCsp({ connect: ['https://api.example.com'] });
    for (const dir of [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'media-src',
      'connect-src',
      'frame-src',
      'object-src',
      'base-uri',
      'form-action',
    ]) {
      // Use a regex that matches the directive followed by a space or semicolon
      const re = new RegExp(`\\b${dir}\\b`, 'g');
      const matches = csp.match(re);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBe(1);
    }
  });
});

// ── Security invariants ─────────────────────────────────────────────────

describe('buildCsp — security invariants', () => {
  it('never includes unsafe-eval', () => {
    const csp = buildCsp({ connect: ['https://api.example.com'] });
    expect(csp).not.toContain('unsafe-eval');
  });

  it('never includes * in any source directive', () => {
    const csp = buildCsp({ connect: ['https://api.example.com'] });
    // * should never appear as a CSP source value
    // Note: https://* would match but shouldn't appear either
    expect(csp).not.toMatch(/\*\s*(?:;|$)/);
  });

  it('connect-src never falls back to * or unsafe-inline', () => {
    const csp = buildCsp({ connect: [] });
    const match = csp.match(/connect-src\s+(.+?)(?:;|$)/);
    expect(match).toBeTruthy();
    expect(match![1].trim()).not.toBe('*');
    expect(match![1].trim()).not.toBe("'unsafe-inline'");
    expect(match![1].trim()).toBe("'none'");
  });

  it('no directive is missing its value', () => {
    const csp = buildCsp({ connect: ['https://api.example.com'] });
    const parts = csp.split(';').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      // Each part should have a directive-name and at least one source
      const tokens = part.split(/\s+/);
      expect(tokens.length).toBeGreaterThanOrEqual(2);
    }
  });
});
