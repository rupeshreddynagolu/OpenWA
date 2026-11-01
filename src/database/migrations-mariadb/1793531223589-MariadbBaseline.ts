import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MariaDB baseline (fork addition): the whole data schema as of OpenWA 0.27.0, generated from the entities with
 * `migration:generate` against an empty MariaDB (uuid ids kept as varchar, see useVarcharUuids), plus the FULLTEXT
 * index search needs. TEXT columns are LONGTEXT here: MariaDB TEXT holds 64 KB, while text on Postgres and SQLite
 * is unbounded and OpenWA stores inline media and webhook payloads in them. Later upstream migrations need a MariaDB
 * counterpart in this directory.
 */
export class MariadbBaseline1793531223589 implements MigrationInterface {
  name = 'MariadbBaseline1793531223589';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tables below name no charset, so they take the database default, which a hosting panel often leaves at latin1:
    // a message with emoji would then fail to store. Set the database to utf8mb4 first (the owner has ALTER on it).
    await queryRunner.query(`ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await queryRunner.query(
      `CREATE TABLE \`chat_states\` (\`sessionId\` varchar(255) NOT NULL, \`chatId\` varchar(255) NOT NULL, \`muteEndTime\` bigint NULL, \`archived\` tinyint NOT NULL DEFAULT 0, \`pinned\` tinyint NOT NULL DEFAULT 0, \`observed\` varchar(255) NULL, \`deletedAt\` bigint NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`sessionId\`, \`chatId\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`sessions\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(100) NOT NULL, \`status\` varchar(50) NOT NULL DEFAULT 'created', \`phone\` varchar(20) NULL, \`pushName\` varchar(100) NULL, \`config\` longtext NOT NULL DEFAULT '{}', \`proxyUrl\` varchar(255) NULL, \`proxyType\` varchar(10) NULL, \`connectedAt\` longtext NULL, \`lastActiveAt\` longtext NULL, \`nodeId\` varchar(190) NULL, \`claimedAt\` longtext NULL, \`nodeUrl\` varchar(2048) NULL, \`leaseExpiresAt\` longtext NULL, \`desiredState\` varchar(20) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_ac984ccbd8b01af155e1874e8c\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`baileys_stored_messages\` (\`id\` varchar(36) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`waMessageId\` varchar(255) NOT NULL, \`serializedMessage\` longtext NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_baileys_stored_messages_session_created_id\` (\`sessionId\`, \`createdAt\`, \`id\`), UNIQUE INDEX \`IDX_1bb396e881628cd4dc8f0d2a8b\` (\`sessionId\`, \`waMessageId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`lid_mappings\` (\`lid\` varchar(255) NOT NULL, \`phone\` varchar(255) NULL, \`sessionId\` varchar(255) NULL, \`isReported\` tinyint NOT NULL DEFAULT 0, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_1e39479a7a8aa37eab08df013b\` (\`phone\`), PRIMARY KEY (\`lid\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`webhook_delivery_failures\` (\`id\` varchar(36) NOT NULL, \`webhookId\` varchar(255) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`event\` varchar(255) NOT NULL, \`url\` varchar(255) NOT NULL, \`idempotencyKey\` varchar(255) NULL, \`deliveryId\` varchar(255) NULL, \`attempts\` int NOT NULL, \`lastStatusCode\` int NULL, \`lastError\` longtext NOT NULL, \`payload\` longtext NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_webhook_delivery_failures_terminal\` (\`webhookId\`, \`idempotencyKey\`), INDEX \`IDX_webhook_delivery_failures_delivery\` (\`webhookId\`, \`idempotencyKey\`), INDEX \`IDX_webhook_delivery_failures_sessionId\` (\`sessionId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`webhook_outbox_events\` (\`id\` varchar(36) NOT NULL, \`webhookId\` varchar(255) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`event\` varchar(255) NOT NULL, \`idempotencyKey\` varchar(255) NOT NULL, \`deliveryId\` varchar(255) NOT NULL, \`payload\` longtext NULL, \`state\` varchar(255) NULL, \`attempts\` int NOT NULL DEFAULT '0', \`lastAttemptAt\` longtext NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_webhook_outbox_events_sessionId\` (\`sessionId\`), INDEX \`IDX_webhook_outbox_events_state_createdAt\` (\`state\`, \`createdAt\`), UNIQUE INDEX \`UQ_webhook_outbox_events_webhook_key\` (\`webhookId\`, \`idempotencyKey\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`webhooks\` (\`id\` varchar(36) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`url\` varchar(2048) NOT NULL, \`events\` longtext NOT NULL DEFAULT '["message.received"]', \`secret\` varchar(255) NULL, \`headers\` longtext NOT NULL DEFAULT '{}', \`filters\` longtext NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`retryCount\` int NOT NULL DEFAULT '3', \`lastTriggeredAt\` longtext NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_webhooks_sessionId\` (\`sessionId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`message_batches\` (\`id\` varchar(36) NOT NULL, \`batch_id\` varchar(255) NOT NULL, \`session_id\` varchar(255) NOT NULL, \`status\` varchar(255) NOT NULL DEFAULT 'pending', \`messages\` longtext NOT NULL, \`options\` longtext NULL, \`progress\` longtext NULL, \`results\` longtext NULL, \`current_index\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`started_at\` longtext NULL, \`completed_at\` longtext NULL, UNIQUE INDEX \`UQ_message_batches_session_id_batch_id\` (\`session_id\`, \`batch_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`messages\` (\`id\` varchar(36) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`waMessageId\` varchar(255) NULL, \`chatId\` varchar(255) NOT NULL, \`chatName\` varchar(255) NULL, \`author\` varchar(255) NULL, \`from\` varchar(255) NOT NULL, \`to\` varchar(255) NOT NULL, \`body\` longtext NULL, \`type\` varchar(255) NOT NULL DEFAULT 'text', \`direction\` varchar(255) NOT NULL DEFAULT 'outgoing', \`timestamp\` bigint NULL, \`metadata\` longtext NULL, \`mediaPath\` varchar(255) NULL, \`mediaMimetype\` varchar(255) NULL, \`status\` varchar(255) NOT NULL DEFAULT 'sent', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_messages_mediaPath\` (\`mediaPath\`), INDEX \`IDX_befd307485dbf0559d17e4a4d2\` (\`status\`), INDEX \`IDX_messages_createdAt\` (\`createdAt\`), UNIQUE INDEX \`UQ_messages_sessionId_waMessageId\` (\`sessionId\`, \`waMessageId\`), INDEX \`IDX_messages_session_direction_timestamp_id\` (\`sessionId\`, \`direction\`, \`timestamp\`, \`id\`), INDEX \`IDX_messages_session_chat_timestamp_id\` (\`sessionId\`, \`chatId\`, \`timestamp\`, \`id\`), INDEX \`IDX_messages_session_timestamp_id\` (\`sessionId\`, \`timestamp\`, \`id\`), INDEX \`IDX_messages_sessionId_chatId_createdAt\` (\`sessionId\`, \`chatId\`, \`createdAt\`), INDEX \`IDX_36bc604c820bb9adc4c75cd411\` (\`chatId\`), INDEX \`IDX_399833392126349ef0b04b9bed\` (\`sessionId\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`send_idempotency_keys\` (\`id\` varchar(36) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`idempotencyKey\` varchar(255) NOT NULL, \`route\` varchar(255) NOT NULL, \`requestHash\` varchar(255) NOT NULL, \`state\` varchar(255) NOT NULL, \`responseBody\` longtext NULL, \`expiresAt\` longtext NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_send_idempotency_keys_expiresAt\` (\`expiresAt\`), UNIQUE INDEX \`UQ_send_idempotency_keys_session_key\` (\`sessionId\`, \`idempotencyKey\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`templates\` (\`id\` varchar(36) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`name\` varchar(100) NOT NULL, \`body\` longtext NOT NULL, \`header\` longtext NULL, \`footer\` longtext NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_templates_session_name\` (\`sessionId\`, \`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`conversation_mappings\` (\`id\` varchar(36) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`chatId\` varchar(255) NOT NULL, \`pluginId\` varchar(255) NOT NULL, \`instanceId\` varchar(255) NOT NULL, \`providerConversationId\` varchar(255) NOT NULL, \`handoverState\` varchar(255) NOT NULL DEFAULT 'bot', \`metadata\` longtext NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_conversation_mappings_reverse\` (\`pluginId\`, \`instanceId\`, \`providerConversationId\`), UNIQUE INDEX \`UQ_conversation_mappings_forward\` (\`sessionId\`, \`chatId\`, \`pluginId\`, \`instanceId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`ingress_events\` (\`id\` varchar(255) NOT NULL, \`instanceId\` varchar(255) NOT NULL, \`pluginId\` varchar(255) NOT NULL, \`providerDeliveryId\` varchar(255) NOT NULL, \`route\` varchar(255) NOT NULL, \`payload\` longtext NULL, \`payloadHash\` varchar(255) NULL, \`sessionId\` varchar(255) NULL, \`dispatchState\` varchar(255) NULL, \`dispatchAttempts\` int NOT NULL DEFAULT '0', \`lastDispatchAt\` longtext NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_ingress_events_dispatchState\` (\`dispatchState\`, \`createdAt\`), INDEX \`IDX_ingress_events_createdAt\` (\`createdAt\`), UNIQUE INDEX \`UQ_ingress_events_instance_delivery\` (\`pluginId\`, \`instanceId\`, \`providerDeliveryId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`integration_delivery_failures\` (\`id\` varchar(36) NOT NULL, \`direction\` varchar(255) NOT NULL, \`pluginId\` varchar(255) NOT NULL, \`instanceId\` varchar(255) NOT NULL, \`sessionId\` varchar(255) NULL, \`deliveryId\` varchar(255) NULL, \`attempts\` int NOT NULL, \`lastError\` longtext NOT NULL, \`payload\` longtext NULL, \`redriven\` tinyint NOT NULL DEFAULT 0, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_integration_delivery_failures_instance_delivery\` (\`pluginId\`, \`instanceId\`, \`deliveryId\`), INDEX \`IDX_integration_delivery_failures_instance\` (\`pluginId\`, \`instanceId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`plugin_instances\` (\`id\` varchar(255) NOT NULL, \`pluginId\` varchar(255) NOT NULL, \`instanceId\` varchar(255) NOT NULL, \`sessionScope\` varchar(255) NULL, \`secret\` varchar(255) NOT NULL, \`verifyToken\` varchar(255) NULL, \`config\` longtext NULL, \`enabled\` tinyint NOT NULL DEFAULT 1, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_plugin_instances_plugin_instance\` (\`pluginId\`, \`instanceId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`status_updates\` (\`id\` varchar(36) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`contactJid\` varchar(255) NOT NULL, \`contactName\` varchar(255) NULL, \`contactPushName\` varchar(255) NULL, \`waStatusId\` varchar(255) NOT NULL, \`type\` varchar(255) NOT NULL, \`caption\` longtext NULL, \`mediaPath\` varchar(255) NULL, \`mediaMimetype\` varchar(255) NULL, \`mediaOmitted\` tinyint NOT NULL DEFAULT 0, \`omitReason\` varchar(255) NULL, \`backgroundColor\` varchar(255) NULL, \`font\` int NULL, \`postedAt\` bigint NOT NULL, \`expiresAt\` bigint NOT NULL, INDEX \`IDX_951ec734b350580529e0b7ab2d\` (\`expiresAt\`), UNIQUE INDEX \`IDX_1152eee4d077ae74396d73c1fb\` (\`sessionId\`, \`waStatusId\`), INDEX \`IDX_432ae5ea12bbda479dcae30fb1\` (\`sessionId\`, \`contactJid\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`automation_rules\` (\`id\` varchar(36) NOT NULL, \`sessionId\` varchar(255) NOT NULL, \`name\` varchar(100) NOT NULL, \`enabled\` tinyint NOT NULL DEFAULT 1, \`conditions\` longtext NULL, \`replyText\` longtext NOT NULL, \`cooldownSeconds\` int NOT NULL DEFAULT '60', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_automation_rules_sessionId\` (\`sessionId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`baileys_stored_messages\` ADD CONSTRAINT \`FK_55c1dfd945d2c552a5313b25460\` FOREIGN KEY (\`sessionId\`) REFERENCES \`sessions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`webhooks\` ADD CONSTRAINT \`FK_d209715bb62b12255e825580af6\` FOREIGN KEY (\`sessionId\`) REFERENCES \`sessions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`templates\` ADD CONSTRAINT \`FK_53208331c90e332d3f13780729c\` FOREIGN KEY (\`sessionId\`) REFERENCES \`sessions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`automation_rules\` ADD CONSTRAINT \`FK_0a1a8f3af56b4861c39161daf4d\` FOREIGN KEY (\`sessionId\`) REFERENCES \`sessions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Fork addition: match=word search on MariaDB (builtin-fts.provider.ts, MARIADB_FULLTEXT_INDEX). Not an entity
    // index, so migration:generate proposes dropping it; keep it.
    await queryRunner.query(`ALTER TABLE \`messages\` ADD FULLTEXT INDEX \`IDX_messages_body_fulltext\` (\`body\`)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`messages\` DROP INDEX \`IDX_messages_body_fulltext\``);
    await queryRunner.query(`ALTER TABLE \`automation_rules\` DROP FOREIGN KEY \`FK_0a1a8f3af56b4861c39161daf4d\``);
    await queryRunner.query(`ALTER TABLE \`templates\` DROP FOREIGN KEY \`FK_53208331c90e332d3f13780729c\``);
    await queryRunner.query(`ALTER TABLE \`webhooks\` DROP FOREIGN KEY \`FK_d209715bb62b12255e825580af6\``);
    await queryRunner.query(
      `ALTER TABLE \`baileys_stored_messages\` DROP FOREIGN KEY \`FK_55c1dfd945d2c552a5313b25460\``,
    );
    await queryRunner.query(`DROP INDEX \`IDX_automation_rules_sessionId\` ON \`automation_rules\``);
    await queryRunner.query(`DROP TABLE \`automation_rules\``);
    await queryRunner.query(`DROP INDEX \`IDX_432ae5ea12bbda479dcae30fb1\` ON \`status_updates\``);
    await queryRunner.query(`DROP INDEX \`IDX_1152eee4d077ae74396d73c1fb\` ON \`status_updates\``);
    await queryRunner.query(`DROP INDEX \`IDX_951ec734b350580529e0b7ab2d\` ON \`status_updates\``);
    await queryRunner.query(`DROP TABLE \`status_updates\``);
    await queryRunner.query(`DROP INDEX \`UQ_plugin_instances_plugin_instance\` ON \`plugin_instances\``);
    await queryRunner.query(`DROP TABLE \`plugin_instances\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_integration_delivery_failures_instance\` ON \`integration_delivery_failures\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_integration_delivery_failures_instance_delivery\` ON \`integration_delivery_failures\``,
    );
    await queryRunner.query(`DROP TABLE \`integration_delivery_failures\``);
    await queryRunner.query(`DROP INDEX \`UQ_ingress_events_instance_delivery\` ON \`ingress_events\``);
    await queryRunner.query(`DROP INDEX \`IDX_ingress_events_createdAt\` ON \`ingress_events\``);
    await queryRunner.query(`DROP INDEX \`IDX_ingress_events_dispatchState\` ON \`ingress_events\``);
    await queryRunner.query(`DROP TABLE \`ingress_events\``);
    await queryRunner.query(`DROP INDEX \`UQ_conversation_mappings_forward\` ON \`conversation_mappings\``);
    await queryRunner.query(`DROP INDEX \`UQ_conversation_mappings_reverse\` ON \`conversation_mappings\``);
    await queryRunner.query(`DROP TABLE \`conversation_mappings\``);
    await queryRunner.query(`DROP INDEX \`IDX_templates_session_name\` ON \`templates\``);
    await queryRunner.query(`DROP TABLE \`templates\``);
    await queryRunner.query(`DROP INDEX \`UQ_send_idempotency_keys_session_key\` ON \`send_idempotency_keys\``);
    await queryRunner.query(`DROP INDEX \`IDX_send_idempotency_keys_expiresAt\` ON \`send_idempotency_keys\``);
    await queryRunner.query(`DROP TABLE \`send_idempotency_keys\``);
    await queryRunner.query(`DROP INDEX \`IDX_399833392126349ef0b04b9bed\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_36bc604c820bb9adc4c75cd411\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_messages_sessionId_chatId_createdAt\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_messages_session_timestamp_id\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_messages_session_chat_timestamp_id\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_messages_session_direction_timestamp_id\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`UQ_messages_sessionId_waMessageId\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_messages_createdAt\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_befd307485dbf0559d17e4a4d2\` ON \`messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_messages_mediaPath\` ON \`messages\``);
    await queryRunner.query(`DROP TABLE \`messages\``);
    await queryRunner.query(`DROP INDEX \`UQ_message_batches_session_id_batch_id\` ON \`message_batches\``);
    await queryRunner.query(`DROP TABLE \`message_batches\``);
    await queryRunner.query(`DROP INDEX \`IDX_webhooks_sessionId\` ON \`webhooks\``);
    await queryRunner.query(`DROP TABLE \`webhooks\``);
    await queryRunner.query(`DROP INDEX \`UQ_webhook_outbox_events_webhook_key\` ON \`webhook_outbox_events\``);
    await queryRunner.query(`DROP INDEX \`IDX_webhook_outbox_events_state_createdAt\` ON \`webhook_outbox_events\``);
    await queryRunner.query(`DROP INDEX \`IDX_webhook_outbox_events_sessionId\` ON \`webhook_outbox_events\``);
    await queryRunner.query(`DROP TABLE \`webhook_outbox_events\``);
    await queryRunner.query(`DROP INDEX \`IDX_webhook_delivery_failures_sessionId\` ON \`webhook_delivery_failures\``);
    await queryRunner.query(`DROP INDEX \`IDX_webhook_delivery_failures_delivery\` ON \`webhook_delivery_failures\``);
    await queryRunner.query(`DROP INDEX \`UQ_webhook_delivery_failures_terminal\` ON \`webhook_delivery_failures\``);
    await queryRunner.query(`DROP TABLE \`webhook_delivery_failures\``);
    await queryRunner.query(`DROP INDEX \`IDX_1e39479a7a8aa37eab08df013b\` ON \`lid_mappings\``);
    await queryRunner.query(`DROP TABLE \`lid_mappings\``);
    await queryRunner.query(`DROP INDEX \`IDX_1bb396e881628cd4dc8f0d2a8b\` ON \`baileys_stored_messages\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_baileys_stored_messages_session_created_id\` ON \`baileys_stored_messages\``,
    );
    await queryRunner.query(`DROP TABLE \`baileys_stored_messages\``);
    await queryRunner.query(`DROP INDEX \`IDX_ac984ccbd8b01af155e1874e8c\` ON \`sessions\``);
    await queryRunner.query(`DROP TABLE \`sessions\``);
    await queryRunner.query(`DROP TABLE \`chat_states\``);
  }
}
