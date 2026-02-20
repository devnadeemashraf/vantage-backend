/**
 * Express Request Augmentation
 * Layer: Shared (type declarations)
 *
 * Extends the Express Request interface with application-specific properties.
 * The requestTimer middleware sets requestStartTime at the very beginning
 * of the request pipeline so controllers can compute total elapsed time.
 */
declare global {
  namespace Express {
    interface Request {
      /** Set by requestTimer middleware; used to compute totalTimeMs in responses. */
      requestStartTime?: number;
    }
  }
}

export {};
