import { DataSource, DataSourceOptions } from 'typeorm';
import { createLogger } from '../common/services/logger.service';
import { useVarcharUuids } from './mariadb-connection';

const logger = createLogger('MariadbBootMigrations');

/**
 * One-row table in OpenWA's own database whose row the boot migration chain locks.
 *
 * A row lock rather than GET_LOCK: GET_LOCK names are global to the MariaDB server, so on shared hosting another
 * account's database user could hold the same name and stall every OpenWA start. Only users with rights on this
 * database can touch this table.
 */
export const MARIADB_BOOT_LOCK_TABLE = 'openwa_boot_lock';
/** How long a start waits for another start's migrations before giving up, in seconds. */
export const MARIADB_BOOT_MIGRATION_LOCK_TIMEOUT_S = 300;

const isLockWaitTimeout = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { code?: string }).code === 'ER_LOCK_WAIT_TIMEOUT' || (error as { errno?: number }).errno === 1205);

/**
 * Build the MariaDB data connection and apply its migrations under a lock (fork addition).
 *
 * The MariaDB counterpart of the Postgres advisory-lock flow in pg-boot-migrations.ts: TypeORM's own
 * migrationsRun is unsynchronized, so two processes starting together could both find a migration pending and
 * both apply it. The lock row is held in a transaction on one dedicated connection while the chain runs on the pool
 * (DDL on other tables does not wait for it); a second start waits, then finds the ledger filled and applies nothing.
 */
export async function createMariadbBootDataSource(
  options: DataSourceOptions,
  createDataSource: (options: DataSourceOptions) => DataSource = opts => new DataSource(opts),
): Promise<DataSource> {
  const runMigrations = options.migrationsRun !== false;
  const dataSource = createDataSource({ ...options, migrationsRun: false });
  await dataSource.initialize();
  useVarcharUuids(dataSource);
  if (!runMigrations) return dataSource;

  const lock = dataSource.createQueryRunner();
  try {
    await lock.connect();
    await lock.query(
      `CREATE TABLE IF NOT EXISTS \`${MARIADB_BOOT_LOCK_TABLE}\` (\`id\` tinyint NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await lock.query(`INSERT IGNORE INTO \`${MARIADB_BOOT_LOCK_TABLE}\` (\`id\`) VALUES (1)`);
    await lock.query('SET SESSION innodb_lock_wait_timeout = ?', [MARIADB_BOOT_MIGRATION_LOCK_TIMEOUT_S]);
    await lock.startTransaction();
    try {
      try {
        await lock.query(`SELECT \`id\` FROM \`${MARIADB_BOOT_LOCK_TABLE}\` WHERE \`id\` = 1 FOR UPDATE`);
      } catch (error) {
        if (!isLockWaitTimeout(error)) throw error;
        throw new Error(
          `Timed out after ${MARIADB_BOOT_MIGRATION_LOCK_TIMEOUT_S}s waiting for the MariaDB boot migration lock ` +
            `(${MARIADB_BOOT_LOCK_TABLE}); another OpenWA start is still applying migrations.`,
          { cause: error },
        );
      }
      const applied = await dataSource.runMigrations();
      if (applied.length > 0) {
        logger.log(`Applied ${applied.length} MariaDB migration(s): ${applied.map(m => m.name).join(', ')}`);
      }
    } finally {
      // Ending the transaction releases the row; nothing was written in it.
      await lock.rollbackTransaction().catch(() => undefined);
    }
    return dataSource;
  } catch (error) {
    await dataSource.destroy().catch(() => undefined);
    throw error;
  } finally {
    if (!lock.isReleased) await lock.release().catch(() => undefined);
  }
}
