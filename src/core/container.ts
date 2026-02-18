import 'reflect-metadata';
import { container } from 'tsyringe';

import { TOKENS } from './types';
import { logger } from './logger';

import { getDbConnection } from '@infrastructure/database/connection';
import { PostgresBusinessRepository } from '@infrastructure/repositories/PostgresBusinessRepository';

container.register(TOKENS.Logger, { useValue: logger });
container.register(TOKENS.Knex, { useValue: getDbConnection() });
container.register(TOKENS.BusinessRepository, { useClass: PostgresBusinessRepository });

export { container };
