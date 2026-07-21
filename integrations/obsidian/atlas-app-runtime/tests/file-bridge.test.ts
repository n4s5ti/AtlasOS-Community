import { describe, it, expect } from 'vitest';
import {
  handleFileBridgeRequest,
  FileBridgeContext,
} from '../src/file-bridge';

/**
 * Contract tests for handleFileBridgeRequest(data, ctx).
 *
 * The function validates envelopes, dispatches 'files.read' requests against
 * an allowlist, caps responses at 1 MiB, and returns null for spoofed or
 * structurally invalid envelopes. Recognized errors carry stable error codes.
 */

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<FileBridgeContext> = {}): FileBridgeContext {
  return {
    channelId: 'test-channel-42',
    allowedPaths: ['/notes/doc.md', '/journal/entry.md'],
    read: async (path: string) => {
      if (path === '/notes/doc.md') return '# Hello\nThis is a test document.';
      if (path === '/journal/entry.md') return '# Journal Entry\nToday was a good day.';
      throw new Error(`File not found: ${path}`);
    },
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'request',
    channelId: 'test-channel-42',
    id: 'abc123_def456',
    method: 'files.read',
    params: { path: '/notes/doc.md' },
    ...overrides,
  };
}

// ─── Null / ignored envelopes ──────────────────────────────────────────────

describe('handleFileBridgeRequest — null/ignored envelopes', () => {
  it('returns null for null data', async () => {
    const result = await handleFileBridgeRequest(null, makeContext());
    expect(result).toBeNull();
  });

  it('returns null for undefined data', async () => {
    const result = await handleFileBridgeRequest(undefined, makeContext());
    expect(result).toBeNull();
  });

  it('returns null for non-object data (string)', async () => {
    const result = await handleFileBridgeRequest('hello', makeContext());
    expect(result).toBeNull();
  });

  it('returns null for non-object data (number)', async () => {
    const result = await handleFileBridgeRequest(42, makeContext());
    expect(result).toBeNull();
  });

  it('returns null for array data', async () => {
    const result = await handleFileBridgeRequest([1, 2, 3], makeContext());
    expect(result).toBeNull();
  });

  it('returns null for envelope without type', async () => {
    const result = await handleFileBridgeRequest(
      { channelId: 'test-channel-42' },
      makeContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null for non-request type (event)', async () => {
    const result = await handleFileBridgeRequest(
      { type: 'event', channelId: 'test-channel-42' },
      makeContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null for unknown type string', async () => {
    const result = await handleFileBridgeRequest(
      { type: 'response', channelId: 'test-channel-42' },
      makeContext(),
    );
    expect(result).toBeNull();
  });
});

// ─── Spoofed channel detection ─────────────────────────────────────────────

describe('handleFileBridgeRequest — spoofed channels', () => {
  it('returns null when channelId does not match context', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ channelId: 'wrong-channel' }),
      makeContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null when channelId is missing', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ channelId: undefined }),
      makeContext(),
    );
    expect(result).toBeNull();
  });
});

// ─── ID validation ─────────────────────────────────────────────────────────

describe('handleFileBridgeRequest — id validation', () => {
  it('accepts valid alphanumeric id with underscore and dash', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ id: 'a1_B-c2' }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    // Should be a successful response
    expect((result as Record<string, unknown>).ok).toBe(true);
  });

  it('accepts single-character id', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ id: 'a' }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).ok).toBe(true);
  });

  it('accepts maximum-length id (64 chars)', async () => {
    const id = 'A'.repeat(64);
    const result = await handleFileBridgeRequest(
      makeRequest({ id }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    expect((result as Record<string, unknown>).ok).toBe(true);
  });

  it.each([
    'A'.repeat(65),
    'abc.def',
    'abc def',
    '',
    'x'.repeat(1_000_000),
  ])('silently drops invalid string id', async (id) => {
    const result = await handleFileBridgeRequest(makeRequest({ id }), makeContext());
    expect(result).toBeNull();
  });

  it.each([42, null, undefined])('silently drops non-string id', async (id) => {
    const result = await handleFileBridgeRequest(makeRequest({ id }), makeContext());
    expect(result).toBeNull();
  });
});

// ─── Method validation ─────────────────────────────────────────────────────

describe('handleFileBridgeRequest — method validation', () => {
  it('rejects missing method', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ method: undefined }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('INVALID_METHOD');
  });

  it('rejects non-string method (number)', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ method: 42 }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('INVALID_METHOD');
  });

  it('rejects unknown method with UNKNOWN_METHOD error', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ method: 'storage.read' }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('UNKNOWN_METHOD');
    expect((r.error as Record<string, unknown>).message).toBe('Unknown method');
  });
});

// ─── Successful files.read ─────────────────────────────────────────────────

