import pinoHttp from 'pino-http';
import { logger } from '@core/logger';

export const requestLogger = pinoHttp({ logger });
