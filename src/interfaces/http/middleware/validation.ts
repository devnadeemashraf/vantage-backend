/**
 * Request Validation Middleware Factory
 * Layer: Interfaces (HTTP)
 *
 * This middleware acts as a **bouncer at a club**: before a request reaches
 * the controller, the bouncer checks its ID (data) against the guest list
 * (Zod schema). If the data is valid, the request proceeds; if not, it gets
 * turned away with a clear explanation of what was wrong.
 *
 * It's a "factory" because `validate(schema, source)` returns a NEW middleware
 * function — one tailored to a specific schema and request part. This lets
 * you reuse the same pattern across many routes:
 *
 *   router.get('/search', validate(searchQuerySchema, 'query'), controller.search);
 *   router.post('/ingest', validate(ingestBodySchema, 'body'), controller.ingest);
 *
 * On success: replaces `req[source]` with the Zod-parsed data, which means
 * type coercions (string "5" → number 5) are applied and the controller
 * receives clean, typed data.
 *
 * On failure: throws a ValidationError (400) which the global error handler
 * catches and returns to the client. The controller is never reached.
 */
import { ValidationError } from '@shared/errors/AppError';
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod/v4';

export function validate<T extends z.ZodType>(schema: T, source: 'query' | 'body' | 'params') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join('; ');
      throw new ValidationError(messages);
    }

    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}
