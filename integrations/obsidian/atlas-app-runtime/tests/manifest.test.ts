import { describe, it, expect } from 'vitest';
import { parseManifest, ParseResult } from '../src/manifest';

/**
 * Contract tests for parseManifest(source: string): ParseResult
 *
 * ParseResult is { ok: true; data: { entry: string; height: number; connect: string[]; filesRead: string[] } }
 *                | { ok: false; error: string }
 *
 * Guard: rejects everything that cannot produce a safe sandboxed iframe.
 * No default — every field is validated or has a safe fallback (height, connect, filesRead).
 */

// ── Helpers ──────────────────────────────────────────────────────────────

function assertOk(result: ParseResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected ok result');
  return result.data;
}

function assertErr(result: ParseResult) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('Expected error result');
  return result.error;
}

const minimalValid = JSON.stringify({
  version: 1,
  entry: 'app.html',
});

// ── Malformed / Non-object JSON ──────────────────────────────────────────

describe('parseManifest — malformed / non-object JSON', () => {
  it('rejects empty string', () => {
    const err = assertErr(parseManifest(''));
    expect(err).toBeTruthy();
  });

  it('rejects malformed JSON (truncated)', () => {
    const err = assertErr(parseManifest('{"version":1,'));
    expect(err).toBeTruthy();
  });

  it('rejects JSON number', () => {
    const err = assertErr(parseManifest('42'));
    expect(err).toBeTruthy();
  });

  it('rejects JSON string', () => {
    const err = assertErr(parseManifest('"hello"'));
    expect(err).toBeTruthy();
  });
});

// ── Version validation ───────────────────────────────────────────────────

describe('parseManifest — version', () => {
  it('rejects missing version', () => {
    const err = assertErr(parseManifest(JSON.stringify({ entry: 'app.html' })));
    expect(err).toBeTruthy();
  });

  it('rejects unknown version (2)', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 2, entry: 'app.html' })),
    );
    expect(err).toMatch(/version/i);
  });

  it('rejects version as string', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: '1', entry: 'app.html' })),
    );
    expect(err).toMatch(/version/i);
  });

  it('rejects version 0', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 0, entry: 'app.html' })),
    );
    expect(err).toMatch(/version/i);
  });

  it('rejects negative version', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: -1, entry: 'app.html' })),
    );
    expect(err).toMatch(/version/i);
  });

  it('rejects version as float', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1.1, entry: 'app.html' })),
    );
    expect(err).toMatch(/version/i);
  });
});

// ── Unknown top-level key rejection ──────────────────────────────────────

describe('parseManifest — unknown top-level keys', () => {
  it('rejects unknown key: foo', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: 'app.html', foo: 'bar' })),
    );
    expect(err).toMatch(/unknown top-level key/i);
  });

  it('rejects unknown key: type', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: 'app.html', type: 'app' })),
    );
    expect(err).toMatch(/unknown top-level key/i);
  });

  it('rejects unknown key: permissions', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: 'app.html', permissions: [] })),
    );
    expect(err).toMatch(/unknown top-level key/i);
  });
});

// ── Entry validation ─────────────────────────────────────────────────────

describe('parseManifest — entry', () => {
  it('rejects missing entry', () => {
    const err = assertErr(parseManifest(JSON.stringify({ version: 1 })));
    expect(err).toMatch(/entry/i);
  });

  it('rejects null entry', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: null })),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects non-string entry (number)', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: 42 })),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects non-string entry (array)', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: ['a.html'] })),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects entry not ending in .html', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: 'app.js' })),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects entry ending in .HTML (case)', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: 'app.HTML' })),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects entry with .htm extension', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: 'app.htm' })),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects entry with path traversal (..)', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: '../../outside.html' }),
      ),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects entry with deep path traversal', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'notes/../../../vault/secret.html',
        }),
      ),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects entry starting with /', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: '/absolute/path.html' }),
      ),
    );
    expect(err).toMatch(/entry/i);
  });

  it('rejects empty string entry', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: '' })),
    );
    expect(err).toMatch(/entry/i);
  });

  it('accepts entry with ".html" at end', () => {
    const data = assertOk(parseManifest(minimalValid));
    expect(data.entry).toBe('app.html');
  });

  it('accepts entry with folder prefix ending in .html', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'my-app/index.html' }),
      ),
    );
    expect(data.entry).toBe('my-app/index.html');
  });

  it('accepts entry with dots in the path before .html', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'some.library/app.html' }),
      ),
    );
    expect(data.entry).toBe('some.library/app.html');
  });

  it('rejects entry ending with .html/ (trailing slash)', () => {
    const err = assertErr(
      parseManifest(JSON.stringify({ version: 1, entry: 'app.html/' })),
    );
    expect(err).toMatch(/entry/i);
  });
});

