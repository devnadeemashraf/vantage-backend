/**
 * Test Fixtures — Reusable Sample Data
 * Layer: Test Helpers
 *
 * I keep shared test data here so we don’t repeat the same objects in every
 * test. sample* = one complete object; dates are fixed for determinism.
 * ABNs and names are realistic but fake (e.g. 53004085616 is the ATO’s real
 * ABN, useful for manual checks).
 */
import type { Business } from '@domain/entities/Business';
import type { SearchQuery } from '@shared/types';
import type { RawAbrRecord } from '@workers/etl/XmlDataSourceAdapter';

/** A complete Business entity representing a non-individual (company). */
export const sampleBusiness: Business = {
  id: 1,
  abn: '53004085616',
  abnStatus: 'ACT',
  abnStatusFrom: new Date('2000-07-01'),
  entityTypeCode: 'PRV',
  entityTypeText: 'Australian Private Company',
  entityName: 'VANTAGE SEARCH PTY LTD',
  givenName: null,
  familyName: null,
  state: 'NSW',
  postcode: '2000',
  gstStatus: 'ACT',
  gstFromDate: new Date('2000-07-01'),
  acn: '004085616',
  recordLastUpdated: new Date('2024-06-05'),
  businessNames: [
    { nameType: 'TRD', nameText: 'VANTAGE DIRECTORY' },
    { nameType: 'BN', nameText: 'VANTAGE SEARCH' },
  ],
};

/** A complete Business entity representing an individual/sole trader. */
export const sampleIndividualBusiness: Business = {
  id: 2,
  abn: '11223344556',
  abnStatus: 'ACT',
  abnStatusFrom: new Date('2015-03-12'),
  entityTypeCode: 'IND',
  entityTypeText: 'Individual/Sole Trader',
  entityName: 'JANE DOE',
  givenName: 'JANE',
  familyName: 'DOE',
  state: 'VIC',
  postcode: '3000',
  gstStatus: 'ACT',
  gstFromDate: new Date('2015-03-12'),
  acn: null,
  recordLastUpdated: new Date('2024-01-15'),
  businessNames: [],
};

/**
 * A raw ABR XML record for a non-individual entity, as the SAX parser would
 * produce before the XmlDataSourceAdapter normalizes it.
 */
export const sampleRawAbrRecord: RawAbrRecord = {
  recordLastUpdatedDate: '20240605',
  abn: '53004085616',
  abnStatus: 'ACT',
  abnStatusFromDate: '20000701',
  entityTypeInd: 'PRV',
  entityTypeText: 'Australian Private Company',
  mainEntityName: 'VANTAGE SEARCH PTY LTD',
  givenNames: [],
  familyName: null,
  state: 'NSW',
  postcode: '2000',
  gstStatus: 'ACT',
  gstFromDate: '20000701',
  acn: '004085616',
  otherNames: [
    { type: 'TRD', text: 'VANTAGE DIRECTORY' },
    { type: 'BN', text: 'VANTAGE SEARCH' },
  ],
};

/**
 * A raw ABR record for an individual (sole trader).
 * The adapter should join givenNames + familyName into entityName.
 */
export const sampleRawIndividualRecord: RawAbrRecord = {
  recordLastUpdatedDate: '20240115',
  abn: '11223344556',
  abnStatus: 'ACT',
  abnStatusFromDate: '20150312',
  entityTypeInd: 'IND',
  entityTypeText: 'Individual/Sole Trader',
  mainEntityName: null,
  givenNames: ['JANE'],
  familyName: 'DOE',
  state: 'VIC',
  postcode: '3000',
  gstStatus: 'ACT',
  gstFromDate: '20150312',
  acn: null,
  otherNames: [],
};

/**
 * A raw ABR record with the sentinel date '19000101' which the adapter
 * should convert to null rather than a meaningless Date(1900, 0, 1).
 */
export const sampleRawRecordWithSentinelDate: RawAbrRecord = {
  recordLastUpdatedDate: '19000101',
  abn: '99887766554',
  abnStatus: 'CAN',
  abnStatusFromDate: '19000101',
  entityTypeInd: 'PRV',
  entityTypeText: 'Australian Private Company',
  mainEntityName: 'SENTINEL CO',
  givenNames: [],
  familyName: null,
  state: null,
  postcode: null,
  gstStatus: null,
  gstFromDate: '19000101',
  acn: null,
  otherNames: [],
};

/** A standard paginated search query (technique=native). */
export const sampleSearchQuery: SearchQuery = {
  term: 'plumbing',
  page: 1,
  limit: 20,
  mode: 'standard',
  technique: 'native',
};

/** A search query requesting AI mode (should throw 501 via the factory). */
export const sampleAiSearchQuery: SearchQuery = {
  term: 'find me all active plumbers in Sydney',
  page: 1,
  limit: 20,
  mode: 'ai',
};

/** A filter-only query (no search term, just state + status filters). */
export const sampleFilterQuery: SearchQuery = {
  state: 'NSW',
  abnStatus: 'ACT',
  page: 1,
  limit: 10,
};
