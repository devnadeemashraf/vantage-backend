/**
 * Text-to-SQL Engine Interface — Future AI Integration Point
 * Layer: Domain
 * Pattern: Strategy Pattern (for AI search)
 *
 * This interface is a placeholder for the upcoming natural language search
 * feature. When implemented, a user could type "plumbing companies in Sydney
 * registered after 2020" and the engine would translate that into a valid
 * SQL query against the businesses table.
 *
 * Possible implementations:
 *   - OpenAI GPT wrapper that generates SQL from a prompt + table schema.
 *   - A self-hosted model like SQLCoder fine-tuned on our schema.
 *   - A rule-based parser for common query patterns (no LLM needed).
 *
 * `isAvailable()` lets the app gracefully degrade — if the AI engine is
 * down or not configured, the SearchStrategyFactory can fall back to
 * standard search instead of returning a 500.
 *
 * The stub implementation (to be added in Commit 13) will throw 501
 * "Not Implemented" until a real engine is wired in.
 */
export interface ITextToSqlEngine {
  generateSql(naturalLanguageQuery: string): Promise<string>;
  isAvailable(): boolean;
}