// ── Height validation ────────────────────────────────────────────────────

describe('parseManifest — height', () => {
  it('defaults height to 640 when omitted', () => {
    const data = assertOk(parseManifest(minimalValid));
    expect(data.height).toBe(640);
  });

  it('rejects height below 240', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: 239 }),
      ),
    );
    expect(err).toMatch(/height/i);
  });

  it('rejects height above 4000', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: 4001 }),
      ),
    );
    expect(err).toMatch(/height/i);
  });

  it('rejects negative height', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: -100 }),
      ),
    );
    expect(err).toMatch(/height/i);
  });

  it('rejects zero height', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: 0 }),
      ),
    );
    expect(err).toMatch(/height/i);
  });

  it('rejects non-integer height (float)', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: 640.5 }),
      ),
    );
    expect(err).toMatch(/height/i);
  });

  it('rejects string height', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: '640' }),
      ),
    );
    expect(err).toMatch(/height/i);
  });

  it('rejects null height', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: null }),
      ),
    );
    expect(err).toMatch(/height/i);
  });

  it('accepts boundary height 240', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: 240 }),
      ),
    );
    expect(data.height).toBe(240);
  });

  it('accepts boundary height 4000', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: 4000 }),
      ),
    );
    expect(data.height).toBe(4000);
  });

  it('accepts height 1024', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', height: 1024 }),
      ),
    );
    expect(data.height).toBe(1024);
  });
});

// ── Connect origins validation ───────────────────────────────────────────

