import type { ConfigService } from '@nestjs/config';
import {
  ensureSidequestTablesInnoDb,
  SIDEQUEST_SESSION_ENGINE_STATEMENT,
  sidequestBackendConfig,
} from './sidequest-queue.module';

describe('sidequestBackendConfig', () => {
  const config = (values: Record<string, unknown>) =>
    ({
      get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback),
    }) as unknown as ConfigService;
  const base = {
    'dataDatabase.host': 'db.local',
    'dataDatabase.port': 3307,
    'dataDatabase.username': 'acct_openwa',
    'dataDatabase.password': 'p@ss:/word#?',
    'dataDatabase.name': 'acct_openwa',
  };

  it('passes the credentials as a connection object, so no character needs URL encoding', () => {
    expect(sidequestBackendConfig(config(base)).connection).toEqual({
      host: 'db.local',
      port: 3307,
      user: 'acct_openwa',
      password: 'p@ss:/word#?',
      database: 'acct_openwa',
      charset: 'utf8mb4',
    });
  });

  it('encrypts the queue connection when DATABASE_SSL is on, verifying the server by default', () => {
    expect(sidequestBackendConfig(config({ ...base, 'dataDatabase.ssl': true })).connection.ssl).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('honours DATABASE_SSL_REJECT_UNAUTHORIZED=false, as the data connection does', () => {
    expect(
      sidequestBackendConfig(config({ ...base, 'dataDatabase.ssl': true, 'dataDatabase.sslRejectUnauthorized': false }))
        .connection.ssl,
    ).toEqual({ rejectUnauthorized: false });
  });

  it('adds no TLS settings when DATABASE_SSL is off', () => {
    expect(sidequestBackendConfig(config(base)).connection).not.toHaveProperty('ssl');
  });
});

describe('Sidequest tables on InnoDB', () => {
  it('makes every Sidequest connection create its tables on InnoDB', () => {
    const { pool } = sidequestBackendConfig({ get: (_k: string, fallback?: unknown) => fallback } as never);
    const connection = { query: jest.fn((_sql: string, callback: (error: unknown) => void) => callback(null)) };
    const done = jest.fn();
    pool.afterCreate(connection, done);
    expect(connection.query).toHaveBeenCalledWith(SIDEQUEST_SESSION_ENGINE_STATEMENT, expect.any(Function));
    expect(SIDEQUEST_SESSION_ENGINE_STATEMENT).toMatch(/default_storage_engine\s*=\s*InnoDB/);
    expect(done).toHaveBeenCalledWith(null, connection);
  });

  it('converts Sidequest tables left on another engine, and only those', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.startsWith('SELECT')
          ? [
              { name: 'sidequest_jobs', engine: 'MyISAM' },
              { name: 'sidequest_queues', engine: 'MyISAM' },
              { name: 'sidequest_x; DROP TABLE y', engine: 'MyISAM' },
            ]
          : [],
      ),
    );
    await expect(ensureSidequestTablesInnoDb({ query } as never)).resolves.toEqual([
      'sidequest_jobs',
      'sidequest_queues',
    ]);
    expect(query).toHaveBeenCalledWith('ALTER TABLE `sidequest_jobs` ENGINE=InnoDB');
    expect(query).toHaveBeenCalledWith('ALTER TABLE `sidequest_queues` ENGINE=InnoDB');
    expect(query.mock.calls.some(([sql]) => sql.includes('DROP TABLE'))).toBe(false);
  });

  it('does nothing when every Sidequest table is already InnoDB', async () => {
    const query = jest.fn(() => Promise.resolve([]));
    await expect(ensureSidequestTablesInnoDb({ query } as never)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
