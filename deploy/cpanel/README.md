# Deploying OpenWA on cPanel

This guide puts OpenWA on ordinary cPanel hosting: **cPanel's Node.js app support (Phusion Passenger), a cPanel
MariaDB database, no Docker and no Redis.** It uses this fork's MariaDB data database and the Sidequest queue, which
stores background jobs in the same database instead of Redis.

> Read the ban-risk section of the main README before linking a number. Use a spare number, not your personal one.

## 1. What you need

| Requirement    | Details                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| cPanel feature | **Setup Node.js App** (CloudLinux Node.js Selector). Ask your host if you do not see it under _Software_.                |
| Node.js        | **22.19 or newer** in the app's version list (Sidequest needs 22.6+, OpenWA 22.19+).                                     |
| Database       | **MariaDB 10.6 or newer** from _MySQL® Databases_ (10.5 works except the webhook redrive endpoint). MySQL 8 is untested. |
| Memory         | About **512 MB to 1 GB** for the app process. Baileys uses roughly 30 to 80 MB per WhatsApp session.                     |
| Domain         | A subdomain for the app, such as `openwa.example.com`, with SSL (cPanel _SSL/TLS Status_ → AutoSSL).                     |
| Optional       | **SSH access** (_Terminal_ in cPanel) makes installing, upgrading and troubleshooting much easier.                       |

What does **not** work on shared hosting, by design of the environment:

- **The whatsapp-web.js engine.** It needs headless Chromium, which shared hosting cannot run. This setup uses **Baileys**.
- **Several app processes.** OpenWA keeps each live WhatsApp connection in its process; run exactly one (step 8).
- **Docker-bundled services** (built-in Postgres, MinIO, Redis). Nothing here needs them.

## 2. Build the bundle (on your computer)

From the repository root, with Node 22 and the dependencies installed (`npm ci`):

```bash
deploy/cpanel/build-bundle.sh
```

This produces `release/openwa-cpanel.zip`: the compiled API (`dist/`), the built dashboard (`dashboard/dist/`), a
runtime-only `package.json`, the dependency patches, `app.js` (the Passenger startup file), `.env.example` and this
guide. The server needs no TypeScript or dashboard build tools.

## 3. Create the database (cPanel → _MySQL® Databases_)

1. **Create New Database**: e.g. `openwa`. cPanel prefixes it with your account name: `myacct_openwa`.
2. **Add New User**: e.g. `openwa`, with a long generated password. It becomes `myacct_openwa`.
3. **Add User To Database**: choose the user and the database, then tick **ALL PRIVILEGES**.

Note the full prefixed names and the password for step 6. The host is `localhost` and the port `3306`. You do not need
to create tables or change the charset: on first start OpenWA switches the database to `utf8mb4` (for emoji) and
creates its schema; Sidequest then adds its own `sidequest_*` tables.

## 4. Upload the app (cPanel → _File Manager_)

1. Open your home directory (e.g. `/home/myacct`), **not** `public_html`. The app root must not be web-served as files.
2. **Upload** `openwa-cpanel.zip`, then **Extract** it. You get `/home/myacct/openwa-cpanel/`.
3. Optionally **Rename** it to `openwa`. This guide calls the folder the _application root_.

It must contain `app.js`, `package.json`, `dist/` and `dashboard/` directly inside it.

## 5. Create the Node.js application (cPanel → _Setup Node.js App_ → **Create Application**)

| Field                    | Value                                                               |
| ------------------------ | ------------------------------------------------------------------- |
| Node.js version          | the newest **22.x** offered (22.19 or newer)                        |
| Application mode         | **Production**                                                      |
| Application root         | `openwa` (the folder from step 4, relative to your home)            |
| Application URL          | your subdomain, e.g. `openwa.example.com`, with the path left empty |
| Application startup file | `app.js`                                                            |

Click **Create**. cPanel writes a Passenger block into the subdomain's `.htaccess` and shows a command like
`source /home/myacct/nodevenv/openwa/22/bin/activate && cd /home/myacct/openwa`. Copy it; you need it for SSH.

Install the app at the **root of a subdomain**. OpenWA serves its API under `/api` and the dashboard at `/`, and does
not support being mounted under a sub-path such as `example.com/openwa`.

## 6. Configure (`.env` in the application root)

In _File Manager_, enable **Show Hidden Files**, copy `.env.example` to `.env`, and edit it:

```dotenv
DATABASE_NAME=myacct_openwa
DATABASE_USERNAME=myacct_openwa
DATABASE_PASSWORD=the-password-from-step-3
CORS_ORIGINS=https://openwa.example.com
```

Everything else in `.env.example` is already set for cPanel: MariaDB for both the data and the API-key/audit tables
(`MAIN_DATABASE_TYPE=mariadb`, so no native SQLite driver is needed), the Sidequest queue, no Redis, the Baileys
engine, production mode, trusted local proxy. Then set the file's **Permissions** to `600`, because it holds the
database password. Variables entered in the _Setup Node.js App_ screen override the file, if you prefer that.

## 7. Install dependencies and start

**With SSH (recommended)**, paste the command cPanel showed in step 5, then:

```bash
npm install --omit=dev
```

**Without SSH**, open the app in _Setup Node.js App_ and click **Run NPM Install**. If it times out or runs out of
memory on a small plan, ask your host to run it, or use SSH.

