/**
 * XML Data Source Adapter — ABR XML → Business Entity Transformer
 * Layer: Workers (ETL)
 * Pattern: Adapter Pattern (implements IDataSourceAdapter<RawAbrRecord>)
 *
 * This file contains two things:
 *
 *   1. RawAbrRecord: An intermediate "bucket" that the SAX parser fills
 *      event-by-event as it reads through the XML. Think of it as a
 *      **clipboard** — the parser jots down each field as it encounters
 *      it, and once the full <ABR> block is closed, the record is complete.
 *
 *   2. XmlDataSourceAdapter: Transforms that raw bucket into a clean
 *      Business domain entity. The key logic is handling the ABR's two
 *      entity types:
 *        - IND (Individual/Sole Trader): name = "GivenName FamilyName"
 *        - Non-IND (Company, Trust, etc.): name = the NonIndividualNameText
 *
 * ABR Date Format:
 *   The ABR uses 8-digit date strings like "20240605" (YYYYMMDD).
 *   The sentinel value "19000101" means "not applicable" — the parseAbrDate
 *   helper converts these to null instead of a meaningless 1900 date.
 *
 * The `createEmptyRawRecord()` factory resets the clipboard for each new
 * <ABR> element the parser encounters.
 */
import type { Business } from '@domain/entities/Business';
import type { BusinessName } from '@domain/entities/BusinessName';
import type { IDataSourceAdapter } from '@domain/interfaces/IDataSourceAdapter';

/**
 * Raw intermediate representation of an ABR XML record.
 * Populated by the SAX parser event-by-event, then normalized
 * into a Business domain entity by the adapter.
 */
export interface RawAbrRecord {
  recordLastUpdatedDate: string;
  abn: string;
  abnStatus: string;
  abnStatusFromDate: string;
  entityTypeInd: string;
  entityTypeText: string;
  // MainEntity (non-individual)
  mainEntityName: string | null;
  // LegalEntity (individual)
  givenNames: string[];
  familyName: string | null;
  // Address (shared path between MainEntity and LegalEntity)
  state: string | null;
  postcode: string | null;
  // GST
  gstStatus: string | null;
  gstFromDate: string | null;
  // ASIC
  acn: string | null;
  // OtherEntity + DGR names (1-to-many)
  otherNames: { type: string; text: string }[];
}

export function createEmptyRawRecord(): RawAbrRecord {
  return {
    recordLastUpdatedDate: '',
    abn: '',
    abnStatus: '',
    abnStatusFromDate: '',
    entityTypeInd: '',
    entityTypeText: '',
    mainEntityName: null,
    givenNames: [],
    familyName: null,
    state: null,
    postcode: null,
    gstStatus: null,
    gstFromDate: null,
    acn: null,
    otherNames: [],
  };
}

/**
 * Normalizes a raw SAX-parsed ABR record into our Business domain entity.
 * Handles the IND (individual) vs non-individual branching:
 * - Individuals get entity_name = "GIVEN1 GIVEN2 FAMILYNAME"
 * - Non-individuals get entity_name = NonIndividualNameText
 */
export class XmlDataSourceAdapter implements IDataSourceAdapter<RawAbrRecord> {
  normalize(raw: RawAbrRecord): Business {
    const isIndividual = raw.entityTypeInd === 'IND';

    let entityName: string;
    let givenName: string | null = null;
    let familyName: string | null = null;

    if (isIndividual) {
      givenName = raw.givenNames.join(' ') || null;
      familyName = raw.familyName;
      entityName = [givenName, familyName].filter(Boolean).join(' ');
    } else {
      entityName = raw.mainEntityName || 'Unknown Entity';
    }

    const businessNames: BusinessName[] = raw.otherNames.map((n) => ({
      nameType: n.type,
      nameText: n.text,
    }));

    return {
      abn: raw.abn,
      abnStatus: raw.abnStatus,
      abnStatusFrom: parseAbrDate(raw.abnStatusFromDate),
      entityTypeCode: raw.entityTypeInd,
      entityTypeText: raw.entityTypeText,
      entityName,
      givenName,
      familyName,
      state: raw.state,
      postcode: raw.postcode,
      gstStatus: raw.gstStatus,
      gstFromDate: parseAbrDate(raw.gstFromDate),
      acn: raw.acn,
      recordLastUpdated: parseAbrDate(raw.recordLastUpdatedDate),
      businessNames,
    };
  }
}

/**
 * ABR dates are yyyymmdd integers (e.g. "20240605").
 * The sentinel value "19000101" means "not applicable".
 */
function parseAbrDate(value: string | null | undefined): Date | null {
  if (!value || value.length !== 8 || value === '19000101') return null;
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  return new Date(`${year}-${month}-${day}`);
}
