/**
 * Unit Tests — XmlDataSourceAdapter
 *
 * I verify the adapter turns raw ABR records into Business entities: IND
 * → entityName from givenNames + familyName; non-IND → mainEntityName;
 * dates YYYYMMDD and "19000101" → null; otherNames → businessNames.
 */
import { XmlDataSourceAdapter } from '@workers/etl/XmlDataSourceAdapter';

import {
  sampleRawAbrRecord,
  sampleRawIndividualRecord,
  sampleRawRecordWithSentinelDate,
} from '../helpers/fixtures';

describe('XmlDataSourceAdapter', () => {
  let adapter: XmlDataSourceAdapter;

  beforeEach(() => {
    adapter = new XmlDataSourceAdapter();
  });

  describe('normalize() — non-individual entity', () => {
    it('should use mainEntityName as the entityName', () => {
      const result = adapter.normalize(sampleRawAbrRecord);

      expect(result.entityName).toBe('VANTAGE SEARCH PTY LTD');
    });

    it('should set givenName and familyName to null for non-individuals', () => {
      const result = adapter.normalize(sampleRawAbrRecord);

      expect(result.givenName).toBeNull();
      expect(result.familyName).toBeNull();
    });

    it('should parse valid ABR dates into Date objects', () => {
      const result = adapter.normalize(sampleRawAbrRecord);

      expect(result.abnStatusFrom).toEqual(new Date('2000-07-01'));
      expect(result.gstFromDate).toEqual(new Date('2000-07-01'));
      expect(result.recordLastUpdated).toEqual(new Date('2024-06-05'));
    });

    it('should map otherNames to businessNames array', () => {
      const result = adapter.normalize(sampleRawAbrRecord);

      expect(result.businessNames).toHaveLength(2);
      expect(result.businessNames).toEqual([
        { nameType: 'TRD', nameText: 'VANTAGE DIRECTORY' },
        { nameType: 'BN', nameText: 'VANTAGE SEARCH' },
      ]);
    });

    it('should carry through all scalar fields unchanged', () => {
      const result = adapter.normalize(sampleRawAbrRecord);

      expect(result.abn).toBe('53004085616');
      expect(result.abnStatus).toBe('ACT');
      expect(result.entityTypeCode).toBe('PRV');
      expect(result.entityTypeText).toBe('Australian Private Company');
      expect(result.state).toBe('NSW');
      expect(result.postcode).toBe('2000');
      expect(result.gstStatus).toBe('ACT');
      expect(result.acn).toBe('004085616');
    });
  });

  describe('normalize() — individual (sole trader)', () => {
    it('should join givenNames and familyName into entityName', () => {
      const result = adapter.normalize(sampleRawIndividualRecord);

      expect(result.entityName).toBe('JANE DOE');
    });

    it('should set givenName and familyName individually', () => {
      const result = adapter.normalize(sampleRawIndividualRecord);

      expect(result.givenName).toBe('JANE');
      expect(result.familyName).toBe('DOE');
    });

    it('should handle multiple given names joined by space', () => {
      const multiNameRecord = {
        ...sampleRawIndividualRecord,
        givenNames: ['MARY', 'JANE'],
      };

      const result = adapter.normalize(multiNameRecord);

      expect(result.givenName).toBe('MARY JANE');
      expect(result.entityName).toBe('MARY JANE DOE');
    });

    it('should produce an empty businessNames array when no otherNames exist', () => {
      const result = adapter.normalize(sampleRawIndividualRecord);

      expect(result.businessNames).toEqual([]);
    });
  });

  describe('normalize() — sentinel date handling', () => {
    it('should convert "19000101" dates to null', () => {
      const result = adapter.normalize(sampleRawRecordWithSentinelDate);

      expect(result.recordLastUpdated).toBeNull();
      expect(result.abnStatusFrom).toBeNull();
      expect(result.gstFromDate).toBeNull();
    });
  });

  describe('normalize() — edge cases', () => {
    it('should default entityName to "Unknown Entity" when mainEntityName is null for non-IND', () => {
      const noNameRecord = {
        ...sampleRawAbrRecord,
        mainEntityName: null,
      };

      const result = adapter.normalize(noNameRecord);

      expect(result.entityName).toBe('Unknown Entity');
    });

    it('should handle individual with only familyName (no given names)', () => {
      const familyOnlyRecord = {
        ...sampleRawIndividualRecord,
        givenNames: [],
      };

      const result = adapter.normalize(familyOnlyRecord);

      expect(result.givenName).toBeNull();
      expect(result.entityName).toBe('DOE');
    });
  });
});
