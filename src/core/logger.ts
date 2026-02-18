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
