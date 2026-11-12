#!/usr/bin/env node
/**
 * Print the bundle's runtime-only package.json: the repo's dependencies and overrides, no dev toolchain, a start
 * script, and a postinstall that tolerates CloudLinux.
 *
 *   node deploy/cpanel/make-package-json.cjs <repo package.json>  >  <bundle>/package.json
 *
 * CloudLinux's "Run NPM Install" runs install scripts in ~/nodevenv/<app>/<version>/lib, where the bundle's scripts/
 * folder does not exist. There the postinstall only says so and succeeds; app.js applies the dependency patches when
 * the app starts. Run from the application root (npm install over SSH), it applies them at install time as usual.
 */
const path = require('path');

const POSTINSTALL =
  'node -e "const fs=require(\\"fs\\"),f=\\"scripts/postinstall.js\\";' +
  'if(fs.existsSync(f)){process.exitCode=require(\\"child_process\\").spawnSync(process.execPath,[f],{stdio:\\"inherit\\"}).status??1}' +
  'else{console.log(\\"openwa: no scripts/ folder here (CloudLinux installs in its own folder); app.js applies the dependency patches when the app starts\\")}"';

const pkg = require(path.resolve(process.argv[2] || 'package.json'));
const out = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  license: pkg.license,
  private: true,
  engines: pkg.engines,
  main: 'app.js',
  scripts: { start: 'node app.js', postinstall: POSTINSTALL },
  dependencies: pkg.dependencies,
  overrides: pkg.overrides,
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
