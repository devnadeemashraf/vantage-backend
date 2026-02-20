/**
 * Business Entity — Core Data Model
 * Layer: Domain
 *
 * I define two shapes for the same concept: Business (camelCase) for app code
 * and BusinessRow (snake_case) for the database. That way we keep idiomatic
 * TypeScript everywhere and only do the casing conversion in one place — the
 * repository’s toDomain() in Infrastructure — so this file stays dependency-free.
 *
 * Main fields: abn (11-digit Australian Business Number, unique), entityName
 * (company name or "GivenName FamilyName" for individuals), businessNames
 * (1-to-many trading/legal names). The search_vector column lives only in the
 * DB and is maintained by a trigger; it’s not part of this entity.
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
