/**
 * Mock Repository Factory
 * Layer: Test Helpers
 *
 * Creates a mock IBusinessRepository where every method is a `jest.fn()`.
 * This is the test equivalent of a **stunt double** — it looks like the real
 * repository from the outside (same interface), but instead of hitting
 * PostgreSQL, it records every call and returns whatever you configure.
 *
 * Usage in a test:
 *   const repo = createMockRepository();
 *   repo.findByAbn.mockResolvedValue(sampleBusiness);
 *   // ... inject `repo` into the service under test
 *   expect(repo.findByAbn).toHaveBeenCalledWith('12345678901');
 *
 * Why a factory function instead of a plain object?
 *   Each test gets a fresh set of jest.fn() instances, so mock state
 *   (call counts, resolved values) never leaks between tests.
 */
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';

export type MockBusinessRepository = {
  [K in keyof IBusinessRepository]: jest.Mock;
};

export function createMockRepository(): MockBusinessRepository {
  return {
    bulkUpsert: jest.fn(),
    bulkInsertNames: jest.fn(),
    findByAbn: jest.fn(),
    search: jest.fn(),
    findWithFilters: jest.fn(),
    getIdsByAbns: jest.fn(),
  };
}
