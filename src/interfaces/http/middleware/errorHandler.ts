/**
 * Global Error Handler Middleware
 * Layer: Interfaces (HTTP)
 *
 * In Express, middleware forms an **assembly line**: each piece of middleware
 * processes the request and passes it to the next one. The error handler sits
 * at the very END of the line — it's the safety net that catches anything
 * that went wrong upstream.
 *
 * Express 5 improvement:
 *   In Express 4, you had to manually wrap every async route in try/catch
 *   and call next(err). Express 5 natively catches rejected promises from
 *   async handlers and funnels them here automatically. This eliminates an
 *   entire class of "unhandled rejection" bugs.
 *
 * The handler distinguishes two error types (see AppError.ts for details):
 *   - Operational (AppError): Expected failures like 404, 400. We log at
 *     "warn" level and return the error's statusCode + message to the client.
 *   - Programmer: Unexpected bugs. We log at "error" level and return a
 *     generic 500 — never leaking internal details to the client.
 *
 * Express recognizes this as an error handler because it has FOUR parameters
 * (err, req, res, next). If it had three, Express would treat it as regular
 * middleware and skip it for errors.
 */
import { logger } from '@core/logger';
import { AppError } from '@shared/errors/AppError';
import type { NextFunction, Request, Response } from 'express';
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn({ statusCode: err.statusCode, message: err.message }, 'Operational error');
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
}
