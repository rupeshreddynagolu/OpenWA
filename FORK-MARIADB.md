# Fork notes: MariaDB + Sidequest (no Redis)

This fork adds MariaDB as a third data database and Sidequest as a Redis-free durable queue. The main database
(API keys, audit, settings) stays SQLite.

## Configuration

| Variable                                                                                        | Value                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `DATABASE_TYPE`                                                                                 | `mariadb`                                         |
| `DATABASE_HOST` / `DATABASE_PORT` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` / `DATABASE_NAME` | connection (port defaults to 3306)                |
| `QUEUE_ENABLED`                                                                                 | `true`                                            |
| `QUEUE_DRIVER`                                                                                  | `sidequest` (default `bullmq`, which needs Redis) |
| `REDIS_ENABLED`                                                                                 | `false`                                           |

`QUEUE_DRIVER=sidequest` requires `DATABASE_TYPE=mariadb`; `DATABASE_SYNCHRONIZE=true` is refused on MariaDB.

## How it works

- `src/database/mariadb-connection.ts`: every pooled connection gets `ANSI_QUOTES,PIPES_AS_CONCAT`, so the raw SQL
  written for Postgres/SQLite (`"col"`, `||`) runs unchanged; uuid ids stay `varchar(36)` (`useVarcharUuids`).
- `src/database/mariadb-boot-migrations.ts`: boot migrations run while holding a row lock in `openwa_boot_lock`, a
  table in OpenWA's own database (not `GET_LOCK`, whose names are server-wide and could be held by another account
  on shared hosting).
- `src/database/migrations-mariadb/`: a single baseline of the 0.27.0 schema. TEXT columns are `LONGTEXT` (MariaDB
  TEXT holds only 64 KB) and `messages.body` carries the FULLTEXT index search uses.
- `src/modules/queue/sidequest/`: Sidequest runs inline in the app process and calls the existing BullMQ processors
  through an adapter bound to BullMQ's queue tokens. `src/modules/queue/active-queue.module.ts` picks the driver.
- Search on MariaDB supports `match=word` (FULLTEXT, boolean mode). `match=contains` answers 501.

## Maintenance

- **Every upstream migration needs a MariaDB counterpart** in `src/database/migrations-mariadb/`.
- Drift check (against a migrated MariaDB):
  `DATABASE_TYPE=mariadb … npx typeorm-ts-node-commonjs migration:generate src/database/migrations-mariadb/Drift -d src/database/data-source.ts --dryrun`
  Expected output, and only this: `text`↔`longtext` for 36 columns, `IDX_messages_body_fulltext` (not an entity
  index), and `IDX_send_idempotency_keys_expiresAt` (rebuilt only because its column is LONGTEXT). Anything else is a
  missing MariaDB migration.

## Known limits

- An imported session key longer than 36 characters does not fit the `varchar(36)` id columns.
- Under webhook backpressure the processor's postponement delay does not grow (Sidequest keeps no snooze count).
- Queue counts report jobs waiting for a later time as `wait`, never `delayed`.
- Dashboard data export/import has not been exercised on MariaDB.
- Bull Board (`/api/admin/queues`) is not mounted in Sidequest mode.
- With `DATABASE_SSL=true` both the data connection and the Sidequest queue connection use TLS, verifying the server
  unless `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.
