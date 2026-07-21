/**
 * Runtime script injected into sandboxed iframes.
 *
 * The child connects to the parent via a transferred MessagePort and
 * sends typed messages (ready, resize) using the agreed channel protocol.
 */

/**
 * Build the IIFE string that runs inside the sandboxed iframe.
 *
 * The script:
 * 1. Listens for the MessagePort sent by the parent via postMessage.
 * 2. Validates the channelId to prevent cross-frame spoofing.
 * 3. Sends a 'ready' message to the parent once connected.
 * 4. Monitors document body growth and sends 'resize' messages.
 * 5. Handles incoming messages from the parent — responds to 'dispose'
 *    by disconnecting the ResizeObserver, clearing timers, and closing the port.
 */
export function buildChildScript(channelId: string): string {
  // Escape for JS string literal context
  const safeId = escapeJsString(channelId);
  const channelIdSentinel = '__atlas_channel_id__';

  return `
(function() {
  var CHANNEL_ID = '${safeId}';
  var port = null;

  function handleMessage(event) {
    // We only accept the first port transfer from the parent
    if (port) return;
    if (!event.ports || event.ports.length !== 1) return;
    if (!event.data || event.data.${channelIdSentinel} !== CHANNEL_ID) return;

    port = event.ports[0];
    port.onmessage = handlePortMessage;
    port.start();

    // Signal readiness to the parent
    port.postMessage({ type: 'ready', channelId: CHANNEL_ID });

    // Stop listening for window messages once connected
    window.removeEventListener('message', handleMessage);
  }
  function handlePortMessage(event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.channelId !== CHANNEL_ID) return;
    if (data.type === 'dispose') handleDispose();
  }

  function handleDispose() {
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
