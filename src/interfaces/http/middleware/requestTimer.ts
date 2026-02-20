/**
 * Request Timer Middleware
 * Layer: Interfaces (HTTP)
 *
 * Records the wall-clock timestamp at the moment a request enters the pipeline.
 * Controllers use this (via req.requestStartTime) to compute totalTimeMs —
 * the time from request arrival to response sent — and include it in API responses.
 *
 * MUST be registered as the first middleware in the stack so the measurement
 * starts as early as possible (before body parsing, logging, etc.).
 *
 * Uses Date.now() for millisecond precision; sufficient for displaying "42ms"
 * to end users. For sub-millisecond profiling, process.hrtime.bigint() could
 * be used instead.
 */
import type { NextFunction, Request, Response } from 'express';

export function requestTimer(req: Request, _res: Response, next: NextFunction): void {
  req.requestStartTime = Date.now();
  next();
}
