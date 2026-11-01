import * as mysql2 from 'mysql2';
import type { MysqlDataSourceOptions } from 'typeorm/driver/mysql/MysqlDataSourceOptions';

/**
 * MariaDB data connection (fork addition).
 *
 * The rest of the codebase writes raw SQL the way PostgreSQL and SQLite read it: identifiers in double
 * quotes ("mediaPath") and `||` for concatenation. MariaDB reads both only with ANSI_QUOTES and
 * PIPES_AS_CONCAT in the session sql_mode, so every pooled connection gets them before its first query.
 * The modes are appended to the server's own, so its strictness settings stay as configured.
 */
export const MARIADB_SESSION_SQL_MODE_STATEMENT =
  "SET SESSION sql_mode = TRIM(BOTH ',' FROM CONCAT(@@SESSION.sql_mode, ',ANSI_QUOTES,PIPES_AS_CONCAT'))";

interface PoolLike {
  on(event: 'connection', listener: (connection: { query(sql: string): unknown }) => void): unknown;
}

interface Mysql2Like {
  createPool(options: unknown): PoolLike;
}

/**
 * mysql2, with every pool it creates setting the session sql_mode on each new connection.
 *
 * TypeORM loads its driver from the `driver` option when given one (MysqlDriver.loadDependencies), and opens a
 * first connection inside createPool to check the credentials, so the listener is attached before that
 * connection exists. mysql2 runs a connection's commands in order, so the SET always precedes the first query.
 */
export function mariadbDriver<T extends Mysql2Like>(base: T = mysql2 as unknown as T): T {
  return {
    ...base,
    createPool(options: unknown): PoolLike {
      const pool = base.createPool(options);
      pool.on('connection', connection => {
        connection.query(MARIADB_SESSION_SQL_MODE_STATEMENT);
      });
      return pool;
    },
  };
}

/**
 * Keep uuid-generated ids as varchar(36) on MariaDB, as they are varchar on PostgreSQL and text on SQLite.
 *
 * TypeORM switches to MariaDB's native UUID type when it detects 10.7 or later (MysqlDriver.afterConnect). That type
 * refuses any value that is not a UUID, while OpenWA compares ids against arbitrary strings (a session name, an
 * imported key). Call once the DataSource is initialized and before migrations or schema diffs run; the migration
 * CLI and the boot factory both do.
 */
export function useVarcharUuids(dataSource: { driver: unknown }): void {
  (dataSource.driver as { uuidColumnTypeSuported?: boolean }).uuidColumnTypeSuported = false;
}

export interface MariadbConnectionSettings {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  poolSize?: number;
  logging?: boolean;
  connectTimeoutMs?: number;
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
}

/** Connection options shared by the runtime data connection (app.module.ts) and the migration CLI (data-source.ts). */
export function mariadbConnectionOptions(
  settings: MariadbConnectionSettings,
): MysqlDataSourceOptions & { type: 'mariadb' } {
  return {
    type: 'mariadb',
    driver: mariadbDriver(),
    host: settings.host || 'localhost',
    port: settings.port || 3306,
    username: settings.username,
    password: settings.password,
    database: settings.database || 'openwa',
    // utf8mb4 so a message with emoji is stored as sent, not rejected or mangled.
    charset: 'utf8mb4_unicode_ci',
    // Dates are written and read as UTC, matching the UTC pin on the Postgres connection.
    timezone: 'Z',
    // bigint columns come back as numbers when they fit, as on the other drivers.
    supportBigNumbers: true,
    bigNumberStrings: false,
    poolSize: settings.poolSize || 10,
    connectTimeout: settings.connectTimeoutMs || 10000,
    logging: settings.logging ?? false,
    ssl: settings.ssl ? { rejectUnauthorized: settings.sslRejectUnauthorized !== false } : undefined,
    synchronize: false,
  };
}
