/**
 * Unit Tests — SearchService
 *
 * The SearchService is the application-layer orchestrator that sits between
 * HTTP controllers and the search subsystem. It has two responsibilities:
 *
 *   1. search() — delegates to a strategy resolved by SearchStrategyFactory.
 *   2. findByAbn() — direct repository lookup; throws NotFoundError on miss.
 *
 * Testing approach:
 *   Both the repository AND the factory/strategy are mocked. We don't test
 *   whether PostgreSQL queries work (that's for integration tests) — we test
 *   that the service correctly wires delegation, passes arguments through,
 *   and handles the "not found" edge case.
 *
 *   The factory mock returns a mock strategy whose `execute()` we control,
 *   so each test can specify exactly what the "search algorithm" returns
 *   without needing any real implementation.
 */
import { SearchStrategyFactory } from '@application/factories/SearchStrategyFactory';
import { SearchService } from '@application/services/SearchService';
import type { ISearchStrategy } from '@domain/interfaces/ISearchStrategy';
import { NotFoundError } from '@shared/errors/AppError';

import { sampleBusiness, sampleFilterQuery, sampleSearchQuery } from '../helpers/fixtures';
import { createMockRepository, MockBusinessRepository } from '../helpers/mockRepository';

describe('SearchService', () => {
  let service: SearchService;
  let mockRepo: MockBusinessRepository;
  let mockFactory: jest.Mocked<SearchStrategyFactory>;
  let mockStrategy: jest.Mocked<ISearchStrategy>;

  beforeEach(() => {
    mockRepo = createMockRepository();

    mockStrategy = {
      execute: jest.fn(),
    };

    mockFactory = {
      create: jest.fn().mockReturnValue(mockStrategy),
    } as unknown as jest.Mocked<SearchStrategyFactory>;

    service = new SearchService(mockRepo, mockFactory);
  });

  describe('search()', () => {
    const paginatedResult = {
      data: [sampleBusiness],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    it('should delegate to the strategy returned by the factory', async () => {
      mockStrategy.execute.mockResolvedValue(paginatedResult);

      const result = await service.search(sampleSearchQuery);

      expect(mockFactory.create).toHaveBeenCalledWith('standard');
      expect(mockStrategy.execute).toHaveBeenCalledWith(sampleSearchQuery);
      expect(result).toEqual(paginatedResult);
    });

    it('should pass the query mode to the factory', async () => {
      mockStrategy.execute.mockResolvedValue(paginatedResult);

      await service.search(sampleFilterQuery);

      expect(mockFactory.create).toHaveBeenCalledWith('standard');
    });

    it('should default to "standard" mode when mode is undefined', async () => {
      const queryNoMode = { term: 'test', page: 1, limit: 10 };
      mockStrategy.execute.mockResolvedValue(paginatedResult);

      await service.search(queryNoMode);

      expect(mockFactory.create).toHaveBeenCalledWith('standard');
    });

    it('should propagate errors from the strategy', async () => {
      mockStrategy.execute.mockRejectedValue(new Error('DB timeout'));

      await expect(service.search(sampleSearchQuery)).rejects.toThrow('DB timeout');
    });
  });

  describe('findByAbn()', () => {
    it('should return the business and queryTimeMs when found', async () => {
      mockRepo.findByAbn.mockResolvedValue({ business: sampleBusiness, queryTimeMs: 3 });

      const result = await service.findByAbn('53004085616');

      expect(mockRepo.findByAbn).toHaveBeenCalledWith('53004085616');
      expect(result.business).toEqual(sampleBusiness);
      expect(result.queryTimeMs).toBe(3);
    });

    it('should throw NotFoundError when ABN does not exist', async () => {
      mockRepo.findByAbn.mockResolvedValue({ business: null, queryTimeMs: 1 });

      await expect(service.findByAbn('00000000000')).rejects.toThrow(NotFoundError);
      await expect(service.findByAbn('00000000000')).rejects.toThrow(
        'Business not found: 00000000000',
      );
    });
  });
});
