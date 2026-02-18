import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@shared/errors/AppError';
import { logger } from '@core/logger';

/**
 * Express 5 global error handler.
 *
 * Express 5 automatically catches rejected promises from async middleware
 * and calls next(err). This handler distinguishes operational errors
 * (AppError with isOperational=true) from programmer errors.
 */
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
