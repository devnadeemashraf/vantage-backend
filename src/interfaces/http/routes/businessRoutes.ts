/**
 * Business Routes
 * Layer: Interfaces (HTTP)
 *
 * Maps URL paths to controller methods for business-related operations.
 * These routes are mounted under `/api/v1/businesses` in app.ts, so:
 *
 *   GET /api/v1/businesses/search?q=plumbing&state=NSW  →  controller.search
 *   GET /api/v1/businesses/12345678901                  →  controller.findByAbn
 *
 * Routes are kept in separate files (one per resource) so each file stays
 * small and the route structure is easy to scan at a glance.
 */
import { Router } from 'express';
import { BusinessController } from '@interfaces/http/controllers/BusinessController';

const router = Router();
const controller = new BusinessController();

router.get('/search', controller.search);
router.get('/:abn', controller.findByAbn);

export { router as businessRoutes };
