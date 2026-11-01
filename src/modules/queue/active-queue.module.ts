import type { Type } from '@nestjs/common';

/**
 * The queue module QUEUE_ENABLED=true loads (fork addition): BullMQ on Redis by default, Sidequest on the MariaDB
 * data database with QUEUE_DRIVER=sidequest. Both register the same queue tokens and processors. Required lazily,
 * like the module it replaces, so a deployment loads only the queue library it uses.
 */
export const QueueModule: Type =
  process.env.QUEUE_DRIVER === 'sidequest'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./sidequest/sidequest-queue.module') as { SidequestQueueModule: Type }).SidequestQueueModule
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('./queue.module') as { QueueModule: Type }).QueueModule;
