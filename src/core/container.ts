/**
 * Dependency Injection Container — Central Wiring
 * Layer: Core
 *
 * I wire every dependency here so the rest of the app never calls
 * `new PostgresBusinessRepository(...)` by hand. Each token (see types.ts)
 * is mapped to an implementation; when a class asks for e.g. TOKENS.Logger,
 * the container resolves and injects it.
 *
 * I use tsyringe with `reflect-metadata` imported first so decorators
 * (@inject, @injectable) can store constructor parameter metadata at runtime.
 * `useValue` is for singletons (logger, DB pool); `useClass` lets the
 * container construct the class and inject its dependencies when resolved.
 *
 * Keeping all registration in one file means swapping Postgres for something
 * else is a single-line change and every consumer gets the new implementation.
 */
import 'reflect-metadata';

import { SearchStrategyFactory } from '@application/factories/SearchStrategyFactory';
import { IngestionService } from '@application/services/IngestionService';
import { SearchService } from '@application/services/SearchService';
import { getDbConnection } from '@infrastructure/database/connection';
import { PostgresBusinessRepository } from '@infrastructure/repositories/PostgresBusinessRepository';
import { container } from 'tsyringe';

import { logger } from './logger';
import { TOKENS } from './types';

container.register(TOKENS.Logger, { useValue: logger });
container.register(TOKENS.Knex, { useValue: getDbConnection() });
container.register(TOKENS.BusinessRepository, { useClass: PostgresBusinessRepository });
container.register(TOKENS.SearchService, { useClass: SearchService });
container.register(TOKENS.IngestionService, { useClass: IngestionService });
container.register(TOKENS.SearchStrategyFactory, { useClass: SearchStrategyFactory });

export { container };
