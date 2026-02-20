/**
 * ETL Worker Thread — XML Ingestion Engine
 * Layer: Workers (ETL)
 *
 * I run in a separate worker thread. I use SAX so we never load the full 580MB
 * into memory — we stream and react to opentag/text/closetag events. elementStack
 * tracks where we are so we can tell MainEntity’s NonIndividualNameText from
 * OtherEntity’s. Pipeline: FileReadStream → SAX → Adapter → BatchProcessor → PostgreSQL.
 *
 * Backpressure: we await processor.add() and pause the file stream while the DB
 * write (or flush) is in progress, then resume. So parsing never runs ahead of
 * writes — no overlapping flushes, no unbounded concurrency, no pool exhaustion.
 */
import { createReadStream } from 'fs';
import sax from 'sax';
import type { Readable } from 'stream';
import { parentPort, workerData } from 'worker_threads';

import { BatchProcessor } from './batchProcessor';
import {
  createEmptyRawRecord,
  type RawAbrRecord,
  XmlDataSourceAdapter,
} from './XmlDataSourceAdapter';

const { filePath, dbConfig, batchSize, etlOptions } = workerData as {
  filePath: string;
  dbConfig: { url: string; ssl: boolean; pool: { min: number; max: number } };
  batchSize: number;
  etlOptions?: {
    retryAttempts: number;
    retryDelayMs: number;
    flushDelayMs: number;
    poolIdleTimeoutMs: number;
  };
};

const adapter = new XmlDataSourceAdapter();
const processor = new BatchProcessor(dbConfig, batchSize, etlOptions);

// Parser state: current record, element stack (for parent context), and text accumulator
let currentRecord: RawAbrRecord | null = null;
const elementStack: string[] = [];
let currentText = '';
let currentOtherNameType = '';
let processed = 0;
const startTime = Date.now();

const fileStream: Readable = createReadStream(filePath, {
  encoding: 'utf-8',
  highWaterMark: 64 * 1024,
});
const parser = sax.createStream(true, { trim: true });

parser.on('opentag', (node: sax.Tag) => {
  elementStack.push(node.name);
  currentText = '';

  if (node.name === 'ABR') {
    currentRecord = createEmptyRawRecord();
    currentRecord.recordLastUpdatedDate = String(node.attributes.recordLastUpdatedDate ?? '');
  }

  if (!currentRecord) return;

  const attrs = node.attributes;

  switch (node.name) {
    case 'ABN':
      currentRecord.abnStatus = String(attrs.status ?? '');
      currentRecord.abnStatusFromDate = String(attrs.ABNStatusFromDate ?? '');
      break;
    case 'GST':
      currentRecord.gstStatus = String(attrs.status ?? '');
      currentRecord.gstFromDate = String(attrs.GSTStatusFromDate ?? '');
      break;
    case 'ASICNumber':
      break;
    case 'NonIndividualName':
      if (parentElement() === 'OtherEntity' || parentElement() === 'DGR') {
        currentOtherNameType = String(attrs.type ?? '');
      }
      break;
  }
});

parser.on('text', (text: string) => {
  currentText += text;
});

parser.on('cdata', (text: string) => {
  currentText += text;
});

parser.on('closetag', async (name: string) => {
  if (currentRecord) {
    const text = currentText.trim();
    const parent = parentElement();

    switch (name) {
      case 'ABN':
        currentRecord.abn = text;
        break;
      case 'EntityTypeInd':
        currentRecord.entityTypeInd = text;
        break;
      case 'EntityTypeText':
        currentRecord.entityTypeText = text;
        break;
      case 'NonIndividualNameText':
        if (parent === 'NonIndividualName') {
          const grandparent = elementStack.length >= 3 ? elementStack[elementStack.length - 3] : '';
          if (grandparent === 'MainEntity') {
            currentRecord.mainEntityName = text;
          } else if (grandparent === 'OtherEntity' || grandparent === 'DGR') {
            currentRecord.otherNames.push({ type: currentOtherNameType, text });
          }
        }
        break;
      case 'GivenName':
        if (text) currentRecord.givenNames.push(text);
        break;
      case 'FamilyName':
        currentRecord.familyName = text;
        break;
      case 'State':
        currentRecord.state = text;
        break;
      case 'Postcode':
        currentRecord.postcode = text;
        break;
      case 'ASICNumber':
        currentRecord.acn = text || null;
        break;
      case 'ABR': {
        fileStream.pause();
        try {
          await handleRecordClose();
        } catch (err) {
          parentPort?.postMessage({
            type: 'error',
            message: `Failed to process ABN ${currentRecord?.abn ?? 'unknown'}: ${err instanceof Error ? err.message : String(err)}`,
          });
          throw err;
        } finally {
          fileStream.resume();
        }
        break;
      }
    }
  }

  elementStack.pop();
  currentText = '';
});

parser.on('error', (err: Error) => {
  parentPort?.postMessage({ type: 'error', message: err.message });
});

parser.on('end', async () => {
  try {
    await processor.flush();
    const stats = await processor.destroy();
    const durationMs = Date.now() - startTime;

    parentPort?.postMessage({
      type: 'done',
      result: {
        totalProcessed: processed,
        totalInserted: stats.totalInserted,
        totalUpdated: stats.totalUpdated,
        durationMs,
      },
    });
  } catch (err) {
    parentPort?.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

fileStream.pipe(parser);

function parentElement(): string {
  return elementStack.length >= 2 ? elementStack[elementStack.length - 2] : '';
}

/**
 * Process one record: normalize, add to batch (and flush if full). Awaiting add()
 * applies backpressure — the stream is paused by the caller so no further
 * records are parsed until this write (or flush) completes.
 */
async function handleRecordClose(): Promise<void> {
  if (!currentRecord || !currentRecord.abn) return;

  const entity = adapter.normalize(currentRecord);
  await processor.add(entity);

  processed++;
  if (processed % 10000 === 0) {
    parentPort?.postMessage({ type: 'progress', processed });
  }

  currentRecord = null;
}
