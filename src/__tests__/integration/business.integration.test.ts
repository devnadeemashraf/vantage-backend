/**
 * Integration Tests — Business Search & ABN Lookup Endpoints
 *
 * I hit the real Express stack (middleware → routes → controller → service)
 * but swap the repository for a mock in the DI container so we don’t need
 * PostgreSQL. I check status codes, response shape, and errors. The app is
 * created inside beforeAll after the container override so the mock is used.
 */
import { TOKENS } from '@core/types';
import type { IBusinessRepository } from '@domain/interfaces/IBusinessRepository';
import type { Express } from 'express';
import request from 'supertest';
import { container } from 'tsyringe';

import { sampleBusiness } from '../helpers/fixtures';
import { createMockRepository, MockBusinessRepository } from '../helpers/mockRepository';

let app: Express;
let mockRepo: MockBusinessRepository;

/** Register mock repo so tsyringe resolves it (last registration wins); then create app. */
beforeAll(async () => {
  await import('@core/container');

  mockRepo = createMockRepository();
  container.register<IBusinessRepository>(TOKENS.BusinessRepository, {
    useValue: mockRepo as unknown as IBusinessRepository,
  });

  const { createApp } = await import('@interfaces/http/app');
  app = createApp();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/v1/businesses/search', () => {
  it('should return 200 with paginated results and timing meta', async () => {
    const paginated = {
      data: [sampleBusiness],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      meta: { queryTimeMs: 5 },
    };
    mockRepo.searchNative.mockResolvedValue(paginated);
    mockRepo.searchOptimized.mockResolvedValue(paginated);

    const res = await request(app).get('/api/v1/businesses/search?q=vantage');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].abn).toBe('53004085616');
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.totalTimeMs).toBe('number');
    expect(typeof res.body.meta.queryTimeMs).toBe('number');
  });

  it('should use optimized strategy when technique=optimized', async () => {
    const paginated = {
      data: [sampleBusiness],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    mockRepo.searchOptimized.mockResolvedValue(paginated);

    const res = await request(app).get('/api/v1/businesses/search?q=vantage&technique=optimized');

    expect(res.status).toBe(200);
    expect(mockRepo.searchOptimized).toHaveBeenCalled();
  });

  it('should return an empty paginated array when no results match', async () => {
    mockRepo.searchNative.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      meta: { queryTimeMs: 2 },
    });

    const res = await request(app).get('/api/v1/businesses/search?q=xyznonexistent');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('should use findWithFilters when no search term is provided', async () => {
    mockRepo.findWithFilters.mockResolvedValue({
      data: [sampleBusiness],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      meta: { queryTimeMs: 4 },
    });

    const res = await request(app).get('/api/v1/businesses/search?state=NSW');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('should respect page and limit query params', async () => {
    mockRepo.searchNative.mockResolvedValue({
      data: [],
      pagination: { page: 2, limit: 5, total: 50, totalPages: 10 },
      meta: { queryTimeMs: 1 },
    });

    const res = await request(app).get('/api/v1/businesses/search?q=test&page=2&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(5);
  });

  it('should return JSON content type', async () => {
    mockRepo.searchNative.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      meta: { queryTimeMs: 0 },
    });

    const res = await request(app).get('/api/v1/businesses/search?q=test');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /api/v1/businesses/:abn', () => {
  it('should return 200 with the business and timing meta when ABN exists', async () => {
    mockRepo.findByAbn.mockResolvedValue({ business: sampleBusiness, queryTimeMs: 3 });

    const res = await request(app).get('/api/v1/businesses/53004085616');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.abn).toBe('53004085616');
    expect(res.body.data.entityName).toBe('VANTAGE SEARCH PTY LTD');
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.totalTimeMs).toBe('number');
    expect(typeof res.body.meta.queryTimeMs).toBe('number');
  });

  it('should return 404 when ABN does not exist', async () => {
    mockRepo.findByAbn.mockResolvedValue({ business: null, queryTimeMs: 1 });

    const res = await request(app).get('/api/v1/businesses/00000000000');

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('not found');
  });
});
