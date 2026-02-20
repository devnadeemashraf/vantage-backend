/**
 * Text-to-SQL Engine Interface — Future AI Search
 * Layer: Domain
 * Pattern: Strategy Pattern (for AI search)
 *
 * I added this as the contract for natural-language search: the engine
 * takes a phrase like "plumbing companies in Sydney" and returns SQL (or
 * a query our repo can run). isAvailable() lets us fall back to standard
 * search when the engine isn’t configured or is down. For now the app
 * returns 501 for mode=ai until we plug in a real implementation (e.g.
 * OpenAI, SQLCoder, or a rule-based parser).
 */
export interface ITextToSqlEngine {
  generateSql(naturalLanguageQuery: string): Promise<string>;
  isAvailable(): boolean;
}
