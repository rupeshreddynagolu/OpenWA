/**
 * cPanel "Setup Node.js App" startup file (Phusion Passenger).
 *
 * Passenger loads this file with require() and hands the HTTP server the socket it listens on, whatever port the app
 * asks for, so OpenWA's own `app.listen(PORT)` works unchanged. OpenWA resolves `.env`, `data/` and the dashboard
 * against the working directory, so it is pinned to the application root first.
 */
process.chdir(__dirname);
require('./dist/main');
