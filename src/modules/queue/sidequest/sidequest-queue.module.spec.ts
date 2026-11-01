import type { ConfigService } from '@nestjs/config';
import { sidequestBackendConfig } from './sidequest-queue.module';

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
