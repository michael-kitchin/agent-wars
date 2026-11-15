/**
 * Prints the totals of one recording file.
 *
 * Purpose: `npm run recording:summary -- <path>` reads a finished recording without opening the match database.
 * When to use: After `npm run build:main`, with the path of a `.agentwars-recording` file.
 * Expected outcome: The summary on stdout. With no path, or a file that cannot be read, one sentence on stderr and exit code 1.
 * Exceptions: None. Failures set `process.exitCode`.
 */

import { readRecordingFile } from './matchRecordingFile';
import { formatRecordingSummary, summarizeRecording } from './matchRecordingSummary';

/**
 * Runs the summary command from `process.argv`.
 *
 * Purpose: The process entry stays a function so the file's behavior is the same when required.
 * When to use: The bottom of this file, once.
 * Expected outcome: Summary text, or one error sentence and exit code 1.
 * Exceptions: None.
 */
function main(): void {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('Pass the path of a recording file.\n');
    process.exitCode = 1;
    return;
  }
  try {
    process.stdout.write(formatRecordingSummary(summarizeRecording(readRecordingFile(filePath))));
  } catch {
    process.stderr.write('The recording file could not be read.\n');
    process.exitCode = 1;
  }
}

main();
