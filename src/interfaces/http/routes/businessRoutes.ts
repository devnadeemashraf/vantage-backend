import { Router } from 'express';
import { BusinessController } from '@interfaces/http/controllers/BusinessController';

const router = Router();
const controller = new BusinessController();

router.get('/search', controller.search);
router.get('/:abn', controller.findByAbn);

export { router as businessRoutes };
