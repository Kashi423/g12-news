import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import cron from "node-cron";

export interface Scheduler {
  kind: "bullmq" | "cron";
  stop(): Promise<void>;
}

export interface SchedulerOptions {
  intervalMinutes: number;
  /** When set, ingestion is scheduled as a BullMQ repeatable job; otherwise node-cron runs it in-process. */
  redisUrl?: string;
  run: () => Promise<void>;
  log: (line: string) => void;
}

const QUEUE_NAME = "g12-ingestion";
const SCHEDULER_ID = "ingest-feeds";

async function startBullMq({ intervalMinutes, redisUrl, run, log }: SchedulerOptions & { redisUrl: string }): Promise<Scheduler> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  connection.on("error", () => undefined); // failures surface via the ping below and BullMQ's own events

  try {
    await connection.connect();
    await connection.ping();
  } catch (error) {
    connection.disconnect();
    throw new Error(`Cannot reach Redis at ${redisUrl.replace(/\/\/[^@]*@/, "//***@")}: ${error instanceof Error ? error.message : error}`);
  }

  const queue = new Queue(QUEUE_NAME, { connection });
  // A repeatable job that survives restarts; upserting keeps exactly one schedule even if the interval changes.
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: intervalMinutes * 60_000 }, { name: "ingest", opts: { removeOnComplete: 20, removeOnFail: 100 } });
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      await run();
    },
    { connection, concurrency: 1 },
  );
  worker.on("failed", (job, error) => log(`[scheduler] job ${job?.id ?? "?"} failed: ${error.message}`));

  return {
    kind: "bullmq",
    async stop() {
      await worker.close();
      await queue.close();
      connection.disconnect();
    },
  };
}

function startCron({ intervalMinutes, run, log }: SchedulerOptions): Scheduler {
  const expression = intervalMinutes >= 60 ? "0 * * * *" : `*/${intervalMinutes} * * * *`;
  const task = cron.schedule(
    expression,
    async () => {
      try {
        await run();
      } catch (error) {
        log(`[scheduler] run failed: ${error instanceof Error ? error.message : error}`);
      }
    },
    { name: "g12-ingestion", noOverlap: true },
  );
  return {
    kind: "cron",
    async stop() {
      await task.destroy();
    },
  };
}

/** BullMQ when REDIS_URL is provided (durable, no overlap across instances), node-cron otherwise. */
export async function startScheduler(options: SchedulerOptions): Promise<Scheduler> {
  return options.redisUrl ? startBullMq({ ...options, redisUrl: options.redisUrl }) : startCron(options);
}
