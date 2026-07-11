import http from 'node:http';
import https from 'node:https';

const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes in ms

export function startKeepAlive() {
  const backendUrl = process.env.BACKEND_URL;
  const frontendUrl = process.env.FRONTEND_URL;

  if (!backendUrl && !frontendUrl) {
    console.log('[KEEP-ALIVE] No BACKEND_URL or FRONTEND_URL environment variables set. Self-ping disabled.');
    return;
  }

  const ping = (urlStr, name) => {
    if (!urlStr) return;
    try {
      const url = new URL("/health", urlStr).href;
      const client = url.startsWith("https:") ? https : http;
      console.log(`[KEEP-ALIVE] Sending ping to ${name} at ${url}...`);
      
      client
        .get(url, (res) => {
          console.log(`[KEEP-ALIVE] ${name} ping response: ${res.statusCode}`);
        })
        .on("error", (e) => {
          console.error(`[KEEP-ALIVE] ${name} ping failed:`, e.message);
        });
    } catch (err) {
      console.error(`[KEEP-ALIVE] Invalid URL for ${name}:`, urlStr);
    }
  };

  // Run ping immediately on startup
  ping(backendUrl, "Backend");
  ping(frontendUrl, "Frontend");

  // Schedule to run every 14 minutes
  const intervalId = setInterval(() => {
    ping(backendUrl, "Backend");
    ping(frontendUrl, "Frontend");
  }, PING_INTERVAL);

  // Unref the interval so it doesn't prevent Node process from exiting
  if (typeof intervalId.unref === 'function') {
    intervalId.unref();
  }

  console.log(`[KEEP-ALIVE] Keep-alive scheduled to run every 14 minutes.`);
}
