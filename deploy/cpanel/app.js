/**
 * cPanel "Setup Node.js App" startup file (Phusion Passenger).
 *
 * Passenger loads this file with require() and hands the HTTP server the socket it listens on, whatever port the app
 * asks for, so OpenWA's own `app.listen(PORT)` works unchanged. OpenWA resolves `.env`, `data/` and the dashboard
 * against the working directory, so it is pinned to the application root first.
 */
process.chdir(__dirname);

// CloudLinux's "Run NPM Install" installs into ~/nodevenv/<app>/<version>/lib and runs install scripts there, where
// scripts/ does not exist, so the install-time patch step cannot reach the packages. Apply OpenWA's dependency patches
// here instead, from the application root, where node_modules resolves (cPanel links it into that environment). The
// patchers recognise an already-patched package and leave it alone, so this costs little after the first start.
try {
  const { run } = require('./scripts/postinstall.js');
  if (run() !== 0) console.error('[openwa] Applying the dependency patches failed; see the lines above.');
} catch (error) {
  console.error(`[openwa] Could not apply the dependency patches: ${error.message}`);
}

require('./dist/main');
