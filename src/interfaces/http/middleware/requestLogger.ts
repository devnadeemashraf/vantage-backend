/**
 * HTTP Request Logger Middleware
 * Layer: Interfaces (HTTP)
 *
 * I log every request/response (method, URL, status, duration) via Pino’s
 * HTTP plugin, using the same logger as the rest of the app so format stays
 * consistent (JSON in prod, pretty in dev).
 */
import { logger } from '@core/logger';
import pinoHttp from 'pino-http';

export const requestLogger = pinoHttp({ logger });
