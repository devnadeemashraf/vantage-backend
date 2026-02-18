import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod/v4';
import { ValidationError } from '@shared/errors/AppError';

/**
 * Creates an Express middleware that validates request data against a Zod schema.
 *
 * @param schema - The Zod schema to validate against.
 * @param source - Which part of the request to validate ('query' | 'body' | 'params').
 *
 * On success, replaces req[source] with the parsed (and coerced) data.
 * On failure, throws a ValidationError which the errorHandler catches.
 */
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
