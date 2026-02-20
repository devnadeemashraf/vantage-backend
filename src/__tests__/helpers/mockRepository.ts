/**
 * Mock Repository Factory
 * Layer: Test Helpers
 *
 * I return an IBusinessRepository-shaped object with every method as jest.fn(),
 * so tests can control return values and assert call args without a real DB.
 * I’m a factory so each test gets fresh mocks and no state leaks.
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
    searchNative: jest.fn(),
    searchOptimized: jest.fn(),
    findWithFilters: jest.fn(),
    getIdsByAbns: jest.fn(),
  };
}
