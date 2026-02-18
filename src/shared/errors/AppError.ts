/**
 * Custom Error Hierarchy
 * Layer: Shared
 *
 * Every app encounters two kinds of errors:
 *
 *   1. Operational errors — expected problems like "business not found" or
 *      "invalid ABN format". These are part of normal operation; we return
 *      a proper HTTP status (404, 400) and a friendly message to the client.
 *
 *   2. Programmer errors — unexpected bugs like null pointer dereferences or
 *      failed assertions. These get a generic 500 and are logged for debugging.
 *
 * The `isOperational` flag distinguishes the two. The global error handler
 * (errorHandler.ts) checks this flag to decide how to respond:
 *   - Operational: send the error's statusCode and message to the client.
 *   - Non-operational: send 500 "Internal server error" (never leak internals).
 *
 * Why `Object.setPrototypeOf(this, new.target.prototype)`?
 *   This is a TypeScript/ES2015 gotcha. When you `extends Error`, the prototype
 *   chain can break in some compilation targets, making `instanceof AppError`
 *   return false. This line manually fixes the chain so our error handler's
 *   `err instanceof AppError` check always works correctly.
 *
 * Subclasses (NotFoundError, ValidationError, ConflictError) are convenience
 * shortcuts so you never have to remember status codes — just throw the
 * right error type and the status is set automatically.
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
