/**
 * File bridge for Atlas App Runtime.
 *
 * Handles inbound RPC requests from sandboxed app frames for the 'files.read'
 * method. Each request is validated against the manifest-declared allowlist,
 * and responses are capped at 1 MiB of UTF-8 text content.
 *
 * Protocol envelopes follow the parent-child channel protocol used by
 * buildChildScript: every message carries channelId for origin scoping,
 * an id for correlation, and a method + params payload.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * Raw envelope received from the child frame's MessagePort.
 */
export interface FileBridgeEnvelope {
  type?: unknown;
  channelId?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

/**
 * A validated and typed request that the bridge can act on.
 */
export interface FileBridgeRequest {
  channelId: string;
  id: string;
  method: 'files.read';
  params: { path: string };
}

/**
 * Context supplied by the host for each request invocation.
 */
export interface FileBridgeContext {
  /** Expected channel ID — mismatches are silently ignored (spoofed). */
  channelId: string;
  /** Exact vault-link paths this app is allowed to read. */
  allowedPaths: string[];
  /** Async function that reads a vault file by absolute path. */
  read: (path: string) => Promise<string>;
}

/**
 * Structured error sent as the response payload.
 */
export interface FileBridgeError {
  code: string;
  message: string;
}

/**
 * Successful response payload.
 */
export interface FileBridgeSuccess {
  content: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_RESPONSE_BYTES = 1_048_576; // 1 MiB
const TEXT_ENCODER = new TextEncoder();
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ─── Response builders ─────────────────────────────────────────────────────

function makeResponse(
  channelId: string,
  id: string,
  result: unknown,
): unknown {
  return { type: 'response', channelId, id, ok: true, result };
}

function makeError(
  channelId: string,
  id: string,
  error: FileBridgeError,
): unknown {
  return { type: 'response', channelId, id, ok: false, error };
}

// ─── Validation helpers ─────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

// ─── Handler ────────────────────────────────────────────────────────────────

/**
 * Handle one inbound FileBridge request.
 *
 * Validates the outer envelope, method, params, and authorization.
 * Returns:
 *  - null — if the envelope is spoofed (channelId mismatch) or malformed
 *           (missing type, non-object). Host should silently drop these.
 *  - A response object (with ok:true or ok:false) for recognized requests.
 *  - An error response for denied requests (forbidden path, unknown method,
 *    oversized result, read failure).
 *
 * @param data - Raw data received from the MessagePort
 * @param ctx  - Bridge context with channelId, allowedPaths, and read function
 * @returns A response object, or null if the envelope should be ignored
 */
export async function handleFileBridgeRequest(
  data: unknown,
  ctx: FileBridgeContext,
): Promise<unknown | null> {
  // ── Validate outer envelope ────────────────────────────────────
  // Non-object, missing type, or non-request — silently ignore.
  if (!isObject(data)) return null;
  if (data.type !== 'request') return null;

  const env = data as FileBridgeEnvelope;

  // channelId mismatch — spoofed message from another frame
  if (env.channelId !== ctx.channelId) return null;

  // Invalid IDs are dropped instead of reflecting attacker-controlled data.
  if (!isValidId(env.id)) return null;
  const id = env.id;

  // method must be a string
  if (typeof env.method !== 'string') {
    return makeError(ctx.channelId, id, {
      code: 'INVALID_METHOD',
      message: 'Method must be a string',
    });
  }

  const method = env.method;

  // ── Method dispatch ────────────────────────────────────────────
  switch (method) {
    case 'files.read': {
      // params must be an object with a string path
      if (
        !isObject(env.params) ||
        Object.keys(env.params).length !== 1 ||
        typeof env.params.path !== 'string'
      ) {
        return makeError(ctx.channelId, id, {
          code: 'INVALID_PARAMS',
          message: 'files.read requires params with a string path',
        });
      }

      const path: string = (env.params as Record<string, unknown>).path as string;

      // Authorization: path must be in the manifest allowlist
      if (!ctx.allowedPaths.includes(path)) {
        return makeError(ctx.channelId, id, {
          code: 'FORBIDDEN',
          message: 'Path not in allowed paths',
        });
      }

      // Execute the read
      let content: string;
      try {
        content = await ctx.read(path);
      } catch {
        return makeError(ctx.channelId, id, {
          code: 'READ_FAILED',
          message: 'Unable to read authorized file',
        });
      }

      // Cap response at 1 MiB of UTF-8 content
      const byteLength = TEXT_ENCODER.encode(content).length;
      if (byteLength > MAX_RESPONSE_BYTES) {
        return makeError(ctx.channelId, id, {
          code: 'RESPONSE_TOO_LARGE',
          message: 'File content exceeds 1 MiB limit',
        });
      }

      return makeResponse(ctx.channelId, id, { content });
    }

    default: {
      return makeError(ctx.channelId, id, {
        code: 'UNKNOWN_METHOD',
        message: 'Unknown method',
      });
    }
  }
}
