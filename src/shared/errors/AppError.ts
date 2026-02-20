/**
 * Custom Error Hierarchy
 * Layer: Shared
 *
 * I split errors into operational (expected — 404, 400, etc.; we send
 * statusCode + message) and non-operational (bugs → 500, generic message).
 * The error handler uses instanceof AppError and isOperational to decide.
 * I use Object.setPrototypeOf(this, new.target.prototype) so instanceof
 * works after extending Error in all build targets. Subclasses are just
 * named status codes: NotFoundError, ValidationError, ConflictError.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}
