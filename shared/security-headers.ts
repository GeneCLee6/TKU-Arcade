// The security headers (e12-t13, docs/SECURITY.md): on every page and file through `_headers`
// (written by the build, vite.config.ts, with the hash of index.html's one inline script), and on
// the Worker's own answers (worker/security.ts). Plain strings, so that the build can import them.

/** Headers for everything, the Worker's JSON included */
export const BASE_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Nothing here uses these; the kart's gamepad, fullscreen and the clipboard keep the default (self)
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
}

/**
 * The page's Content-Security-Policy. `scriptHashes`: 'sha256-…' of each inline script (only the
 * language preload in index.html). Styles stay 'unsafe-inline': styled-components writes <style>
 * tags at run time and React writes style attributes, neither of which can carry a hash. Fonts
 * from Google Fonts (src/styles/webFonts.ts, the promotion board's). WebSockets and fetches only to
 * this site ('self' covers ws: and wss: on the same host). three.js needs nothing more: WebGL is
 * not governed by CSP, and its shaders are not script
 */
export function contentSecurityPolicy(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((hash) => `'${hash}'`).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** The `_headers` file for the static assets: every path gets the page's headers */
export function headersFile(scriptHashes: readonly string[]): string {
  const lines = Object.entries({
    ...BASE_HEADERS,
    'Content-Security-Policy': contentSecurityPolicy(scriptHashes),
  }).map(([name, value]) => `  ${name}: ${value}`)
  return `/*\n${lines.join('\n')}\n`
}
