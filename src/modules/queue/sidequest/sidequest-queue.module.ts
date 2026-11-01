import { Inject, Injectable, Module, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { Sidequest } from 'sidequest';
import { createLogger } from '../../../common/services/logger.service';
import { QUEUE_NAMES } from '../queue-names';
import { ingressWorkerConcurrency, webhookWorkerConcurrency } from '../redis-connection';
import { WebhookProcessor } from '../processors/webhook.processor';
import { IngressProcessor } from '../processors/ingress.processor';
import { Webhook } from '../../webhook/entities/webhook.entity';
import { WebhookOutboxModule } from '../../webhook/webhook-outbox.module';
import { WebhookDeliveryFailure } from '../../webhook/entities/webhook-delivery-failure.entity';
import { IntegrationDeliveryFailure } from '../../integration/entities/integration-delivery-failure.entity';
import { IngressEvent } from '../../integration/entities/ingress-event.entity';
import { HooksModule } from '../../../core/hooks/hooks.module';
import { PluginsModule } from '../../../core/plugins/plugins.module';
import {
  IngressSidequestJob,
  registerQueueProcessor,
  unregisterQueueProcessors,
  WebhookSidequestJob,
} from './sidequest-jobs';
import { SidequestQueueAdapter } from './sidequest-queue.adapter';

const logger = createLogger('SidequestQueue');

/** Finished jobs are kept a day, so a delivery's outcome stays readable to the outbox reconciler. */
export const SIDEQUEST_FINISHED_RETENTION_MS = 24 * 60 * 60 * 1000;

const SIDEQUEST_READY = Symbol('SIDEQUEST_READY');

interface Ready {
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function createReady(): Ready {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A failed start is reported by the lifecycle; queue calls awaiting it fail on their own, and callers fall back
  // to direct delivery as they do when Redis is down.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** Sidequest's MySQL-backend URL for the MariaDB data database. */
export function sidequestBackendUrl(config: ConfigService): string {
  const user = encodeURIComponent(config.get<string>('dataDatabase.username') ?? '');
  const password = encodeURIComponent(config.get<string>('dataDatabase.password') ?? '');
  const host = config.get<string>('dataDatabase.host') ?? 'localhost';
  const port = config.get<number>('dataDatabase.port') ?? 3306;
  const database = encodeURIComponent(config.get<string>('dataDatabase.name') ?? 'openwa');
  return `mysql://${user}:${password}@${host}:${port}/${database}`;
}

/**
 * Starts Sidequest once every module is initialized, so a job never reaches a processor whose own init has not run,
 * and stops it while the services the processors use are still up.
 */
@Injectable()
class SidequestLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    private readonly config: ConfigService,
    @Inject(SIDEQUEST_READY) private readonly ready: Ready,
    private readonly webhookProcessor: WebhookProcessor,
    private readonly ingressProcessor: IngressProcessor,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    registerQueueProcessor(QUEUE_NAMES.WEBHOOK, this.webhookProcessor);
    registerQueueProcessor(QUEUE_NAMES.INGRESS, this.ingressProcessor);
    try {
      await Sidequest.start({
        backend: { driver: '@sidequest/mysql-backend', config: sidequestBackendUrl(this.config) },
        queues: [
          { name: QUEUE_NAMES.WEBHOOK, concurrency: webhookWorkerConcurrency() },
          { name: QUEUE_NAMES.INGRESS, concurrency: ingressWorkerConcurrency() },
        ],
        // In this process and thread, so jobs reach the Nest-managed processors (see sidequest-jobs.ts).
        fork: false,
        runner: 'inline',
        // OpenWA owns the process signals and its shutdown order; onModuleDestroy below stops Sidequest.
        gracefulShutdown: false,
        dashboard: { enabled: false },
        logger: { level: 'warn' },
        cleanupFinishedJobsOlderThan: SIDEQUEST_FINISHED_RETENTION_MS,
        jobPollingInterval: 500,
      });
      this.ready.resolve();
      logger.log('Sidequest queue started on the MariaDB data database');
    } catch (error) {
      this.ready.reject(error);
      logger.error(
        `Sidequest failed to start; webhooks and ingress fall back to direct delivery: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await Sidequest.stop();
    } catch (error) {
      logger.warn(`Sidequest stop failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      unregisterQueueProcessors();
    }
  }
}

const adapterProvider = (queue: string, jobClass: typeof WebhookSidequestJob | typeof IngressSidequestJob) => ({
  provide: getQueueToken(queue),
  inject: [getDataSourceToken('data'), SIDEQUEST_READY],
  useFactory: (dataSource: DataSource, ready: Ready) =>
    new SidequestQueueAdapter(queue, jobClass, dataSource, ready.promise),
});

/**
 * QUEUE_ENABLED=true with QUEUE_DRIVER=sidequest (fork addition): the durable queue in the MariaDB data database,
 * no Redis. Registers the same queue tokens and processors as QueueModule; Bull Board is not mounted.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookDeliveryFailure, IntegrationDeliveryFailure, IngressEvent], 'data'),
    WebhookOutboxModule,
    HooksModule,
    PluginsModule,
  ],
  providers: [
    { provide: SIDEQUEST_READY, useFactory: createReady },
    adapterProvider(QUEUE_NAMES.WEBHOOK, WebhookSidequestJob),
    adapterProvider(QUEUE_NAMES.INGRESS, IngressSidequestJob),
    WebhookProcessor,
    IngressProcessor,
    SidequestLifecycle,
  ],
  exports: [getQueueToken(QUEUE_NAMES.WEBHOOK), getQueueToken(QUEUE_NAMES.INGRESS)],
})
export class SidequestQueueModule {}
