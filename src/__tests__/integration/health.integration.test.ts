/**
 * Integration Tests — Health Endpoint
 *
 * I call GET /api/v1/health through the full Express stack with Supertest
 * (in-memory, no real port). I assert 200, JSON, and that we return status,
 * uptime, and timestamp. No DB dependency.
 */
import { createApp } from '@interfaces/http/app';
import request from 'supertest';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('should return 200 with status "ok"', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('should include an uptime value (number of seconds)', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should include a valid ISO 8601 timestamp', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.body.timestamp).toBeDefined();
    const parsed = new Date(res.body.timestamp);
    expect(parsed.toISOString()).toBe(res.body.timestamp);
  });

  it('should return JSON content type', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
