/**
 * Migration 002 — Create the `business_names` Table
 * Layer: Infrastructure (Database)
 *
 * One business can have many names (trading, DGR, etc.). business_id references
 * businesses(id) with ON DELETE CASCADE so names go when the business is
 * deleted. name_type uses ABR codes (TRD, BN, DGR). I index business_id for
 * fast JOINs when we load a business with its names (findByAbn).
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('business_names', (table) => {
    table.increments('id').primary();
    table
      .integer('business_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('businesses')
      .onDelete('CASCADE');
    table.string('name_type', 3).notNullable();
    table.string('name_text', 200).notNullable();

    table.timestamps(true, true);

    table.index('business_id', 'idx_business_names_business_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('business_names');
}
