/**
 * Structured Logger (Pino)
 * Layer: Core
 *
 * I use Pino so every log line is a JSON object — easy to ship to Datadog,
 * Grafana, or ELK in production. In development I use pino-pretty so logs
 * are readable (colors, timestamps, less noise).
 *
 * I chose Pino over Winston mainly for performance: it defers serialisation
 * to a worker thread, which helps when we log every request on a busy API.
 * The exported `Logger` type lets services depend on "a logger" without
 * coupling to Pino, so tests can inject a mock.
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
