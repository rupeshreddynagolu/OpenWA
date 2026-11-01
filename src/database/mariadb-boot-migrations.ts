import { DataSource, DataSourceOptions } from 'typeorm';
import { createLogger } from '../common/services/logger.service';
import { useVarcharUuids } from './mariadb-connection';

const logger = createLogger('MariadbBootMigrations');

/** Server-wide named lock the boot migration chain runs under (GET_LOCK names are global to the server). */
export const MARIADB_BOOT_MIGRATION_LOCK = 'openwa_boot_migrations';
/** How long a start waits for another start's migrations before giving up, in seconds. */
export const MARIADB_BOOT_MIGRATION_LOCK_TIMEOUT_S = 300;

/**
 * Build the MariaDB data connection and apply its migrations under a named lock (fork addition).
 *
 * The MariaDB counterpart of the Postgres advisory-lock flow in pg-boot-migrations.ts: TypeORM's own
 * migrationsRun is unsynchronized, so two processes starting together could both find a migration pending and
 * both apply it. The lock is held on one dedicated connection while the chain runs on the pool; a second start
 * waits, then finds the ledger filled and applies nothing.
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
    const [row] = (await lock.query('SELECT GET_LOCK(?, ?) AS acquired', [
      MARIADB_BOOT_MIGRATION_LOCK,
      MARIADB_BOOT_MIGRATION_LOCK_TIMEOUT_S,
    ])) as Array<{ acquired: number | string | null }>;
    if (Number(row?.acquired) !== 1) {
      throw new Error(
        `Timed out after ${MARIADB_BOOT_MIGRATION_LOCK_TIMEOUT_S}s waiting for the MariaDB boot migration lock ` +
          `(${MARIADB_BOOT_MIGRATION_LOCK}); another OpenWA start is still applying migrations.`,
      );
    }
    try {
      const applied = await dataSource.runMigrations();
      if (applied.length > 0) {
        logger.log(`Applied ${applied.length} MariaDB migration(s): ${applied.map(m => m.name).join(', ')}`);
      }
    } finally {
      await lock.query('SELECT RELEASE_LOCK(?)', [MARIADB_BOOT_MIGRATION_LOCK]).catch(() => undefined);
    }
    return dataSource;
  } catch (error) {
    await dataSource.destroy().catch(() => undefined);
    throw error;
  } finally {
    if (!lock.isReleased) await lock.release().catch(() => undefined);
  }
}
