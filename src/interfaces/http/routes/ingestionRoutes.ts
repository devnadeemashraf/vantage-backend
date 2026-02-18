import { Router } from 'express';
import { IngestionController } from '@interfaces/http/controllers/IngestionController';

const router = Router();
const controller = new IngestionController();

router.post('/ingest', controller.ingest);

export { router as ingestionRoutes };
