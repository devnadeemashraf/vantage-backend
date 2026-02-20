/**
 * Business Routes
 * Layer: Interfaces (HTTP)
 *
 * I mount these under /api/v1/businesses: GET /search and GET /:abn map to
 * the business controller. One file per resource keeps the route map easy to scan.
 */
import { BusinessController } from '@interfaces/http/controllers/BusinessController';
import { Router } from 'express';

const router = Router();
const controller = new BusinessController();

router.get('/search', controller.search);
router.get('/:abn', controller.findByAbn);

export { router as businessRoutes };
