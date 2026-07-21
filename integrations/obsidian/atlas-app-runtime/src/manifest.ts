/**
 * Manifest parsing for Atlas App Runtime.
 *
 * Atlas-app strict JSON v1 manifests:
 * - version: exactly 1 (integer)
 * - entry: .html file path, no traversal or absolute path
 * - height: 240..4000, default 640
 * - connect: array of exact absolute http(s) origins, normalized without trailing slash
 */

export interface AppManifest {
  entry: string;
  height: number;
  connect: string[];
}

type ParseOk = { ok: true; data: AppManifest };
type ParseErr = { ok: false; error: string };
export type ParseResult = ParseOk | ParseErr;

const MIN_HEIGHT = 240;
const MAX_HEIGHT = 4000;
const DEFAULT_HEIGHT = 640;

// ── CSP-hazardous character validation ──────────────────────────
// Raw characters that could break CSP parsing: whitespace, control
// chars, quotes, semicolon, comma, star, backslash.
// The URL parser silently strips some (tab, newline), so the raw
// input MUST be checked before URL parsing.
const CSP_HAZARD_RE = /[\x00-\x20\x7f;'"*,\\]/;
// Percent-encoded CSP-hazardous sequences:  %00-%1F,  %20 (space),
// %22 ("), %27 ('), %2A (*), %2C (,), %3B (;), %5C (\)
const CSP_PCT_HAZARD_RE = /%(?:0[0-9a-fA-F]|1[0-9a-fA-F]|20|22|27|2[aA]|2[cC]|3[bB]|5[cC])/;

/**
 * Parse and validate an atlas-app manifest from raw JSON source.
 */
export function parseManifest(source: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Manifest must be a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;

  // ── Version ───────────────────────────────────────────────────────────
  if (
    !('version' in obj) ||
    typeof obj.version !== 'number' ||
    !Number.isInteger(obj.version) ||
    obj.version !== 1
  ) {
    return { ok: false, error: 'Invalid version: must be 1' };
  }

  // ── Entry ─────────────────────────────────────────────────────────────
  if (!('entry' in obj) || typeof obj.entry !== 'string' || obj.entry === '') {
    return { ok: false, error: 'Invalid entry: must be a non-empty string ending with .html' };
  }

  const entry = obj.entry;

  if (!entry.endsWith('.html')) {
    return { ok: false, error: 'Invalid entry: must end with .html' };
  }

  // Reject path traversal
  if (entry.includes('..')) {
    return { ok: false, error: 'Invalid entry: path traversal not allowed' };
  }

  // Reject absolute paths (starting with /)
  if (entry.startsWith('/')) {
    return { ok: false, error: 'Invalid entry: absolute path not allowed' };
  }
  // Reject backslashes in entry paths
  if (entry.includes('\\')) {
    return { ok: false, error: 'Invalid entry: backslash not allowed' };
  }
   // ── Height ────────────────────────────────────────────────────────────
  let height = DEFAULT_HEIGHT;

  if ('height' in obj) {
    const h = obj.height;
    if (h === undefined) {
      // omitted — use default
    } else if (
      h === null ||
      typeof h !== 'number' ||
      !Number.isInteger(h) ||
      h < MIN_HEIGHT ||
      h > MAX_HEIGHT
    ) {
      return { ok: false, error: `Invalid height: must be an integer between ${MIN_HEIGHT} and ${MAX_HEIGHT}` };
    } else {
      height = h as number;
    }
  }

  // ── Connect origins ───────────────────────────────────────────────────
  let connect: string[] = [];

  if ('connect' in obj) {
    const c = obj.connect;
    if (c === undefined) {
      // omitted — use default (empty array)
    } else if (c === null) {
      return { ok: false, error: 'Invalid connect: must be an array of origin strings' };
    } else if (!Array.isArray(c)) {
      return { ok: false, error: 'Invalid connect: must be an array of origin strings' };
    } else {
      const seen = new Set<string>();
      const origins: string[] = [];
      for (const item of c) {
        if (typeof item !== 'string') {
          return { ok: false, error: 'Invalid connect: each entry must be a string' };
        }
        const validated = validateOrigin(item);
        if (validated === null) {
          return { ok: false, error: 'Invalid connect: invalid origin' };
        }
        if (!seen.has(validated)) {
          seen.add(validated);
          origins.push(validated);
        }
      }
      connect = origins;
    }
  }

  return {
    ok: true,
    data: { entry, height, connect },
  };
}

/**
 * Validate and normalize an origin string.
 *
 * Accepts only http:// and https:// origins without path, query, fragment,
 * or userinfo. Returns the normalized origin (trailing slash stripped).
 * Returns null on any validation failure.
 */
function validateOrigin(origin: string): string | null {
  // ── Pre-parse CSP-hazard and backslash checks ─────────────────
  // Check raw input BEFORE URL parsing — the URL constructor
  // silently strips some characters (tab, newline, etc.), so
  // they would otherwise pass through undetected.
  if (CSP_HAZARD_RE.test(origin)) {
    return null;
  }
  if (CSP_PCT_HAZARD_RE.test(origin)) {
    return null;
  }
  if (origin.includes('\\')) {
    return null;
  }

  // Strip trailing slash for explicit normalization; the pathname
  // check below can then use the strict `/` or `''` comparison.
  const cleaned = origin.endsWith('/') ? origin.slice(0, -1) : origin;

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }

  // Only http and https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  // Reject userinfo
  if (url.username !== '' || url.password !== '') {
    return null;
  }

  // Reject path, query, fragment
  // (pathname is always '/' or '' for bare origins after
  // trailing-slash stripping)
  if (url.pathname !== '/' && url.pathname !== '') {
    return null;
  }
  if (url.search !== '') {
    return null;
  }
  if (url.hash !== '') {
    return null;
  }

  // Reject protocol-relative
  if (!origin.includes('://')) {
    return null;
  }

  // Reject empty hostname
  if (!url.hostname) {
    return null;
  }

  // Normalize: reconstruct without trailing slash
  const portPart = url.port ? `:${url.port}` : '';
  const normalized = `${url.protocol}//${url.hostname}${portPart}`;

  // Post-parse safety net: verify normalized origin is CSP-safe
  // (catches any chars the URL parser decoded or passed through)
  if (CSP_HAZARD_RE.test(normalized)) {
    return null;
  }

  return normalized;
}
