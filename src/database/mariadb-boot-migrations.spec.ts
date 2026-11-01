import type { DataSource, DataSourceOptions } from 'typeorm';
import { createMariadbBootDataSource, MARIADB_BOOT_MIGRATION_LOCK } from './mariadb-boot-migrations';

describe('createMariadbBootDataSource', () => {
  const options = { type: 'mariadb', migrationsRun: true } as DataSourceOptions;

  const fake = (acquired: number | null) => {
    const calls: string[] = [];
    const lock = {
      isReleased: false,
      connect: jest.fn(() => Promise.resolve()),
      query: jest.fn((sql: string) => {
        calls.push(sql);
        return Promise.resolve(sql.startsWith('SELECT GET_LOCK') ? [{ acquired }] : [{}]);
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

  it('runs the migrations inside the named lock, and never lets TypeORM run them unlocked', async () => {
    const f = fake(1);
    const result = await createMariadbBootDataSource(options, f.create);

    expect(result).toBe(f.dataSource);
    expect(f.created[0].migrationsRun).toBe(false);
    expect(f.calls).toEqual(['SELECT GET_LOCK(?, ?) AS acquired', 'runMigrations', 'SELECT RELEASE_LOCK(?)']);
    expect(f.lock.query).toHaveBeenCalledWith('SELECT GET_LOCK(?, ?) AS acquired', [
      MARIADB_BOOT_MIGRATION_LOCK,
      expect.any(Number),
    ]);
    expect(f.lock.release).toHaveBeenCalled();
  });

  it('keeps uuid ids varchar before any migration runs', async () => {
    const f = fake(1);
    f.dataSource.runMigrations.mockImplementation(() => {
      expect(f.dataSource.driver.uuidColumnTypeSuported).toBe(false);
      return Promise.resolve([]);
    });
    await createMariadbBootDataSource(options, f.create);
    expect(f.dataSource.driver.uuidColumnTypeSuported).toBe(false);
  });

  it('fails the boot, destroying the connection, when the lock times out', async () => {
    const f = fake(0);
    await expect(createMariadbBootDataSource(options, f.create)).rejects.toThrow(/boot migration lock/);
    expect(f.dataSource.runMigrations).not.toHaveBeenCalled();
    expect(f.dataSource.destroy).toHaveBeenCalled();
  });

  it('releases the lock even when a migration fails', async () => {
    const f = fake(1);
    f.dataSource.runMigrations.mockRejectedValue(new Error('bad migration'));
    await expect(createMariadbBootDataSource(options, f.create)).rejects.toThrow('bad migration');
    expect(f.calls).toContain('SELECT RELEASE_LOCK(?)');
    expect(f.dataSource.destroy).toHaveBeenCalled();
  });

  it('skips the lock and the chain when migrationsRun is false', async () => {
    const f = fake(1);
    await createMariadbBootDataSource({ ...options, migrationsRun: false }, f.create);
    expect(f.dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(f.dataSource.runMigrations).not.toHaveBeenCalled();
  });
});
