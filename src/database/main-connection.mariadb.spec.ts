import type { ConfigService } from '@nestjs/config';
import { MAIN_MARIADB_MIGRATIONS_TABLE, mainConnectionOptions } from './main-connection';
import { validateEnv } from '../config/env.validation';

// Fork addition: MAIN_DATABASE_TYPE=mariadb keeps the auth/audit tables in the MariaDB data database.
describe('mainConnectionOptions — MAIN_DATABASE_TYPE=mariadb', () => {
  const config = (values: Record<string, unknown>) =>
    ({
      get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback),
    }) as unknown as ConfigService;

  const maria = {
    'database.type': 'mariadb',
    'dataDatabase.host': 'localhost',
    'dataDatabase.port': 3306,
    'dataDatabase.username': 'acct_openwa',
    'dataDatabase.password': 'secret',
    'dataDatabase.name': 'acct_openwa',
  };

  it('uses the MariaDB data connection, its own migration chain and its own ledger table', () => {
    const options = mainConnectionOptions(config(maria)) as unknown as {
      type: string;
      name: string;
      synchronize?: boolean;
      host?: string;
      database?: string;
      migrationsTableName?: string;
      migrations?: string[];
    };
    expect(options.type).toBe('mariadb');
    expect(options.name).toBe('main');
    expect(options.host).toBe('localhost');
    expect(options.database).toBe('acct_openwa');
    expect(options.migrationsTableName).toBe(MAIN_MARIADB_MIGRATIONS_TABLE);
    expect(MAIN_MARIADB_MIGRATIONS_TABLE).not.toBe('migrations');
    expect(options.migrations?.[0]).toMatch(/migrations-main-mariadb/);
    expect(options.synchronize).toBe(false);
  });

  it('keeps the SQLite file by default, so existing installs are unchanged', () => {
    const options = mainConnectionOptions(config({ 'database.database': './data/main.sqlite' }));
    expect(options.type).toBe('better-sqlite3');
    expect((options as { database?: string }).database).toBe('./data/main.sqlite');
  });
});

describe('validateEnv — MAIN_DATABASE_TYPE', () => {
  const maria = { DATABASE_TYPE: 'mariadb', DATABASE_HOST: 'db', DATABASE_USERNAME: 'u', DATABASE_PASSWORD: 'p' };

  it('accepts mariadb next to a MariaDB data database', () => {
    expect(() => validateEnv({ ...maria, MAIN_DATABASE_TYPE: 'mariadb' })).not.toThrow();
  });

  it('refuses mariadb without a MariaDB data database, whose connection it shares', () => {
    expect(() => validateEnv({ MAIN_DATABASE_TYPE: 'mariadb' })).toThrow(/needs DATABASE_TYPE=mariadb/);
  });

  it('rejects an unknown value and synchronize on MariaDB', () => {
    expect(() => validateEnv({ ...maria, MAIN_DATABASE_TYPE: 'postgres' })).toThrow(
      /MAIN_DATABASE_TYPE must be "sqlite" or "mariadb"/,
    );
    expect(() => validateEnv({ ...maria, MAIN_DATABASE_TYPE: 'mariadb', MAIN_DATABASE_SYNCHRONIZE: 'true' })).toThrow(
      /MAIN_DATABASE_SYNCHRONIZE=true is not allowed/,
    );
  });
});
