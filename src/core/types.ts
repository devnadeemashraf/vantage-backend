export const TOKENS = {
  // Infrastructure
  Knex: Symbol.for('Knex'),
  Logger: Symbol.for('Logger'),

  // Repositories
  BusinessRepository: Symbol.for('BusinessRepository'),

  // Services
  SearchService: Symbol.for('SearchService'),
  IngestionService: Symbol.for('IngestionService'),

  // Strategies
  SearchStrategy: Symbol.for('SearchStrategy'),
  TextToSqlEngine: Symbol.for('TextToSqlEngine'),

  // Adapters
  DataSourceAdapter: Symbol.for('DataSourceAdapter'),
} as const;
