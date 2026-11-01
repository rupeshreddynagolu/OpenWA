import {
  MARIADB_SESSION_SQL_MODE_STATEMENT,
  mariadbConnectionOptions,
  mariadbDriver,
  useVarcharUuids,
} from './mariadb-connection';

describe('mariadbDriver', () => {
  const fakeMysql2 = () => {
    const listeners: Array<(connection: { query: jest.Mock }) => void> = [];
    const pool = {
      on: jest.fn((event: string, listener: (c: { query: jest.Mock }) => void) => listeners.push(listener)),
    };
    const createPool = jest.fn<typeof pool, [options: unknown]>(() => pool);
    return { base: { createPool, escape: jest.fn() }, pool, listeners };
  };

  it('sets ANSI_QUOTES and PIPES_AS_CONCAT on every connection the pool opens', () => {
    const { base, pool, listeners } = fakeMysql2();
    const driver = mariadbDriver(base);
    const created = driver.createPool({ host: 'db' });

    expect(base.createPool).toHaveBeenCalledWith({ host: 'db' });
    expect(created).toBe(pool);
    expect(pool.on).toHaveBeenCalledWith('connection', expect.any(Function));
    const first = { query: jest.fn() };
    const second = { query: jest.fn() };
    listeners.forEach(listener => {
      listener(first);
      listener(second);
    });
    expect(first.query).toHaveBeenCalledWith(MARIADB_SESSION_SQL_MODE_STATEMENT);
    expect(second.query).toHaveBeenCalledWith(MARIADB_SESSION_SQL_MODE_STATEMENT);
  });

  it('appends the modes to the server sql_mode instead of replacing it', () => {
    expect(MARIADB_SESSION_SQL_MODE_STATEMENT).toContain('@@SESSION.sql_mode');
    expect(MARIADB_SESSION_SQL_MODE_STATEMENT).toMatch(/ANSI_QUOTES,PIPES_AS_CONCAT/);
  });

  it('keeps the rest of the driver module, which TypeORM also reads', () => {
    const { base } = fakeMysql2();
    expect(mariadbDriver(base).escape).toBe(base.escape);
  });
});

describe('mariadbConnectionOptions', () => {
  it('builds a utf8mb4, UTC, migration-managed mariadb connection with the wrapped driver', () => {
    const options = mariadbConnectionOptions({ host: 'db', port: 3307, username: 'u', password: 'p', database: 'x' });
    expect(options).toMatchObject({
      type: 'mariadb',
      host: 'db',
      port: 3307,
      username: 'u',
      password: 'p',
      database: 'x',
      charset: 'utf8mb4_unicode_ci',
      timezone: 'Z',
      synchronize: false,
    });
    expect(typeof (options.driver as { createPool: unknown }).createPool).toBe('function');
  });

  it('defaults the port to 3306 and enables TLS only when asked', () => {
    expect(mariadbConnectionOptions({}).port).toBe(3306);
    expect(mariadbConnectionOptions({}).ssl).toBeUndefined();
    expect(mariadbConnectionOptions({ ssl: true, sslRejectUnauthorized: false }).ssl).toEqual({
      rejectUnauthorized: false,
    });
  });
});

describe('useVarcharUuids', () => {
  it('turns off the native UUID column type TypeORM picks for MariaDB 10.7+', () => {
    const dataSource = { driver: { uuidColumnTypeSuported: true } };
    useVarcharUuids(dataSource);
    expect(dataSource.driver.uuidColumnTypeSuported).toBe(false);
  });
});
