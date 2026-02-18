import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable the pg_trgm extension for fuzzy/trigram similarity search.
  // pg_trgm decomposes strings into 3-character substrings (trigrams).
  // "Plumbing" -> {" Pl","Plu","lum","umb","mbi","bin","ing","ng "}
  // A misspelling like "Plumbng" shares most trigrams, enabling fuzzy matching.
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  // GIN index on entity_name using trigram ops.
  // GIN (Generalized Inverted Index) builds an inverted map: trigram -> row IDs.
  // Enables the similarity() function and the % operator for fuzzy search.
  await knex.raw(`
    CREATE INDEX idx_businesses_entity_name_trgm
    ON businesses USING GIN (entity_name gin_trgm_ops)
  `);

  // GIN index on the tsvector column for full-text search.
  // tsvector stores pre-parsed lexemes; the GIN index makes @@ (match) queries O(1)-ish.
  await knex.raw(`
    CREATE INDEX idx_businesses_search_vector
    ON businesses USING GIN (search_vector)
  `);

  // Auto-maintain search_vector on INSERT or UPDATE.
  // The trigger concatenates entity_name (weight A = highest relevance)
  // with state and postcode (weight C = lower relevance) into the tsvector.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION businesses_search_vector_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.entity_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.given_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.family_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.state, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.postcode, '')), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER trg_businesses_search_vector
    BEFORE INSERT OR UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION businesses_search_vector_trigger()
  `);

  // GIN trigram index on business_names.name_text for fuzzy search on trading/business names.
  await knex.raw(`
    CREATE INDEX idx_business_names_name_text_trgm
    ON business_names USING GIN (name_text gin_trgm_ops)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS trg_businesses_search_vector ON businesses');
  await knex.raw('DROP FUNCTION IF EXISTS businesses_search_vector_trigger()');
  await knex.raw('DROP INDEX IF EXISTS idx_business_names_name_text_trgm');
  await knex.raw('DROP INDEX IF EXISTS idx_businesses_search_vector');
  await knex.raw('DROP INDEX IF EXISTS idx_businesses_entity_name_trgm');
  await knex.raw('DROP EXTENSION IF EXISTS pg_trgm');
}
