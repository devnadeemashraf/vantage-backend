/**
 * Global Error Handler Middleware
 * Layer: Interfaces (HTTP)
 *
 * I register this last so any error from routes above lands here. Express 5
 * forwards rejected promises from async handlers automatically, so we don’t
 * need try/catch in every route. AppError (operational) → I send its
 * statusCode and message and log at warn. Anything else → 500 and a generic
 * message so we never leak internals. Four parameters (err, req, res, next)
 * tell Express this is an error handler.
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
