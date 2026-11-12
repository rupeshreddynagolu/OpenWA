import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MariaDB baseline of the main (auth/audit) tables for MAIN_DATABASE_TYPE=mariadb (fork addition), generated from
 * the auth/audit entities with `migration:generate` (uuid ids kept as varchar, TEXT as LONGTEXT). Its ledger is the
 * `migrations_main` table. Later upstream migrations-main migrations need a counterpart in this directory.
 */
export class MainMariadbBaseline1794473667797 implements MigrationInterface {
  name = 'MainMariadbBaseline1794473667797';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The main connection starts before the data one, so on a latin1 database (a hosting panel's default) these
    // tables would be created before the data baseline switches it: set utf8mb4 here first as well.
    await queryRunner.query(`ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await queryRunner.query(
      `CREATE TABLE \`api_keys\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(100) NOT NULL, \`keyHash\` varchar(64) NOT NULL, \`keyPrefix\` varchar(12) NOT NULL, \`role\` varchar(20) NOT NULL DEFAULT 'operator', \`allowedIps\` longtext NULL, \`allowedSessions\` longtext NULL, \`allowedChats\` longtext NULL, \`isActive\` tinyint NOT NULL DEFAULT 1, \`expiresAt\` datetime NULL, \`lastUsedAt\` datetime NULL, \`usageCount\` int NOT NULL DEFAULT '0', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_df3b25181df0b4b59bd93f16e1\` (\`keyHash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`audit_logs\` (\`id\` varchar(36) NOT NULL, \`action\` varchar(50) NOT NULL, \`severity\` varchar(10) NOT NULL DEFAULT 'info', \`apiKeyId\` varchar(36) NULL, \`apiKeyName\` varchar(100) NULL, \`sessionId\` varchar(36) NULL, \`sessionName\` varchar(100) NULL, \`ipAddress\` varchar(45) NULL, \`userAgent\` varchar(500) NULL, \`method\` varchar(10) NULL, \`path\` varchar(500) NULL, \`statusCode\` int NULL, \`metadata\` longtext NULL, \`errorMessage\` longtext NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_cee5459245f652b75eb2759b4c\` (\`action\`), INDEX \`IDX_741fa976d1e04e695f3aa23cb8\` (\`apiKeyId\`), INDEX \`IDX_dd2b6e43c767b6b5b2bb227ace\` (\`sessionId\`), INDEX \`IDX_c69efb19bf127c97e6740ad530\` (\`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`IDX_c69efb19bf127c97e6740ad530\` ON \`audit_logs\``);
    await queryRunner.query(`DROP INDEX \`IDX_dd2b6e43c767b6b5b2bb227ace\` ON \`audit_logs\``);
    await queryRunner.query(`DROP INDEX \`IDX_741fa976d1e04e695f3aa23cb8\` ON \`audit_logs\``);
    await queryRunner.query(`DROP INDEX \`IDX_cee5459245f652b75eb2759b4c\` ON \`audit_logs\``);
    await queryRunner.query(`DROP TABLE \`audit_logs\``);
    await queryRunner.query(`DROP INDEX \`IDX_df3b25181df0b4b59bd93f16e1\` ON \`api_keys\``);
    await queryRunner.query(`DROP TABLE \`api_keys\``);
  }
}