The install skips the Chromium download (the bundle's `.puppeteerrc.cjs` turns it off). OpenWA's dependency patches
are applied at install time over SSH (lines like `patch-baileys-pairing: applied`). The panel's button installs into
CloudLinux's own folder (`~/nodevenv/openwa/<version>/lib`), where it only prints `openwa: no scripts/ folder here …`;
`app.js` then applies the same patches when the app first starts, so both ways end up patched. Then click **Restart**
in _Setup Node.js App_.

Check it: open `https://openwa.example.com/api/health`. It should answer `{"status":"ok",…}`.

On first start OpenWA creates the first admin API key and writes it to **`data/.api-key`** in the application root.
Open that file in _File Manager_ to read it. Sign in at `https://openwa.example.com` with it, then create your own admin
key on the **API Keys** page and delete the generated one.

## 8. Keep exactly one process running

Passenger starts the app on the first request, may stop it when idle, and can start more processes under load. OpenWA
needs one process that stays up, or WhatsApp disconnects. Do both of the following.

**a. Passenger settings.** Edit the `.htaccess` in the subdomain's document root (the folder cPanel created for the
subdomain, e.g. `/home/myacct/openwa.example.com`). Add these lines **outside** the
`# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION` block, which cPanel rewrites:

```apache
# Keep one OpenWA process alive and never start a second one.
PassengerMinInstances 1
PassengerMaxInstancesPerApp 1
```

Some hosts do not allow these directives in `.htaccess`. If the site answers **500 Internal Server Error** after adding
them, remove them and ask your host to set "minimum 1, maximum 1 Passenger instance" for the app.

**b. A keep-alive request.** In cPanel → _Cron Jobs_, add one that runs every 5 minutes:

```bash
curl -fsS -o /dev/null https://openwa.example.com/api/health
```

This also starts the app again after a server reboot, and `AUTO_START_SESSIONS=true` reconnects linked sessions on
every start.

## 9. Link WhatsApp

Dashboard → **Sessions** → create a session → start it → scan the QR from the phone (WhatsApp → _Settings_ → _Linked
devices_ → _Link a device_). The QR refreshes about every 20 seconds; the dashboard shows the current one.

### Moving an existing installation instead

To bring over a session that is already linked, plus its history:

1. **Stop the old installation first.** One WhatsApp session must never run in two places at once.
2. Copy its `data/` folder into the new application root. It holds the WhatsApp login files (`data/sessions/`), the
   API keys and settings (`data/main.sqlite`), and `data/.api-key`.
3. If the old data database was SQLite (`data/openwa.sqlite`), copy its contents into the cPanel database. Start the
   app once first so the schema exists, stop it, then over SSH (in the app's environment from step 5) run:
   ```bash
   MARIADB_HOST=localhost MARIADB_PORT=3306 MARIADB_USER=myacct_openwa MARIADB_DATABASE=myacct_openwa \
   MARIADB_PASSWORD='…' node tools/copy-sqlite-to-mariadb.cjs . data/openwa.sqlite
   ```
   It refuses to copy into tables that already hold rows and prints a per-table row-count check.
4. Restart the app. The session reconnects without a new QR.

## 10. Updating

1. Build a new bundle (step 2) and upload it.
2. Replace `dist/`, `dashboard/`, `scripts/`, `tools/`, `app.js`, `package.json` and `package-lock.json`. **Keep `.env`
   and `data/`.**
3. Run `npm install --omit=dev` (or **Run NPM Install**), then **Restart**. Database migrations run automatically on
   start, under a lock.

## 11. Backups

- **Database**: cPanel → _Backup_ → _Download a MySQL Database Backup_, or phpMyAdmin → _Export_.
- **Files**: the application root's `data/` folder (WhatsApp login files, API keys, uploaded media) and `.env`.

Restoring both brings a session back without re-linking.

## 12. Troubleshooting

| Symptom                                                               | Likely cause and fix                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| _Setup Node.js App_ shows an error, or the site answers 503           | Read `stderr.log` in the application root (or the log path cPanel shows). Most start-up errors name the setting at fault.                   |
| `Invalid environment configuration: …`                                | A value in `.env` is missing or misspelt; the message lists each one.                                                                       |
| `Access denied for user` / `ER_DBACCESS_DENIED_ERROR`                 | Use the **prefixed** names (`myacct_…`) and check the user has ALL PRIVILEGES on the database (step 3).                                     |
| `GLIBC_2.29' not found (required by …better-sqlite3…)` and a 503      | The server's glibc is too old for the SQLite driver. Add `MAIN_DATABASE_TYPE=mariadb` to `.env` (a bundle from 12 Nov 2026 on) and restart. |
| npm install is killed or times out                                    | Not enough memory for the panel's installer. Use SSH (step 7) or ask the host.                                                              |
| `Cannot find module '…/nodevenv/openwa/…/lib/scripts/postinstall.js'` | A bundle built before 12 Nov 2026. Use a current bundle, or run `npm install --omit=dev` over SSH from the application root (step 7).       |
| A download of Chromium during install                                 | `.puppeteerrc.cjs` is missing from the application root; it ships in the bundle (hidden files).                                             |
| The WhatsApp session drops every so often                             | Passenger stopped the idle app. Add the step 8 settings and the cron job.                                                                   |
| WhatsApp keeps logging the session out, or two QR codes appear        | Two app processes are running. Limit Passenger to one instance (step 8a).                                                                   |
| Dashboard page is blank                                               | Open it over **https**. Production mode upgrades the page's requests to https.                                                              |
| Live updates in the dashboard are slow                                | The host's proxy blocks WebSockets; Socket.IO falls back to polling, which still works.                                                     |

## Security checklist

- The application root is outside `public_html`, and `.env` has permissions `600`.
- The generated admin key was replaced by your own, and the generated one deleted.
- Operator or viewer keys, limited to the sessions or chats they need, for every integration.
- `ENABLE_SWAGGER` stays off unless you need the public API docs.
