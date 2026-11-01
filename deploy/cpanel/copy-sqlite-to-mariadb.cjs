#!/usr/bin/env node
/**
 * Copy OpenWA's data tables from a SQLite data file (data/openwa.sqlite) into a migrated MariaDB database.
 *
 *   MARIADB_HOST=localhost MARIADB_PORT=3306 MARIADB_USER=… MARIADB_PASSWORD=… MARIADB_DATABASE=… \
 *     node tools/copy-sqlite-to-mariadb.cjs <app-root> <sqlite-file>
 *
 * Start OpenWA once against the MariaDB database first, so its migrations have created the schema, and stop it
 * before copying. The SQLite file is opened read-only. Tables that already hold rows in MariaDB are refused, so the
 * copy cannot run twice into the same database. Exits non-zero unless every table's row count matches.
 */
const path = require('path');
const { createRequire } = require('module');

const [appRoot = '.', sqliteFile = 'data/openwa.sqlite'] = process.argv.slice(2);
const req = createRequire(path.join(path.resolve(appRoot), 'package.json'));
const Database = req('better-sqlite3');
const mysql = req('mysql2/promise');

const TABLES = [
  'sessions',
  'webhooks',
  'templates',
  'automation_rules',
  'messages',
  'message_batches',
  'lid_mappings',
  'chat_states',
  'baileys_stored_messages',
  'status_updates',
  'send_idempotency_keys',
  'webhook_outbox_events',
  'webhook_delivery_failures',
  'plugin_instances',
  'conversation_mappings',
  'ingress_events',
  'integration_delivery_failures',
];
/** Rows per INSERT are bounded by size, well under MariaDB's default 16 MiB max_allowed_packet. */
const MAX_BATCH_BYTES = 4 * 1024 * 1024;

/** SQLite keeps some timestamps ISO-style; MariaDB DATETIME takes 'YYYY-MM-DD HH:MM:SS.ffffff'. */
const toDatetime = value =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? value
        .replace('T', ' ')
        .replace(/Z$/, '')
        .replace(/\+00:00$/, '')
    : value;

async function main() {
  for (const key of ['MARIADB_USER', 'MARIADB_PASSWORD', 'MARIADB_DATABASE']) {
    if (!process.env[key]) throw new Error(`${key} is required`);
  }
  const sqlite = new Database(path.resolve(sqliteFile), { readonly: true, fileMustExist: true });
  const maria = await mysql.createConnection({
    host: process.env.MARIADB_HOST || 'localhost',
    port: Number(process.env.MARIADB_PORT || 3306),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
  await maria.query('SET FOREIGN_KEY_CHECKS = 0');
  const report = [];
  try {
    for (const table of TABLES) {
      const sourceExists = sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table);
      if (!sourceExists) {
        report.push({ table, sqlite: 0, mariadb: 0, note: 'absent in SQLite' });
        continue;
      }
      const sourceColumns = sqlite
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map(c => c.name);
      const [targetRows] = await maria.query(
        'SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [table],
      );
      if (targetRows.length === 0) throw new Error(`${table} does not exist in MariaDB: start OpenWA once first`);
      const targetTypes = new Map(targetRows.map(r => [r.COLUMN_NAME, r.DATA_TYPE]));
      const columns = sourceColumns.filter(c => targetTypes.has(c));
      const skipped = sourceColumns.filter(c => !targetTypes.has(c));
      const [[{ existing }]] = await maria.query(`SELECT COUNT(*) AS existing FROM \`${table}\``);
      if (Number(existing) > 0)
        throw new Error(`${table} already holds ${existing} rows in MariaDB; refusing to copy twice`);

      const rows = sqlite.prepare(`SELECT ${columns.map(c => `"${c}"`).join(', ')} FROM "${table}"`).all();
      let batch = [];
      let bytes = 0;
      const flush = async () => {
        if (batch.length === 0) return;
        const placeholders = batch.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
        await maria.query(
          `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES ${placeholders}`,
          batch.flat(),
        );
        batch = [];
        bytes = 0;
      };
      for (const row of rows) {
        const values = columns.map(c => (targetTypes.get(c) === 'datetime' ? toDatetime(row[c]) : row[c]));
        const size = values.reduce((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : 16), 0);
        if (bytes + size > MAX_BATCH_BYTES) await flush();
        batch.push(values);
        bytes += size;
      }
      await flush();
      const [[{ copied }]] = await maria.query(`SELECT COUNT(*) AS copied FROM \`${table}\``);
      report.push({
        table,
        sqlite: rows.length,
        mariadb: Number(copied),
        note: skipped.length ? `skipped columns: ${skipped.join(', ')}` : '',
      });
    }
  } finally {
    await maria.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => undefined);
    await maria.end();
    sqlite.close();
  }
  console.table(report);
  const mismatched = report.filter(r => r.sqlite !== r.mariadb);
  if (mismatched.length > 0) {
    console.error(`Row count mismatch: ${mismatched.map(r => r.table).join(', ')}`);
    process.exit(2);
  }
  console.log('All row counts match.');
}

main().catch(error => {
  console.error(`Copy failed: ${error.message}`);
  process.exit(1);
});