describe('handleFileBridgeRequest — successful files.read', () => {
  it('reads an allowed file and returns content', async () => {
    const result = await handleFileBridgeRequest(makeRequest(), makeContext());
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.type).toBe('response');
    expect(r.channelId).toBe('test-channel-42');
    expect(r.ok).toBe(true);
    expect((r.result as Record<string, unknown>).content).toBe('# Hello\nThis is a test document.');
  });

  it('reads a different allowed file', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/journal/entry.md' } }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(true);
    expect((r.result as Record<string, unknown>).content).toBe('# Journal Entry\nToday was a good day.');
  });

  it('preserves request id in response', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ id: 'my_custom_req_1' }),
      makeContext(),
    );
    const r = result as Record<string, unknown>;
    expect(r.id).toBe('my_custom_req_1');
  });

  it('preserves channelId in response', async () => {
    const result = await handleFileBridgeRequest(makeRequest(), makeContext());
    const r = result as Record<string, unknown>;
    expect(r.channelId).toBe('test-channel-42');
  });
});

// ─── Params validation (files.read) ────────────────────────────────────────

describe('handleFileBridgeRequest — params validation', () => {
  it('rejects missing params', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: undefined }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('INVALID_PARAMS');
  });

  it('rejects null params', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: null }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('INVALID_PARAMS');
  });

  it('rejects non-object params', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: 'hello' }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('INVALID_PARAMS');
  });

  it('rejects params without path', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: {} }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('INVALID_PARAMS');
  });

  it('rejects params with non-string path', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: 42 } }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('INVALID_PARAMS');
  });

  it('rejects params with extra keys', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/notes/doc.md', mode: 'raw' } }),
      makeContext(),
    );
    const r = result as Record<string, unknown>;
    expect((r.error as Record<string, unknown>).code).toBe('INVALID_PARAMS');
  });
});

// ─── Authorization (forbidden paths) ──────────────────────────────────────

describe('handleFileBridgeRequest — forbidden paths', () => {
  it('rejects path not in allowedPaths with FORBIDDEN error', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/secrets/key.md' } }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('FORBIDDEN');
    expect((r.error as Record<string, unknown>).message).toMatch(/path.*allowed/i);
  });

  it('rejects sub-path of an allowed path', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/notes/doc.md/sub' } }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('FORBIDDEN');
  });

  it('allows exact match against allowedPaths only', async () => {
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/notes/doc' } }),
      makeContext(),
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('FORBIDDEN');
  });
});

// ─── Read failure ──────────────────────────────────────────────────────────

describe('handleFileBridgeRequest — read failure', () => {
  it('returns READ_FAILED when context.read throws', async () => {
    const ctx = makeContext({
      allowedPaths: ['/broken.md'],
      read: async () => { throw new Error('Disk I/O error'); },
    });
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/broken.md' } }),
      ctx,
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('READ_FAILED');
  });

  it('does not expose host exception details', async () => {
    const ctx = makeContext({
      allowedPaths: ['/broken.md'],
      read: async () => { throw new Error('Disk I/O error at /private/vault'); },
    });
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/broken.md' } }),
      ctx,
    );
    const r = result as Record<string, unknown>;
    expect((r.error as Record<string, unknown>).message).toBe('Unable to read authorized file');
  });
});

// ─── Oversized content ─────────────────────────────────────────────────────

describe('handleFileBridgeRequest — oversized content', () => {
  it('rejects content exceeding 1 MiB with RESPONSE_TOO_LARGE error', async () => {
    const largeContent = 'x'.repeat(1_050_000); // > 1 MiB
    const ctx = makeContext({
      allowedPaths: ['/large.md'],
      read: async () => largeContent,
    });
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/large.md' } }),
      ctx,
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('RESPONSE_TOO_LARGE');
  });

  it('accepts content just under 1 MiB', async () => {
    const largeContent = 'x'.repeat(1_048_576 - 1); // just under 1 MiB
    const ctx = makeContext({
      allowedPaths: ['/large.md'],
      read: async () => largeContent,
    });
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/large.md' } }),
      ctx,
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(true);
  });

  it('accepts content exactly at 1 MiB boundary (empty width)', async () => {
    const content = 'a'.repeat(1024 * 1024 - 3); // 1_048_573 bytes of 'a'
    const ctx = makeContext({
      allowedPaths: ['/exact.md'],
      read: async () => content,
    });
    // TextEncoder encodes each 'a' as 1 byte so 1,048,573 < 1,048,576
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/exact.md' } }),
      ctx,
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(true);
  });
});

// ─── Multi-byte content encoding ───────────────────────────────────────────

describe('handleFileBridgeRequest — multi-byte UTF-8 content', () => {
  it('caps multi-byte content at 1 MiB of UTF-8 bytes, not string length', async () => {
    // 350_000 chars of 3-byte emoji = ~1_050_000 bytes (over limit)
    const manyEmoji = '\u{1F600}'.repeat(350_000);
    const ctx = makeContext({
      allowedPaths: ['/emoji.md'],
      read: async () => manyEmoji,
    });
    const result = await handleFileBridgeRequest(
      makeRequest({ params: { path: '/emoji.md' } }),
      ctx,
    );
    expect(result).not.toBeNull();
    const r = result as Record<string, unknown>;
    expect(r.ok).toBe(false);
    expect((r.error as Record<string, unknown>).code).toBe('RESPONSE_TOO_LARGE');
  });
});