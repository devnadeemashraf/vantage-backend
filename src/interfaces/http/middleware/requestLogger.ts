/**
 * HTTP Request Logger Middleware
 * Layer: Interfaces (HTTP)
 *
 * Wraps Pino's HTTP plugin to automatically log every incoming request and
 * outgoing response. Each log line includes method, URL, status code, and
 * response time — invaluable for debugging slow endpoints or spotting
 * error patterns in production.
 *
 * It reuses the same Pino logger instance from core/logger.ts, so log
 * format (JSON in prod, pretty in dev) is consistent across the entire app.
 */
import { logger } from '@core/logger';
import pinoHttp from 'pino-http';

export const requestLogger = pinoHttp({ logger });
