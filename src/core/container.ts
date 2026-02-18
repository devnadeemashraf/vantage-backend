/**
 * Dependency Injection Container — The Central "Phone Book"
 * Layer: Core
 *
 * This is the single place where we wire together every dependency in the app.
 * Think of it as a **phone book**: each token (name badge) is mapped to a
 * concrete implementation so that when any class says "I need the Logger",
 * the container looks up the token and hands back the right object.
 *
 * How tsyringe works:
 *   - `reflect-metadata` must be imported first — it enables TypeScript
 *     decorators (@inject, @injectable) to store metadata about constructor
 *     parameters at runtime, which tsyringe reads to auto-resolve dependencies.
 *   - `useValue` registers a pre-built singleton (logger, DB pool).
 *   - `useClass` tells the container "construct this class when needed, injecting
 *     its own dependencies automatically" — transient by default (new instance
 *     per resolve), but since we register the class itself, tsyringe caches it.
 *
 * Why centralise here?
 *   No class ever does `new PostgresBusinessRepository(...)` by hand.
 *   If we swap Postgres for MongoDB tomorrow, we change ONE line here and
 *   every consumer gets the new implementation — that's the power of DI.
 */
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
