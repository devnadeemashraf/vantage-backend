/**
 * Dependency Injection Tokens
 * Layer: Core
 *
 * In our DI system (tsyringe), every injectable dependency needs a unique
 * identifier so the container knows "when someone asks for X, give them Y."
 *
 * Think of these tokens as **name badges at a conference**. When a service says
 * "I need the BusinessRepository", it holds up the TOKENS.BusinessRepository
 * badge, and the DI container matches it to the registered implementation
 * (PostgresBusinessRepository).
 *
 * Why Symbols instead of plain strings?
 *   Symbols are guaranteed unique — even `Symbol.for('Knex') === Symbol.for('Knex')`
 *   is true (global registry), but no accidental collision with a random string
 *   "Knex" elsewhere in the codebase. They also don't show up in JSON.stringify,
 *   keeping serialised output clean.
 *
 * Why are they grouped by architectural layer?
 *   So you can quickly scan which dependencies exist at each level. If you
 *   add a new repository or service, you register its token here first.
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