describe('parseManifest — connect origins', () => {
  it('defaults connect to empty array when omitted', () => {
    const data = assertOk(parseManifest(minimalValid));
    expect(data.connect).toEqual([]);
  });

  it('rejects non-array connect', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', connect: 'https://example.com' }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects null connect', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', connect: null }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects connect with non-string entry (number)', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', connect: [42] }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects connect with non-string entry (null)', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', connect: [null] }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects connect with http:// origin that includes path', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['http://example.com/api'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects connect with https:// origin including path and query', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com/path?q=1'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects relative URL as connect', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['/api/data'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects protocol-relative URL as connect', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['//example.com'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects file:// origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['file:///data'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects ftp:// origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['ftp://example.com'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects ws:// origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['ws://example.com'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects data: URI as connect', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['data:text/html,hi'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects blob: URI as connect', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['blob:uuid'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects connect entry missing protocol', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['example.com'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects empty string connect entry', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: [''],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects http:// origin with authentication credentials', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['http://user:pass@example.com'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects http:// origin with fragment', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['http://example.com#frag'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('normalizes valid https:// connect origin by stripping trailing slash', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com/'],
        }),
      ),
    );
    expect(data.connect).toEqual(['https://example.com']);
  });

  it('normalizes valid http:// connect origin by stripping trailing slash', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['http://example.com/'],
        }),
      ),
    );
    expect(data.connect).toEqual(['http://example.com']);
  });

  it('preserves valid connect origin without trailing slash', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://api.example.com'],
        }),
      ),
    );
    expect(data.connect).toEqual(['https://api.example.com']);
  });

  it('accepts http:// origin with explicit port', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['http://localhost:8080'],
        }),
      ),
    );
    expect(data.connect).toEqual(['http://localhost:8080']);
  });

  it('normalizes http:// origin with port and trailing slash', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['http://localhost:8080/'],
        }),
      ),
    );
    expect(data.connect).toEqual(['http://localhost:8080']);
  });

  it('accepts multiple valid connect origins', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: [
            'https://api.example.com',
            'https://cdn.example.com',
            'http://localhost:9090',
          ],
        }),
      ),
    );
    expect(data.connect).toEqual([
      'https://api.example.com',
      'https://cdn.example.com',
      'http://localhost:9090',
    ]);
  });

  it('deduplicates normalized origins while preserving first-occurrence order', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: [
            'https://api.example.com',
            'https://cdn.example.com',
            'https://api.example.com',
            'https://api.example.com/',
            'https://cdn.example.com',
          ],
        }),
      ),
    );
    expect(data.connect).toEqual([
      'https://api.example.com',
      'https://cdn.example.com',
    ]);
  });

  it('deduplicates with different ports', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: [
            'https://api.example.com:8080',
            'https://api.example.com',
            'https://api.example.com:8080',
          ],
        }),
      ),
    );
    expect(data.connect).toEqual([
      'https://api.example.com:8080',
      'https://api.example.com',
    ]);
  });

  it('rejects backslash in connect origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com\\evil'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects percent-encoded semicolon (%3B) in origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com%3Bevil'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects percent-encoded single quote (%27) in origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com%27test'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects percent-encoded double quote (%22) in origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com%22test'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects percent-encoded star (%2A) in origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com%2Atest'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects percent-encoded comma (%2C) in origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com%2Ctest'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects whitespace (tab) in raw origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com\t'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects control character in raw origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com\x00'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects semicolon character in raw origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com;evil'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects single quote in raw origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ["https://example.com'"],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects double quote in raw origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com"'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects comma in raw origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://example.com,evil'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects star in raw origin', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://*.example.com'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });

  it('rejects entire manifest if one connect entry is invalid', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          connect: ['https://valid.example.com', 'not-a-url'],
        }),
      ),
    );
    expect(err).toMatch(/connect/i);
  });
});

// ── Capabilities validation ──────────────────────────────────────────────

