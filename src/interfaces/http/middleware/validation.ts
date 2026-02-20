/**
 * Request Validation Middleware Factory
 * Layer: Interfaces (HTTP)
 *
 * I use validate(schema, source) to get a middleware that checks req.query,
 * req.body, or req.params against a Zod schema. Valid data replaces req[source]
 * with parsed/coerced values so the controller gets typed input; invalid →
 * ValidationError (400) and the error handler responds. One pattern for all
 * routes that need validation.
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
