/**
 * Unit Tests — SearchStrategyFactory
 *
 * I check that the factory returns the right strategy (or throws) for each
 * mode/technique: ai → 501, optimized → OptimizedSearchStrategy, native →
 * NativeSearchStrategy, unknown → 400.
 */
import { SearchStrategyFactory } from '@application/factories/SearchStrategyFactory';
import { NativeSearchStrategy } from '@application/strategies/NativeSearchStrategy';
import { OptimizedSearchStrategy } from '@application/strategies/OptimizedSearchStrategy';
import { AppError } from '@shared/errors/AppError';
import type { SearchQuery } from '@shared/types';

import { createMockRepository } from '../helpers/mockRepository';

describe('SearchStrategyFactory', () => {
  let factory: SearchStrategyFactory;

  beforeEach(() => {
    const mockRepo = createMockRepository();
    factory = new SearchStrategyFactory(mockRepo);
  });

  describe('create()', () => {
    it('should return NativeSearchStrategy for technique "native"', () => {
      const query: SearchQuery = { term: 'test', page: 1, limit: 20, technique: 'native' };
      const strategy = factory.create(query);

      expect(strategy).toBeInstanceOf(NativeSearchStrategy);
    });

    it('should return NativeSearchStrategy when technique is undefined (default)', () => {
      const query: SearchQuery = { term: 'test', page: 1, limit: 20 };
      const strategy = factory.create(query);

      expect(strategy).toBeInstanceOf(NativeSearchStrategy);
    });

    it('should return OptimizedSearchStrategy for technique "optimized"', () => {
      const query: SearchQuery = { term: 'test', page: 1, limit: 20, technique: 'optimized' };
      const strategy = factory.create(query);

      expect(strategy).toBeInstanceOf(OptimizedSearchStrategy);
    });

    it('should throw a 501 AppError for mode "ai"', () => {
      const query: SearchQuery = { term: 'find plumbers', page: 1, limit: 20, mode: 'ai' };
      expect(() => factory.create(query)).toThrow(AppError);

      try {
        factory.create(query);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(501);
        expect((err as AppError).message).toContain('AI search');
      }
    });

    it('should throw a 400 AppError for an unknown technique', () => {
      const query = {
        term: 'test',
        page: 1,
        limit: 20,
        technique: 'quantum',
      } as unknown as SearchQuery;
      expect(() => factory.create(query)).toThrow(AppError);

      try {
        factory.create(query);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).message).toContain('Unknown search technique');
      }
    });
  });
});
