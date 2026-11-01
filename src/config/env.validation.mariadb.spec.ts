import { validateEnv } from './env.validation';

// Fork additions: DATABASE_TYPE=mariadb and QUEUE_DRIVER.
describe('validateEnv — MariaDB and QUEUE_DRIVER', () => {
  const maria = { DATABASE_TYPE: 'mariadb', DATABASE_HOST: 'db', DATABASE_USERNAME: 'u', DATABASE_PASSWORD: 'p' };

  it('accepts DATABASE_TYPE=mariadb with its connection settings', () => {
    expect(() => validateEnv(maria)).not.toThrow();
  });

  it('requires host, username and password for mariadb, as for postgres', () => {
    expect(() => validateEnv({ DATABASE_TYPE: 'mariadb' })).toThrow(
      /DATABASE_HOST is required when DATABASE_TYPE=mariadb/,
    );
    expect(() => validateEnv({ ...maria, DATABASE_PASSWORD: '' })).toThrow(/DATABASE_PASSWORD is required/);
  });

  it('refuses synchronize on mariadb, whose schema the migrations own', () => {
    expect(() => validateEnv({ ...maria, DATABASE_SYNCHRONIZE: 'true' })).toThrow(
      /DATABASE_SYNCHRONIZE=true is not allowed with DATABASE_TYPE=mariadb/,
    );
  });

  it('still rejects an unknown DATABASE_TYPE, naming the three it accepts', () => {
    expect(() => validateEnv({ DATABASE_TYPE: 'mysql' })).toThrow(/"sqlite", "postgres" or "mariadb"/);
  });

  it('accepts QUEUE_DRIVER bullmq (default) and sidequest on mariadb', () => {
    expect(() => validateEnv({ QUEUE_DRIVER: 'bullmq' })).not.toThrow();
    expect(() => validateEnv({ ...maria, QUEUE_DRIVER: 'sidequest' })).not.toThrow();
  });

  it('rejects an unknown QUEUE_DRIVER', () => {
    expect(() => validateEnv({ QUEUE_DRIVER: 'redis' })).toThrow(/QUEUE_DRIVER must be "bullmq" or "sidequest"/);
  });

  it('refuses QUEUE_DRIVER=sidequest without mariadb, where its jobs live', () => {
    expect(() => validateEnv({ QUEUE_DRIVER: 'sidequest' })).toThrow(/needs DATABASE_TYPE=mariadb/);
    expect(() =>
      validateEnv({
        DATABASE_TYPE: 'postgres',
        DATABASE_HOST: 'db',
        DATABASE_USERNAME: 'u',
        DATABASE_PASSWORD: 'p',
        QUEUE_DRIVER: 'sidequest',
      }),
    ).toThrow(/needs DATABASE_TYPE=mariadb/);
  });
});

describe('validateEnv — MariaDB DATABASE_NAME', () => {
  it('takes a bare database name on mariadb, which the SQLite file-path rule would refuse', () => {
    const maria = { DATABASE_TYPE: 'mariadb', DATABASE_HOST: 'db', DATABASE_USERNAME: 'u', DATABASE_PASSWORD: 'p' };
    expect(() => validateEnv({ ...maria, DATABASE_NAME: 'openwa_e2e' })).not.toThrow();
    // The rule still guards SQLite.
    expect(() => validateEnv({ DATABASE_NAME: 'openwa_e2e' })).toThrow(/DATABASE_NAME must be a file path/);
  });
});
