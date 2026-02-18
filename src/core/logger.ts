/**
 * Structured Logger (Pino)
 * Layer: Core
 *
 * Pino is a high-performance JSON logger — it outputs one JSON object per log
 * line, which makes logs machine-parseable by tools like Datadog, Grafana, or
 * the ELK stack in production.
 *
 * In development, raw JSON is hard to read, so we pipe it through `pino-pretty`
 * which adds colors, readable timestamps, and strips noisy fields like pid.
 *
 * Why Pino over Winston?
 *   Pino is ~5x faster because it defers string serialisation to a separate
 *   worker thread (pino.destination). For a high-throughput search API that
 *   logs every request, this matters.
 *
 * The exported `Logger` type lets other modules declare "I need a logger"
 * without coupling to Pino directly — useful for testing with a mock logger.
 */
import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.log.level,
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export type Logger = pino.Logger;
