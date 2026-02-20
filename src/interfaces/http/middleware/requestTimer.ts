/**
 * Request Timer Middleware
 * Layer: Interfaces (HTTP)
 *
 * I set req.requestStartTime when the request hits the stack so controllers
 * can compute totalTimeMs for the response. I’m registered first so the
 * measurement includes the full pipeline. Date.now() is enough for “42ms”
 * in API responses.
 */
import type { NextFunction, Request, Response } from 'express';

export function requestTimer(req: Request, _res: Response, next: NextFunction): void {
  req.requestStartTime = Date.now();
  next();
}
