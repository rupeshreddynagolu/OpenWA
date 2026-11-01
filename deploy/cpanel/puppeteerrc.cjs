/**
 * Shipped as `.puppeteerrc.cjs` in the cPanel bundle root. Shared hosting cannot run headless Chromium, so the
 * deployment uses the Baileys engine and npm install must not download a ~150 MB browser it would never start.
 */
module.exports = { skipDownload: true };
