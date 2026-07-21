/**
 * Manifest parsing for Atlas App Runtime.
 *
 * Atlas-app strict JSON v1 manifests:
 * - version: exactly 1 (integer)
 * - entry: .html file path, no traversal or absolute path
 * - height: 240..4000, default 640
 * - connect: array of exact absolute http(s) origins, normalized without trailing slash
 * - capabilities: optional object with 'files.read' array of exact vault-link paths
 *
 * Unknown top-level keys and unknown capability keys are rejected.
 */

export interface AppManifest {
  entry: string;
  height: number;
  connect: string[];
  filesRead: string[];
}

export interface ManifestCapabilities {
  files?: {
    read?: string[];
  };
}

type ParseOk = { ok: true; data: AppManifest };
type ParseErr = { ok: false; error: string };
export type ParseResult = ParseOk | ParseErr;

const MIN_HEIGHT = 240;
const MAX_HEIGHT = 4000;
const DEFAULT_HEIGHT = 640;

// Manifest key allowlists
// Strict key rejection prevents hidden fields from sneaking in.
const ALLOWED_TOP_KEYS: Record<string, true> = {
  version: true, entry: true, height: true, connect: true, capabilities: true,
};
const ALLOWED_CAP_KEYS: Record<string, true> = { files: true };
const ALLOWED_FILES_KEYS: Record<string, true> = { read: true };

// Capability path validation
// Each path must be an exact vault-link: non-empty, <=256 chars,
// no path traversal (..), leading slash, no backslash, no control
// characters, and no .obsidian segment.
const MAX_PATH_LENGTH = 256;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const SEP = '/';
const OBSIDIAN_DIR = '.obsidian';

// CSP-hazardous character validation
// Raw characters that could break CSP parsing: whitespace, control
// chars, quotes, semicolon, comma, star, backslash.
// The URL parser silently strips some (tab, newline), so the raw
// input MUST be checked before URL parsing.
const CSP_HAZARD_RE = /[\x00-\x20\x7f;'"*,\\]/;
// Percent-encoded CSP-hazardous sequences: %00-%1F, %20 (space),
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

  // Unknown top-level key rejection
  for (const key of Object.keys(obj)) {
    if (!(key in ALLOWED_TOP_KEYS)) {
      return { ok: false, error: `Unknown top-level key: ${key}` };
    }
  }

  // Version
  if (    typeof obj.version !== 'number' ||    obj.version !== 1
  ) {
    return { ok: false, error: 'Invalid version: must be 1' };
  }

  // Entry
  if (!('entry' in obj) || typeof obj.entry !== 'string' || obj.entry === '') {
    return { ok: false, error: 'Invalid entry: must be a non-empty string ending with .html' };
  }

  const entry = obj.entry;

  if (!entry.endsWith('.html')) {
    return { ok: false, error: 'Invalid entry: must end with .html' };
  }

  if (entry.includes('..')) {
    return { ok: false, error: 'Invalid entry: path traversal not allowed' };
  }

  if (entry.startsWith('/')) {
    return { ok: false, error: 'Invalid entry: absolute path not allowed' };
  }

  if (entry.includes('\\')) {
    return { ok: false, error: 'Invalid entry: backslash not allowed' };
  }

  // Height
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

  // Connect origins
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

  // Capabilities
  let filesRead: string[] = [];

  if ('capabilities' in obj) {
    const caps = obj.capabilities;

    if (caps === null || typeof caps !== 'object' || Array.isArray(caps)) {
      return { ok: false, error: 'Invalid capabilities: must be an object' };
    }

    const capsObj = caps as Record<string, unknown>;

    for (const key of Object.keys(capsObj)) {
      if (!(key in ALLOWED_CAP_KEYS)) {
        return { ok: false, error: `Unknown capabilities key: ${key}` };
      }
    }

    if ('files' in capsObj) {
      const files = capsObj.files;

      if (files === null || typeof files !== 'object' || Array.isArray(files)) {
        return { ok: false, error: 'Invalid capabilities.files: must be an object' };
      }

      const filesObj = files as Record<string, unknown>;

      for (const key of Object.keys(filesObj)) {
        if (!(key in ALLOWED_FILES_KEYS)) {
          return { ok: false, error: `Invalid capabilities.files key: ${key}` };
        }
      }

      if ('read' in filesObj) {
        const read = filesObj.read;

        if (read === null || !Array.isArray(read)) {
          return { ok: false, error: 'Invalid capabilities.files.read: must be an array' };
        }

        const seen = new Set<string>();
        const paths: string[] = [];

        for (let i = 0; i < read.length; i++) {
          const p = read[i];

          if (typeof p !== 'string' || p.length === 0 || p.length > MAX_PATH_LENGTH) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          if (p.includes('..')) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          if (p.startsWith('/')) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          if (p.includes('\\')) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          if (CONTROL_CHAR_RE.test(p)) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          const segments = p.split(SEP);
          for (let j = 0; j < segments.length; j++) {
            if (segments[j] === '' || segments[j] === '.' || segments[j].toLowerCase() === OBSIDIAN_DIR) {
              return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
            }
          }

          if (!seen.has(p)) {
            seen.add(p);
            paths.push(p);
          }
        }

        filesRead = paths;
      }
    }
  }

  return {
    ok: true,
    data: { entry, height, connect, filesRead },
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
  // Pre-parse CSP-hazard and backslash checks
  if (CSP_HAZARD_RE.test(origin)) {
    return null;
  }
  if (CSP_PCT_HAZARD_RE.test(origin)) {
    return null;
  }
  if (origin.includes('\\')) {
    return null;
  }

  const cleaned = origin.endsWith('/') ? origin.slice(0, -1) : origin;

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  if (url.username !== '' || url.password !== '') {
    return null;
  }

  if (url.pathname !== '/' && url.pathname !== '') {
    return null;
  }
  if (url.search !== '') {
    return null;
  }
  if (url.hash !== '') {
    return null;
  }

  if (!origin.includes('://')) {
    return null;
  }

  if (!url.hostname) {
    return null;
  }

  const portPart = url.port ? `:${url.port}` : '';
  const normalized = `${url.protocol}//${url.hostname}${portPart}`;

  if (CSP_HAZARD_RE.test(normalized)) {
    return null;
  }

  return normalized;
}