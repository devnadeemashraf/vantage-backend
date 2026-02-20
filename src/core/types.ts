/**
 * Dependency Injection Tokens
 * Layer: Core
 *
 * I use Symbol tokens so the container can match "when someone asks for X,
 * give them Y" without string collisions. Each service holds a token
 * (e.g. TOKENS.BusinessRepository) and gets the implementation registered
 * in container.ts.
 *
 * I use Symbols instead of strings so there’s no accidental clash with
 * another "Knex" in the codebase, and they don’t appear in JSON.stringify.
 * I group them by layer so it’s obvious what’s available at each level when
 * adding a new repo or service.
 */
export const TOKENS = {
  // Infrastructure — low-level tools the app needs to function
  Knex: Symbol.for('Knex'),
  Logger: Symbol.for('Logger'),

  // Repositories — data-access contracts
  BusinessRepository: Symbol.for('BusinessRepository'),

  // Services — application-level orchestrators
  SearchService: Symbol.for('SearchService'),
  IngestionService: Symbol.for('IngestionService'),

  // Strategies — swappable algorithm implementations
  SearchStrategy: Symbol.for('SearchStrategy'),
  TextToSqlEngine: Symbol.for('TextToSqlEngine'),
  SearchStrategyFactory: Symbol.for('SearchStrategyFactory'),

  // Adapters — data transformation bridges
  DataSourceAdapter: Symbol.for('DataSourceAdapter'),
} as const;
