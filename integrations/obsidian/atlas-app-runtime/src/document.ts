/**
 * Sandbox document builder for Atlas App Runtime.
 *
 * Produces a complete HTML document suitable for use as an iframe srcdoc.
 * The document includes:
 * - Strict CSP via meta tag (from buildCsp)
 * - Embedded channel ID for secure port transfer
 * - The runtime child script (from runtime-child.ts)
 * - The app's HTML content
 *
 * CSP and channel data are escaped so hostile values cannot break
 * the head or script context.
 */

import { buildChildScript } from './runtime-child';

/**
 * Build a complete srcdoc-ready HTML document.
 *
 * @param html - The app's HTML content (from vault)
 * @param csp - The Content-Security-Policy string (from buildCsp)
 * @param channelId - Unique channel identifier for this render
 * @returns Complete HTML document string for iframe srcdoc
 */
export function buildSandboxDocument(
  html: string,
  csp: string,
  channelId: string,
): string {
  const escapedCsp = escapeAttr(csp);
  const escapedChannelId = escapeAttr(channelId);
  const childScript = buildChildScript(channelId);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapedCsp}">
<meta name="channel-id" content="${escapedChannelId}">
<meta name="referrer" content="no-referrer">
<!-- sandbox: allow-scripts only -->
</head>
<body>
<script>${childScript}</script>
${html}
</body>
</html>`;
}

/**
 * Escape a value for safe embedding in an HTML attribute (double-quoted context).
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
