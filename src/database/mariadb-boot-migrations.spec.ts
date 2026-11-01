import type { DataSource, DataSourceOptions } from 'typeorm';
import { createMariadbBootDataSource, MARIADB_BOOT_LOCK_TABLE } from './mariadb-boot-migrations';

describe('createMariadbBootDataSource', () => {
  const options = { type: 'mariadb', migrationsRun: true } as DataSourceOptions;

  const fake = (lockError?: Error) => {
    const calls: string[] = [];
    const lock = {
      isReleased: false,
      connect: jest.fn(() => Promise.resolve()),
      startTransaction: jest.fn(() => {
        calls.push('BEGIN');
        return Promise.resolve();
      }),
      rollbackTransaction: jest.fn(() => {
        calls.push('ROLLBACK');
        return Promise.resolve();
      }),
      query: jest.fn((sql: string) => {
        calls.push(sql);
        if (lockError && sql.includes('FOR UPDATE')) return Promise.reject(lockError);
        return Promise.resolve([]);
      }),
      release: jest.fn(function (this: { isReleased: boolean }) {
        this.isReleased = true;
        return Promise.resolve();
      }),
    };
    const dataSource = {
      driver: { uuidColumnTypeSuported: true },
      initialize: jest.fn(() => Promise.resolve()),
      createQueryRunner: jest.fn(() => lock),
      runMigrations: jest.fn(() => {
        calls.push('runMigrations');
        return Promise.resolve([]);
      }),
      destroy: jest.fn(() => Promise.resolve()),
    };
    const created: DataSourceOptions[] = [];
    const create = (opts: DataSourceOptions) => {
      created.push(opts);
      return dataSource as unknown as DataSource;
    };
    return { dataSource, lock, calls, created, create };
  };

  it('runs the migrations while holding the lock row, and never lets TypeORM run them unlocked', async () => {
    const f = fake();
    const result = await createMariadbBootDataSource(options, f.create);

    expect(result).toBe(f.dataSource);
    expect(f.created[0].migrationsRun).toBe(false);
    const begin = f.calls.indexOf('BEGIN');
    const forUpdate = f.calls.findIndex(c => c.includes('FOR UPDATE'));
    const migrate = f.calls.indexOf('runMigrations');
    const rollback = f.calls.indexOf('ROLLBACK');
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(forUpdate);
    expect(forUpdate).toBeLessThan(migrate);
    expect(migrate).toBeLessThan(rollback);
    expect(f.lock.release).toHaveBeenCalled();
  });

  it('locks a row of a table in its own database, not a server-wide GET_LOCK name', async () => {
    const f = fake();
    await createMariadbBootDataSource(options, f.create);
    expect(f.calls.some(c => c.includes(`CREATE TABLE IF NOT EXISTS \`${MARIADB_BOOT_LOCK_TABLE}\``))).toBe(true);
    expect(f.calls.some(c => c.includes(`FROM \`${MARIADB_BOOT_LOCK_TABLE}\``) && c.includes('FOR UPDATE'))).toBe(true);
    expect(f.calls.some(c => /GET_LOCK/i.test(c))).toBe(false);
  });

  it('keeps uuid ids varchar before any migration runs', async () => {
    const f = fake();
    f.dataSource.runMigrations.mockImplementation(() => {
      expect(f.dataSource.driver.uuidColumnTypeSuported).toBe(false);
      return Promise.resolve([]);
    });
    await createMariadbBootDataSource(options, f.create);
    expect(f.dataSource.driver.uuidColumnTypeSuported).toBe(false);
  });

  it('fails the boot with a clear message, destroying the connection, when the lock wait times out', async () => {
    const f = fake(Object.assign(new Error('Lock wait timeout exceeded'), { code: 'ER_LOCK_WAIT_TIMEOUT' }));
    await expect(createMariadbBootDataSource(options, f.create)).rejects.toThrow(/boot migration lock/);
    expect(f.dataSource.runMigrations).not.toHaveBeenCalled();
    expect(f.calls).toContain('ROLLBACK');
    expect(f.dataSource.destroy).toHaveBeenCalled();
  });

  it('releases the lock row even when a migration fails', async () => {
    const f = fake();
    f.dataSource.runMigrations.mockRejectedValue(new Error('bad migration'));
    await expect(createMariadbBootDataSource(options, f.create)).rejects.toThrow('bad migration');
    expect(f.calls).toContain('ROLLBACK');
    expect(f.dataSource.destroy).toHaveBeenCalled();
  });

  it('skips the lock and the chain when migrationsRun is false', async () => {
    const f = fake();
    await createMariadbBootDataSource({ ...options, migrationsRun: false }, f.create);
    expect(f.dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(f.dataSource.runMigrations).not.toHaveBeenCalled();
  });
});
