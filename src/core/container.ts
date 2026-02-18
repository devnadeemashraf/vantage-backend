import 'reflect-metadata';
import { container } from 'tsyringe';

import { TOKENS } from './types';
import { logger } from './logger';

import { getDbConnection } from '@infrastructure/database/connection';
import { PostgresBusinessRepository } from '@infrastructure/repositories/PostgresBusinessRepository';
import { SearchService } from '@application/services/SearchService';
import { IngestionService } from '@application/services/IngestionService';

container.register(TOKENS.Logger, { useValue: logger });
container.register(TOKENS.Knex, { useValue: getDbConnection() });
container.register(TOKENS.BusinessRepository, { useClass: PostgresBusinessRepository });
container.register(TOKENS.SearchService, { useClass: SearchService });
container.register(TOKENS.IngestionService, { useClass: IngestionService });

export { container };
