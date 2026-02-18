/**
 * Search Strategy Interface
 * Layer: Domain
 * Pattern: Strategy Pattern
 *
 * The Strategy Pattern lets you swap algorithms at runtime without changing
 * the code that uses them. Imagine a GPS app: you choose "fastest route" or
 * "shortest route" — the navigation screen (consumer) doesn't change, only
 * the routing algorithm (strategy) behind it does.
 *
 * In Vantage, we currently have one strategy:
 *   - StandardSearchStrategy: full-text + fuzzy search via PostgreSQL.
 *
 * When the AI engine is wired in, a second strategy (AiSearchStrategy) will
 * translate natural language into SQL. The SearchService picks which strategy
 * to use based on the `mode` field in the search request ('standard' | 'ai').
 *
 * Every strategy implements this single `execute()` method, so the rest of
 * the app never has to know which algorithm is running under the hood.
 */
import type { Business } from '@domain/entities/Business';
import type { PaginatedResult, SearchQuery } from '@shared/types';

export interface ISearchStrategy {
  execute(query: SearchQuery): Promise<PaginatedResult<Business>>;
}
