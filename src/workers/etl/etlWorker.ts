/**
 * ETL Worker Thread
 *
 * Runs in a separate V8 isolate via worker_threads.
 * Streams an ABR XML file through a SAX parser, normalizes each <ABR> record
 * via the XmlDataSourceAdapter, and bulk-inserts via the BatchProcessor.
 *
 * Communication with the main thread:
 *   workerData -> { filePath, dbConfig, batchSize }
 *   postMessage <- { type: 'progress', processed }
 *   postMessage <- { type: 'done', result: IngestionResult }
 *   postMessage <- { type: 'error', message }
 */
import { parentPort, workerData } from 'worker_threads';
import { createReadStream } from 'fs';
import sax from 'sax';
import {
  XmlDataSourceAdapter,
  createEmptyRawRecord,
  type RawAbrRecord,
} from './XmlDataSourceAdapter';
import { BatchProcessor } from './batchProcessor';

const { filePath, dbConfig, batchSize } = workerData as {
  filePath: string;
  dbConfig: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    pool: { min: number; max: number };
  };
  batchSize: number;
};

const adapter = new XmlDataSourceAdapter();
const processor = new BatchProcessor(dbConfig, batchSize);

// SAX parser state
let currentRecord: RawAbrRecord | null = null;
const elementStack: string[] = [];
let currentText = '';
let currentOtherNameType = '';
let processed = 0;
const startTime = Date.now();

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

parser.on('closetag', (name: string) => {
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
      case 'ABR':
        handleRecordClose();
        break;
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

// Kick off the stream pipeline
const fileStream = createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 64 * 1024 });
fileStream.pipe(parser);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parentElement(): string {
  return elementStack.length >= 2 ? elementStack[elementStack.length - 2] : '';
}

function handleRecordClose(): void {
  if (!currentRecord || !currentRecord.abn) return;

  const entity = adapter.normalize(currentRecord);
  // Use a fire-and-forget pattern; backpressure is handled by the batch buffer.
  // If the DB write is slower than parsing, the buffer grows until flush completes.
  processor.add(entity).catch((err) => {
    parentPort?.postMessage({
      type: 'error',
      message: `Failed to process ABN ${currentRecord?.abn}: ${err instanceof Error ? err.message : String(err)}`,
    });
  });

  processed++;
  if (processed % 10000 === 0) {
    parentPort?.postMessage({ type: 'progress', processed });
  }

  currentRecord = null;
}
