/**
 * Abstraction layer for natural language -> SQL translation.
 * Implementations can wrap SQLCoder, OpenAI, or any other LLM.
 * The stub implementation will throw 501 until a real engine is wired in.
 */
export interface ITextToSqlEngine {
  generateSql(naturalLanguageQuery: string): Promise<string>;
  isAvailable(): boolean;
}
