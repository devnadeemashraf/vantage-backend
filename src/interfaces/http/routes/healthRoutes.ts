/**
 * Health Check Route
 * Layer: Interfaces (HTTP)
 *
 * I expose GET /api/v1/health for liveness: returns status, uptime, timestamp.
 * Load balancers and orchestrators use this to see if the process is up. I
 * don’t ping the DB here — that would go in a separate readiness endpoint
 * if we needed it.
 */
import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export { router as healthRoutes };
