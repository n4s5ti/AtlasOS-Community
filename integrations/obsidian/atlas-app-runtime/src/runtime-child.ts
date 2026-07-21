/**
 * Runtime script injected into sandboxed iframes.
 *
 * The child connects to the parent via a transferred MessagePort and
 * sends typed messages (ready, resize) using the agreed channel protocol.
 * After the port is established, exposes window.atlasHost.request for
 * capability-scoped RPC calls (e.g. files.read).
 */

/**
 * Build the IIFE string that runs inside the sandboxed iframe.
 *
 * The script:
 * 1. Listens for the MessagePort sent by the parent via postMessage.
 * 2. Validates the channelId to prevent cross-frame spoofing.
 * 3. Sends a 'ready' message to the parent once connected.
 * 4. Exposes a frozen window.atlasHost.request(method, params) that
 *    returns a Promise and times out after 10 seconds.
 * 5. Monitors document body growth and sends 'resize' messages.
 * 6. Handles incoming messages from the parent — responds to 'dispose'
 *    by rejecting pending requests, disconnecting the ResizeObserver,
 *    clearing timers, and closing the port.
 */
export function buildChildScript(channelId: string): string {
  const safeId = escapeJsString(channelId);
  const channelIdSentinel = '__atlas_channel_id__';

  const REQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const REQ_ID_LEN = 16;
  const REQ_TIMEOUT_MS = 10000;

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

/**
 * Escape a string for safe embedding in a single-quoted JS string literal.
 */
function escapeJsString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\/script>/gi, '<\\/script>');
}
