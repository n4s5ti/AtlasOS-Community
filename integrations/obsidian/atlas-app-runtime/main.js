"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  AtlasAppChild: () => AtlasAppChild,
  default: () => AtlasAppRuntimePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/manifest.ts
var MIN_HEIGHT = 240;
var MAX_HEIGHT = 4e3;
var DEFAULT_HEIGHT = 640;
var ALLOWED_TOP_KEYS = {
  version: true,
  entry: true,
  height: true,
  connect: true,
  capabilities: true
};
var ALLOWED_CAP_KEYS = { files: true };
var ALLOWED_FILES_KEYS = { read: true };
var MAX_PATH_LENGTH = 256;
var CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
var SEP = "/";
var OBSIDIAN_DIR = ".obsidian";
var CSP_HAZARD_RE = /[\x00-\x20\x7f;'"*,\\]/;
var CSP_PCT_HAZARD_RE = /%(?:0[0-9a-fA-F]|1[0-9a-fA-F]|20|22|27|2[aA]|2[cC]|3[bB]|5[cC])/;
function parseManifest(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Manifest must be a JSON object" };
  }
  const obj = parsed;
  for (const key of Object.keys(obj)) {
    if (!(key in ALLOWED_TOP_KEYS)) {
      return { ok: false, error: `Unknown top-level key: ${key}` };
    }
  }
  if (typeof obj.version !== "number" || obj.version !== 1) {
    return { ok: false, error: "Invalid version: must be 1" };
  }
  if (!("entry" in obj) || typeof obj.entry !== "string" || obj.entry === "") {
    return { ok: false, error: "Invalid entry: must be a non-empty string ending with .html" };
  }
  const entry = obj.entry;
  if (!entry.endsWith(".html")) {
    return { ok: false, error: "Invalid entry: must end with .html" };
  }
  if (entry.includes("..")) {
    return { ok: false, error: "Invalid entry: path traversal not allowed" };
  }
  if (entry.startsWith("/")) {
    return { ok: false, error: "Invalid entry: absolute path not allowed" };
  }
  if (entry.includes("\\")) {
    return { ok: false, error: "Invalid entry: backslash not allowed" };
  }
  let height = DEFAULT_HEIGHT;
  if ("height" in obj) {
    const h = obj.height;
    if (h === void 0) {
    } else if (h === null || typeof h !== "number" || !Number.isInteger(h) || h < MIN_HEIGHT || h > MAX_HEIGHT) {
      return { ok: false, error: `Invalid height: must be an integer between ${MIN_HEIGHT} and ${MAX_HEIGHT}` };
    } else {
      height = h;
    }
  }
  let connect = [];
  if ("connect" in obj) {
    const c = obj.connect;
    if (c === void 0) {
    } else if (c === null) {
      return { ok: false, error: "Invalid connect: must be an array of origin strings" };
    } else if (!Array.isArray(c)) {
      return { ok: false, error: "Invalid connect: must be an array of origin strings" };
    } else {
      const seen = /* @__PURE__ */ new Set();
      const origins = [];
      for (const item of c) {
        if (typeof item !== "string") {
          return { ok: false, error: "Invalid connect: each entry must be a string" };
        }
        const validated = validateOrigin(item);
        if (validated === null) {
          return { ok: false, error: "Invalid connect: invalid origin" };
        }
        if (!seen.has(validated)) {
          seen.add(validated);
          origins.push(validated);
        }
      }
      connect = origins;
    }
  }
  let filesRead = [];
  if ("capabilities" in obj) {
    const caps = obj.capabilities;
    if (caps === null || typeof caps !== "object" || Array.isArray(caps)) {
      return { ok: false, error: "Invalid capabilities: must be an object" };
    }
    const capsObj = caps;
    for (const key of Object.keys(capsObj)) {
      if (!(key in ALLOWED_CAP_KEYS)) {
        return { ok: false, error: `Unknown capabilities key: ${key}` };
      }
    }
    if ("files" in capsObj) {
      const files = capsObj.files;
      if (files === null || typeof files !== "object" || Array.isArray(files)) {
        return { ok: false, error: "Invalid capabilities.files: must be an object" };
      }
      const filesObj = files;
      for (const key of Object.keys(filesObj)) {
        if (!(key in ALLOWED_FILES_KEYS)) {
          return { ok: false, error: `Invalid capabilities.files key: ${key}` };
        }
      }
      if ("read" in filesObj) {
        const read = filesObj.read;
        if (read === null || !Array.isArray(read)) {
          return { ok: false, error: "Invalid capabilities.files.read: must be an array" };
        }
        const seen = /* @__PURE__ */ new Set();
        const paths = [];
        for (let i = 0; i < read.length; i++) {
          const p = read[i];
          if (typeof p !== "string" || p.length === 0 || p.length > MAX_PATH_LENGTH) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          if (p.includes("..")) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          if (p.startsWith("/")) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          if (p.includes("\\")) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          if (CONTROL_CHAR_RE.test(p)) {
            return { ok: false, error: `Invalid capabilities.files.read path at index ${i}` };
          }
          const segments = p.split(SEP);
          for (let j = 0; j < segments.length; j++) {
            if (segments[j] === "" || segments[j] === "." || segments[j].toLowerCase() === OBSIDIAN_DIR) {
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
    data: { entry, height, connect, filesRead }
  };
}
function validateOrigin(origin) {
  if (CSP_HAZARD_RE.test(origin)) {
    return null;
  }
  if (CSP_PCT_HAZARD_RE.test(origin)) {
    return null;
  }
  if (origin.includes("\\")) {
    return null;
  }
  const cleaned = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  let url;
  try {
    url = new URL(cleaned);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.username !== "" || url.password !== "") {
    return null;
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return null;
  }
  if (url.search !== "") {
    return null;
  }
  if (url.hash !== "") {
    return null;
  }
  if (!origin.includes("://")) {
    return null;
  }
  if (!url.hostname) {
    return null;
  }
  const portPart = url.port ? `:${url.port}` : "";
  const normalized = `${url.protocol}//${url.hostname}${portPart}`;
  if (CSP_HAZARD_RE.test(normalized)) {
    return null;
  }
  return normalized;
}

// src/csp.ts
function buildCsp(manifest) {
  const { connect } = manifest;
  const CSP_HAZARD_RE2 = /[\x00-\x20\x7f;'"*,\\]/;
  const CSP_PCT_HAZARD_RE2 = /%(?:0[0-9a-fA-F]|1[0-9a-fA-F]|20|22|27|2[aA]|2[cC]|3[bB]|5[cC])/;
  for (const src of connect) {
    if (typeof src !== "string") {
      throw new Error(`Invalid connect source: must be a string`);
    }
    if (CSP_HAZARD_RE2.test(src)) {
      throw new Error(`Invalid connect source: contains CSP-hazardous characters`);
    }
    if (CSP_PCT_HAZARD_RE2.test(src)) {
      throw new Error(`Invalid connect source: contains percent-encoded CSP-hazardous characters`);
    }
    if (src.includes("\\")) {
      throw new Error(`Invalid connect source: contains backslash`);
    }
  }
  const connectSrc = connect.length > 0 ? connect.join(" ") : "'none'";
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
    `worker-src 'none'`
  ];
  return directives.join("; ");
}

// src/runtime-child.ts
function buildChildScript(channelId) {
  const safeId = escapeJsString(channelId);
  const channelIdSentinel = "__atlas_channel_id__";
  const REQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const REQ_ID_LEN = 16;
  const REQ_TIMEOUT_MS = 1e4;
  return `
(function() {
  var CHANNEL_ID = '${safeId}';
  var port = null;
  var pendingRequests = Object.create(null);
  var REQ_CHARS = '${REQ_CHARS}';
  var REQ_ID_LEN = ${REQ_ID_LEN};
  var REQ_TIMEOUT_MS = ${REQ_TIMEOUT_MS};

  function generateRequestId() {
    var id = '';
    var array = new Uint8Array(REQ_ID_LEN);
    crypto.getRandomValues(array);
    for (var i = 0; i < REQ_ID_LEN; i++) {
      id += REQ_CHARS[array[i] % 64];
    }
    return id;
  }

  function handleMessage(event) {
    // We only accept the first port transfer from the parent
    if (port) return;
    if (!event.ports || event.ports.length !== 1) return;
    if (!event.data || event.data.${channelIdSentinel} !== CHANNEL_ID) return;

    port = event.ports[0];
    port.onmessage = handlePortMessage;
    port.start();

    // Expose frozen request API once port is connected
    window.atlasHost = Object.freeze({
      request: function(method, params) {
        return new Promise(function(resolve, reject) {
          var id;
          do { id = generateRequestId(); } while (pendingRequests[id]);
          var timer = setTimeout(function() {
            delete pendingRequests[id];
            reject(new Error('Request timed out'));
          }, REQ_TIMEOUT_MS);
          pendingRequests[id] = { resolve: resolve, reject: reject, timer: timer };
          try {
            port.postMessage({ type: 'request', channelId: CHANNEL_ID, id: id, method: method, params: params });
          } catch (e) {
            clearTimeout(timer);
            delete pendingRequests[id];
            reject(new Error('Failed to send request'));
          }
        });
      }
    });
    window.dispatchEvent(new CustomEvent('atlas-host-ready'));

    // Signal readiness to the parent
    port.postMessage({ type: 'ready', channelId: CHANNEL_ID });

    // Stop listening for window messages once connected
    window.removeEventListener('message', handleMessage);
  }

  function handlePortMessage(event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.channelId !== CHANNEL_ID) return;

    if (data.type === 'dispose') {
      handleDispose();
      return;
    }

    if (data.type === 'response') {
      var pending = pendingRequests[data.id];
      if (pending) {
        clearTimeout(pending.timer);
        delete pendingRequests[data.id];
        if (data.ok) {
          pending.resolve(data.result);
        } else {
          pending.reject(new Error(data.error ? data.error.message : 'Request failed'));
        }
      }
      return;
    }
  }

  function handleDispose() {
    // Reject all pending requests before cleanup
    for (var id in pendingRequests) {
      if (Object.prototype.hasOwnProperty.call(pendingRequests, id)) {
        clearTimeout(pendingRequests[id].timer);
        pendingRequests[id].reject(new Error('Disposed'));
      }
    }
    pendingRequests = Object.create(null);
    try { delete window.atlasHost; } catch(e) { window.atlasHost = undefined; }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
    if (initialResizeTimer) {
      clearTimeout(initialResizeTimer);
      initialResizeTimer = null;
    }
    if (loadListener) {
      window.removeEventListener('load', loadListener);
      loadListener = null;
    }
    window.removeEventListener('message', handleMessage);
    window.removeEventListener('pagehide', handlePageHide);
    if (port) {
      port.onmessage = null;
      try { port.close(); } catch(e) {}
      port = null;
    }
  }

  function sendResize() {
    if (!port) return;
    var height = document.documentElement.scrollHeight;
    port.postMessage({ type: 'resize', height: height, channelId: CHANNEL_ID });
  }

  function handlePageHide() {
    handleDispose();
  }

  window.addEventListener('message', handleMessage);

  var resizeTimer = null;
  var initialResizeTimer = null;
  var loadListener = null;
  var resizeObserver = new ResizeObserver(function() {
    if (resizeTimer) return;
    resizeTimer = setTimeout(function() {
      resizeTimer = null;
      sendResize();
    }, 100);
  });
  resizeObserver.observe(document.documentElement);

  if (document.readyState === 'complete') {
    initialResizeTimer = setTimeout(sendResize, 200);
  } else {
    loadListener = function() {
      window.removeEventListener('load', loadListener);
      loadListener = null;
      initialResizeTimer = setTimeout(sendResize, 200);
    };
    window.addEventListener('load', loadListener);
  }

  window.addEventListener('pagehide', handlePageHide);
})();
`.trim();
}
function escapeJsString(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029").replace(/<\/script>/gi, "<\\/script>");
}

// src/document.ts
function buildSandboxDocument(html, csp, channelId) {
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
<script>${childScript}<\/script>
${html}
</body>
</html>`;
}
function escapeAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// src/file-bridge.ts
var MAX_RESPONSE_BYTES = 1048576;
var TEXT_ENCODER = new TextEncoder();
var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function makeResponse(channelId, id, result) {
  return { type: "response", channelId, id, ok: true, result };
}
function makeError(channelId, id, error) {
  return { type: "response", channelId, id, ok: false, error };
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isValidId(value) {
  return typeof value === "string" && ID_RE.test(value);
}
async function handleFileBridgeRequest(data, ctx) {
  if (!isObject(data)) return null;
  if (data.type !== "request") return null;
  const env = data;
  if (env.channelId !== ctx.channelId) return null;
  if (!isValidId(env.id)) return null;
  const id = env.id;
  if (typeof env.method !== "string") {
    return makeError(ctx.channelId, id, {
      code: "INVALID_METHOD",
      message: "Method must be a string"
    });
  }
  const method = env.method;
  switch (method) {
    case "files.read": {
      if (!isObject(env.params) || Object.keys(env.params).length !== 1 || typeof env.params.path !== "string") {
        return makeError(ctx.channelId, id, {
          code: "INVALID_PARAMS",
          message: "files.read requires params with a string path"
        });
      }
      const path = env.params.path;
      if (!ctx.allowedPaths.includes(path)) {
        return makeError(ctx.channelId, id, {
          code: "FORBIDDEN",
          message: "Path not in allowed paths"
        });
      }
      let content;
      try {
        content = await ctx.read(path);
      } catch {
        return makeError(ctx.channelId, id, {
          code: "READ_FAILED",
          message: "Unable to read authorized file"
        });
      }
      const byteLength = TEXT_ENCODER.encode(content).length;
      if (byteLength > MAX_RESPONSE_BYTES) {
        return makeError(ctx.channelId, id, {
          code: "RESPONSE_TOO_LARGE",
          message: "File content exceeds 1 MiB limit"
        });
      }
      return makeResponse(ctx.channelId, id, { content });
    }
    default: {
      return makeError(ctx.channelId, id, {
        code: "UNKNOWN_METHOD",
        message: "Unknown method"
      });
    }
  }
}

// src/app-note-activation.ts
var import_obsidian = require("obsidian");
var ATLAS_MARKER_KEY = "app-runtime";
var ATLAS_MARKER_VALUE = "atlas-app-runtime";
var ACTIVATION_ATTEMPTS = 20;
var ACTIVATION_DELAY_MS = 50;
var defaultWait = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
function isAtlasAppNote(cache) {
  return cache?.frontmatter?.[ATLAS_MARKER_KEY] === ATLAS_MARKER_VALUE;
}
async function activateAtlasAppNote(app, file, wait = defaultWait) {
  for (let attempt = 0; attempt < ACTIVATION_ATTEMPTS; attempt += 1) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache && !isAtlasAppNote(cache)) return;
    const activeView = app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (cache && activeView?.file === file) {
      if (activeView.getMode() !== "source") return;
      await wait(0);
      const currentView = app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (currentView !== activeView || currentView.file !== file) return;
      if (currentView.getMode() !== "source") return;
      if (!isAtlasAppNote(app.metadataCache.getFileCache(file))) return;
      const leaf = currentView.leaf;
      const viewState = leaf.getViewState();
      await leaf.setViewState({
        ...viewState,
        state: {
          ...viewState.state,
          mode: "preview"
        }
      });
      return;
    }
    await wait(ACTIVATION_DELAY_MS);
  }
}

// src/exact-file-reader.ts
async function readExactFile(path, adapter) {
  const normalized = adapter.normalize(path);
  if (normalized !== path || normalized.toLowerCase().split("/").includes(".obsidian")) {
    throw new Error("Authorized file not found");
  }
  const file = adapter.get(normalized);
  if (!file) throw new Error("Authorized file not found");
  return adapter.read(file);
}

// src/main.ts
var CHANNEL_ID_SENTINEL = "__atlas_channel_id__";
var AtlasAppRuntimePlugin = class extends import_obsidian2.Plugin {
  onload() {
    this.registerMarkdownCodeBlockProcessor(
      "atlas-app",
      (source, el, ctx) => {
        const result = parseManifest(source);
        if (!result.ok) {
          el.createEl("pre", { text: `Atlas App error: ${result.error}` });
          return;
        }
        const manifest = result.data;
        const file = this.app.metadataCache.getFirstLinkpathDest(
          manifest.entry,
          ctx.sourcePath
        );
        if (!file || !(file instanceof import_obsidian2.TFile) || file.extension.toLowerCase() !== "html") {
          el.createEl("pre", {
            text: `Atlas App error: entry "${manifest.entry}" not found`
          });
          return;
        }
        const child = new AtlasAppChild(
          el,
          manifest,
          file,
          (f) => this.app.vault.cachedRead(f),
          (path) => readExactFile(path, {
            normalize: import_obsidian2.normalizePath,
            get: (exactPath) => {
              const target = this.app.vault.getAbstractFileByPath(exactPath);
              return target instanceof import_obsidian2.TFile ? target : null;
            },
            read: (target) => this.app.vault.cachedRead(target)
          })
        );
        ctx.addChild(child);
      }
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) void activateAtlasAppNote(this.app, file);
      })
    );
  }
};
function generateUUID() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  let uuid = "";
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) uuid += "-";
    uuid += bytes[i].toString(16).padStart(2, "0");
  }
  return uuid;
}
var MIN_HEIGHT2 = 240;
var MAX_HEIGHT2 = 4e3;
var AtlasAppChild = class extends import_obsidian2.MarkdownRenderChild {
  constructor(containerEl, manifest, entryFile, readFile, readAuthorizedFile = async () => {
    throw new Error("File capability unavailable");
  }) {
    super(containerEl);
    this.channel = null;
    this.iframe = null;
    this.channelId = null;
    this.loadHandler = null;
    this.intersectionObserver = null;
    this.mountGeneration = 0;
    this.mounting = false;
    this.disposed = false;
    this.manifest = manifest;
    this.entryFile = entryFile;
    this.readFile = readFile;
    this.readAuthorizedFile = readAuthorizedFile;
  }
  async onload() {
    if (this.disposed) return;
    const sync = () => {
      void this.syncVisibility();
    };
    this.intersectionObserver = new IntersectionObserver(sync);
    this.intersectionObserver.observe(this.containerEl);
    this.register(() => this.cleanup());
    await this.syncVisibility();
  }
  onunload() {
    this.cleanup();
  }
  isMountable() {
    return this.containerEl.isConnected && this.containerEl.getClientRects().length > 0;
  }
  async syncVisibility() {
    if (this.disposed) return;
    if (!this.isMountable()) {
      this.unmountFrame();
      return;
    }
    if (this.iframe || this.mounting) return;
    const generation = ++this.mountGeneration;
    this.mounting = true;
    try {
      const html = await this.readFile(this.entryFile);
      if (this.disposed || generation !== this.mountGeneration || !this.isMountable()) {
        return;
      }
      this.mountFrame(html);
    } catch {
      if (!this.disposed && generation === this.mountGeneration && this.isMountable()) {
        this.containerEl.createEl("pre", {
          text: `Atlas App error: failed to read "${this.manifest.entry}"`
        });
      }
    } finally {
      if (generation === this.mountGeneration) this.mounting = false;
    }
  }
  mountFrame(html) {
    const channelId = generateUUID();
    const csp = buildCsp({ connect: this.manifest.connect });
    const doc = buildSandboxDocument(html, csp, channelId);
    const iframe = this.containerEl.createEl("iframe");
    this.channelId = channelId;
    this.iframe = iframe;
    iframe.className = "atlas-app-iframe";
    iframe.setAttr("sandbox", "allow-scripts");
    iframe.setAttr("referrerpolicy", "no-referrer");
    iframe.style.height = `${this.manifest.height}px`;
    const channel = new MessageChannel();
    this.channel = channel;
    channel.port1.onmessage = (event) => {
      void this.handlePortMessage(event);
    };
    channel.port1.start();
    this.loadHandler = () => {
      if (!this.channel || this.disposed || !this.loadHandler) return;
      iframe.removeEventListener("load", this.loadHandler);
      this.loadHandler = null;
      iframe.contentWindow?.postMessage(
        { [CHANNEL_ID_SENTINEL]: channelId },
        // srcdoc has an opaque origin; capability security is the transferred port.
        "*",
        [channel.port2]
      );
    };
    iframe.addEventListener("load", this.loadHandler);
    iframe.srcdoc = doc;
  }
  unmountFrame() {
    ++this.mountGeneration;
    this.sendDispose();
    this.channel?.port1.close();
    this.channel = null;
    if (this.iframe && this.loadHandler) {
      this.iframe.removeEventListener("load", this.loadHandler);
    }
    this.loadHandler = null;
    this.iframe?.remove();
    this.iframe = null;
    this.channelId = null;
    this.mounting = false;
  }
  cleanup() {
    if (this.disposed) return;
    this.disposed = true;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.unmountFrame();
  }
  sendDispose() {
    if (!this.channel || !this.channelId) return;
    try {
      this.channel.port1.postMessage({
        type: "dispose",
        channelId: this.channelId
      });
    } catch {
    }
  }
  async handlePortMessage(event) {
    const data = event.data;
    if (!data || typeof data !== "object" || data.channelId !== this.channelId) return;
    if (data.type === "resize") {
      const height = data.height;
      if (typeof height !== "number" || !Number.isInteger(height)) return;
      const clamped = Math.max(MIN_HEIGHT2, Math.min(MAX_HEIGHT2, height));
      if (this.iframe) this.iframe.style.height = `${clamped}px`;
      return;
    }
    const channel = this.channel;
    const channelId = this.channelId;
    if (!channel || !channelId) return;
    const response = await handleFileBridgeRequest(data, {
      channelId,
      allowedPaths: this.manifest.filesRead,
      read: this.readAuthorizedFile
    });
    if (response && !this.disposed && channel === this.channel && channelId === this.channelId) {
      try {
        channel.port1.postMessage(response);
      } catch {
      }
    }
  }
};
