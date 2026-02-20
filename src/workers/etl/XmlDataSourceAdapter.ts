/**
 * XML Data Source Adapter — ABR XML → Business Entity
 * Layer: Workers (ETL)
 * Pattern: Adapter Pattern (implements IDataSourceAdapter<RawAbrRecord>)
 *
 * RawAbrRecord is the bucket the SAX parser fills per <ABR> block; when the
 * block closes we pass it to normalize() and get a Business. I handle two
 * ABR entity types: IND (individual) → entityName = "GivenName FamilyName";
 * non-IND → entityName = mainEntityName. ABR dates are YYYYMMDD; "19000101"
 * means not applicable so I map it to null. createEmptyRawRecord() resets
 * the bucket for each new record.
 */
import type { Business } from '@domain/entities/Business';
import type { BusinessName } from '@domain/entities/BusinessName';
import type { IDataSourceAdapter } from '@domain/interfaces/IDataSourceAdapter';

/** Raw ABR record as filled by the SAX parser; adapter normalizes it to Business. */
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

/** IND → entityName = given + family; non-IND → entityName = mainEntityName. */
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

/** ABR uses YYYYMMDD; "19000101" means not applicable → null. */
function parseAbrDate(value: string | null | undefined): Date | null {
  if (!value || value.length !== 8 || value === '19000101') return null;
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  return new Date(`${year}-${month}-${day}`);
}
