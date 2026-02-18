/**
 * Business Entity — The Core Data Model
 * Layer: Domain
 *
 * This file defines two shapes for the same concept:
 *
 *   Business     — camelCase, used everywhere in the application code.
 *   BusinessRow  — snake_case, mirrors the exact column names in PostgreSQL.
 *
 * Why two interfaces for the same data?
 *   JavaScript/TypeScript convention is camelCase (abnStatus), but SQL convention
 *   is snake_case (abn_status). Keeping both lets us:
 *     - Write clean, idiomatic TypeScript in services and controllers.
 *     - Send properly-cased data to the database without manual renaming
 *       scattered across the codebase.
 *   The mapping between the two happens in exactly ONE place: the repository's
 *   `toDomain()` method (Infrastructure layer), keeping this entity pure.
 *
 * Key fields:
 *   - abn:          The 11-digit Australian Business Number — unique identifier.
 *   - entityName:   For companies: the registered company name.
 *                   For individuals: "GivenName FamilyName".
 *   - businessNames: An array of related trading/business names (1-to-many).
 *   - search_vector: (DB-only, not here) auto-maintained full-text index column.
 */
import type { BusinessName } from './BusinessName';

export interface Business {
  id?: number;
  abn: string;
  abnStatus: string;
  abnStatusFrom: Date | null;
  entityTypeCode: string;
  entityTypeText: string;
  entityName: string;
  givenName: string | null;
  familyName: string | null;
  state: string | null;
  postcode: string | null;
  gstStatus: string | null;
  gstFromDate: Date | null;
  acn: string | null;
  recordLastUpdated: Date | null;
  businessNames?: BusinessName[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BusinessRow {
  abn: string;
  abn_status: string;
  abn_status_from: Date | null;
  entity_type_code: string;
  entity_type_text: string;
  entity_name: string;
  given_name: string | null;
  family_name: string | null;
  state: string | null;
  postcode: string | null;
  gst_status: string | null;
  gst_from_date: Date | null;
  acn: string | null;
  record_last_updated: Date | null;
}
