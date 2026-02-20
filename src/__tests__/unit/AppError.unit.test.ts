/**
 * Unit Tests — AppError Hierarchy
 *
 * I lock down status codes, isOperational, and instanceof so the error
 * handler can reliably tell operational errors from programmer errors.
 * Without these, a broken prototype chain could turn 404s into 500s.
 */
import { AppError, ConflictError, NotFoundError, ValidationError } from '@shared/errors/AppError';

describe('AppError', () => {
  it('should set message and default statusCode to 500', () => {
    const error = new AppError('something broke');

    expect(error.message).toBe('something broke');
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
  });

  it('should accept a custom statusCode', () => {
    const error = new AppError('rate limited', 429);

    expect(error.statusCode).toBe(429);
    expect(error.isOperational).toBe(true);
  });

  it('should allow marking an error as non-operational', () => {
    const error = new AppError('fatal crash', 500, false);

    expect(error.isOperational).toBe(false);
  });

  it('should be an instance of both Error and AppError', () => {
    const error = new AppError('test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it('should capture a stack trace', () => {
    const error = new AppError('traced');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('AppError');
  });
});

describe('NotFoundError', () => {
  it('should set statusCode to 404 and format the message', () => {
    const error = new NotFoundError('Business', '12345678901');

    expect(error.message).toBe('Business not found: 12345678901');
    expect(error.statusCode).toBe(404);
    expect(error.isOperational).toBe(true);
  });

  it('should be an instance of both AppError and NotFoundError', () => {
    const error = new NotFoundError('Business', 'abc');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(NotFoundError);
  });
});

describe('ValidationError', () => {
  it('should set statusCode to 400', () => {
    const error = new ValidationError('ABN must be 11 digits');

    expect(error.message).toBe('ABN must be 11 digits');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
  });

  it('should be an instance of AppError', () => {
    const error = new ValidationError('bad input');

    expect(error).toBeInstanceOf(AppError);
  });
});

describe('ConflictError', () => {
  it('should set statusCode to 409', () => {
    const error = new ConflictError('ABN already exists');

    expect(error.message).toBe('ABN already exists');
    expect(error.statusCode).toBe(409);
    expect(error.isOperational).toBe(true);
  });

  it('should be an instance of AppError', () => {
    const error = new ConflictError('duplicate');

    expect(error).toBeInstanceOf(AppError);
  });
});
