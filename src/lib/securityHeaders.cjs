/* CJS copy for metro.config.js. Keep in lockstep with securityHeaders.js. */

const SUPABASE = "https://sjnrdkkfijlkkuslnwxy.supabase.co";
const SUPABASE_WS = "wss://sjnrdkkfijlkkuslnwxy.supabase.co";
const TURNSTILE = "https://challenges.cloudflare.com";

function securityHeaders({ dev = false } = {}) {
  const script = ["'self'", "'unsafe-inline'", TURNSTILE];
  if (dev) script.push("'unsafe-eval'");

  const connect = ["'self'", SUPABASE, SUPABASE_WS, TURNSTILE];
  if (dev) connect.push("ws:", "wss:", "http:", "https:");

  const csp = [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    `frame-src ${TURNSTILE}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!dev) csp.push("upgrade-insecure-requests");

  return {
    "Content-Security-Policy": csp.join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), display-capture=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

function applySecurityHeaders(res, opts) {
  const headers = securityHeaders(opts);
  for (const key of Object.keys(headers)) res.setHeader(key, headers[key]);
}

module.exports = { securityHeaders, applySecurityHeaders };