describe('parseManifest — capabilities', () => {
  it('defaults filesRead to empty array when capabilities omitted', () => {
    const data = assertOk(parseManifest(minimalValid));
    expect(data.filesRead).toEqual([]);
  });

  it('defaults filesRead to empty array when capabilities is empty object', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', capabilities: {} }),
      ),
    );
    expect(data.filesRead).toEqual([]);
  });

  it('defaults filesRead to empty array when capabilities.files is omitted', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', capabilities: { files: {} } }),
      ),
    );
    expect(data.filesRead).toEqual([]);
  });

  it('defaults filesRead to empty array when capabilities.files.read is omitted', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', capabilities: { files: { read: [] } } }),
      ),
    );
    expect(data.filesRead).toEqual([]);
  });

  it('rejects capabilities as null', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', capabilities: null }),
      ),
    );
    expect(err).toMatch(/capabilities/i);
  });

  it('rejects capabilities as string', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', capabilities: 'yes' }),
      ),
    );
    expect(err).toMatch(/capabilities/i);
  });

  it('rejects capabilities as array', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', capabilities: [] }),
      ),
    );
    expect(err).toMatch(/capabilities/i);
  });

  it('rejects capabilities with unknown key', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { storage: { read: true } },
        }),
      ),
    );
    expect(err).toMatch(/unknown capabilities key/i);
  });

  it('rejects capabilities.files as null', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: null },
        }),
      ),
    );
    expect(err).toMatch(/capabilities\.files/i);
  });

  it('rejects capabilities.files as string', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: 'all' },
        }),
      ),
    );
    expect(err).toMatch(/capabilities\.files/i);
  });

  it('rejects capabilities.files with unknown key', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { write: ['/data'] } },
        }),
      ),
    );
    expect(err).toMatch(/capabilities\.files key/i);
  });

  it('rejects capabilities.files.read as null', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: null } },
        }),
      ),
    );
    expect(err).toMatch(/capabilities\.files\.read/i);
  });

  it('rejects capabilities.files.read as string', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: 'notes/doc.md' } },
        }),
      ),
    );
    expect(err).toMatch(/capabilities\.files\.read/i);
  });

  // ── Path validation ────────────────────────────────────────────

  it('accepts valid single path in files.read', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: ['notes/doc.md'] } },
        }),
      ),
    );
    expect(data.filesRead).toEqual(['notes/doc.md']);
  });

  it('accepts valid multiple paths in files.read', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: {
            files: {
              read: ['notes/doc.md', 'journal/entry.md', 'assets/logo.png'],
            },
          },
        }),
      ),
    );
    expect(data.filesRead).toEqual(['notes/doc.md', 'journal/entry.md', 'assets/logo.png']);
  });

  it('rejects empty string path in files.read', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: [''] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });

  it('rejects path exceeding 256 characters', () => {
    const longPath = 'a'.repeat(257);
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: [longPath] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });

  it('rejects path with traversal (..)', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: ['notes/../secret.md'] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });

  it('rejects path with a leading slash', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: ['/notes/doc.md'] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });

  it('rejects path with backslash', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: ['notes\\doc.md'] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });

  it('rejects path with control character', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: ['notes/doc\x00.md'] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });

  it('rejects path containing .obsidian segment', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: ['.obsidian/plugins/my-plugin/data.json'] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });


  it('rejects case-variant .obsidian path segments', () => {
    const err = assertErr(parseManifest(JSON.stringify({
      version: 1,
      entry: 'app.html',
      capabilities: { files: { read: ['Atlas Apps/.Obsidian/config.json'] } },
    })));
    expect(err).toMatch(/path at index/i);
  });

  it('rejects path with .obsidian in subdirectory', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: ['notes/.obsidian/config'] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });


  it.each(['Atlas Apps/./data.json', 'Atlas Apps//data.json', 'Atlas Apps/data.json/'])(
    'rejects non-canonical capability path %s',
    (path) => {
      const err = assertErr(parseManifest(JSON.stringify({
        version: 1,
        entry: 'app.html',
        capabilities: { files: { read: [path] } },
      })));
      expect(err).toMatch(/path at index/i);
    },
  );

  it('rejects non-string entry in files.read array (number)', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: [42] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });

  it('rejects non-string entry in files.read array (null)', () => {
    const err = assertErr(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: { files: { read: [null] } },
        }),
      ),
    );
    expect(err).toMatch(/path at index/i);
  });

  // ── Deduplication ──────────────────────────────────────────────

  it('deduplicates paths in files.read preserving first-occurrence order', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'app.html',
          capabilities: {
            files: {
              read: ['notes/doc.md', 'journal/entry.md', 'notes/doc.md', 'notes/other.md', 'journal/entry.md'],
            },
          },
        }),
      ),
    );
    expect(data.filesRead).toEqual(['notes/doc.md', 'journal/entry.md', 'notes/other.md']);
  });
});

// ── Complete valid manifests ─────────────────────────────────────────────

describe('parseManifest — valid manifests', () => {
  it('parses minimal valid manifest (version + entry only)', () => {
    const data = assertOk(parseManifest(minimalValid));
    expect(data).toEqual({
      entry: 'app.html',
      height: 640,
      connect: [],
      filesRead: [],
    });
  });

  it('parses manifest with all fields including capabilities', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({
          version: 1,
          entry: 'dashboard/index.html',
          height: 800,
          connect: ['https://api.example.com'],
          capabilities: { files: { read: ['settings.json'] } },
        }),
      ),
    );
    expect(data).toEqual({
      entry: 'dashboard/index.html',
      height: 800,
      connect: ['https://api.example.com'],
      filesRead: ['settings.json'],
    });
  });

  it('parses manifest with empty connect array', () => {
    const data = assertOk(
      parseManifest(
        JSON.stringify({ version: 1, entry: 'app.html', connect: [] }),
      ),
    );
    expect(data.connect).toEqual([]);
  });
});
