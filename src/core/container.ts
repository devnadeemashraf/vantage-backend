import 'reflect-metadata';
import { container } from 'tsyringe';
import { TOKENS } from './types';
import { logger } from './logger';
import { getDbConnection } from '@infrastructure/database/connection';

container.register(TOKENS.Logger, { useValue: logger });
container.register(TOKENS.Knex, { useValue: getDbConnection() });

export { container };
