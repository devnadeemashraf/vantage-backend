/**
 * Express Request Augmentation
 * Layer: Shared (type declarations)
 *
 * I extend Express Request with requestStartTime so the requestTimer
 * middleware can record when the request entered the pipeline and
 * controllers can compute totalTimeMs for responses.
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
