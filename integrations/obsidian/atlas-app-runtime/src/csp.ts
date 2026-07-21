/**
 * Content-Security-Policy builder for Atlas App Runtime sandboxed iframes.
 *
 * Produces a strict CSP that allows only:
 * - Inline scripts and styles (needed for srcdoc-based apps)
 * - data: and blob: for images and media
 * - data: for fonts
 * - Explicitly listed connect-src origins
 * Everything else remains explicitly denied.
 */

/** Input shape accepted by buildCsp. */
export interface CspInput {
  connect: string[];
}

/**
 * Build a Content-Security-Policy header string from a manifest connect list.
 *
 * Every directive is explicitly set — no browser defaults leak through.
 * Deterministic: same input always produces the same output.
 *
 * connect-src is the only directive influenced by the manifest. Every other
 * restricted capability stays denied even when network access is granted.
 */
export function buildCsp(manifest: CspInput): string {
  const { connect } = manifest;

  // ── Independent safety validation ────────────────────────────
  // Defense-in-depth: validate every connect source for CSP-
  // hazardous characters even though the manifest parser also
  // validates. This catches callers that construct CspInput
  // directly without going through parseManifest.
  const CSP_HAZARD_RE = /[\x00-\x20\x7f;'"*,\\]/;
  const CSP_PCT_HAZARD_RE = /%(?:0[0-9a-fA-F]|1[0-9a-fA-F]|20|22|27|2[aA]|2[cC]|3[bB]|5[cC])/;
  for (const src of connect) {
    if (typeof src !== 'string') {
      throw new Error(`Invalid connect source: must be a string`);
    }
    if (CSP_HAZARD_RE.test(src)) {
      throw new Error(`Invalid connect source: contains CSP-hazardous characters`);
    }
    if (CSP_PCT_HAZARD_RE.test(src)) {
      throw new Error(`Invalid connect source: contains percent-encoded CSP-hazardous characters`);
    }
    if (src.includes('\\')) {
      throw new Error(`Invalid connect source: contains backslash`);
    }
  }

  const connectSrc = connect.length > 0 ? connect.join(' ') : "'none'";

  const directives = [
    `default-src 'none'`,
    `script-src 'unsafe-inline'`,
    `style-src 'unsafe-inline'`,
    `img-src data: blob:`,
    `font-src data:`,
    `media-src data: blob:`,
    `connect-src ${connectSrc}`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'none'`,
    `worker-src 'none'`,
  ];

  return directives.join('; ');
}
