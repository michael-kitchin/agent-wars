/**
 * Mechanical violation kinds emitted by the naming scanner.
 *
 * Purpose: Keeps report JSON and the rename ledger on one category vocabulary.
 * When to use: When classifying a path or exported identifier.
 * Expected outcome: A stable discriminant for downstream ledger entries.
 * Exceptions: None.
 */
export type ViolationCategory =
  | 'directoryCasing'
  | 'fileCasing'
  | 'bannedSuffix'
  | 'numberedTool'
  | 'exportCasing'
  | 'resolutionToken';

/**
 * One contract violation found in a scan.
 *
 * Purpose: Machine-readable row for reports and ledger generation.
 * When to use: Returned from discovery; copied into human reports.
 * Expected outcome: Enough path, name, and category data to open a ledger entry.
 * Exceptions: None.
 */
export interface Violation {
  readonly category: ViolationCategory;
  readonly filePath: string;
  readonly currentName: string;
  readonly suggestedName?: string;
  readonly detail: string;
}

/**
 * Aggregate result of a repository naming scan.
 *
 * Purpose: CLI `report` payload written to `.spec/naming-last-report.json`.
 * When to use: After walking `src/` and TypeScript tooling trees.
 * Expected outcome: File count plus the full violation list.
 * Exceptions: None.
 */
export interface ScanReport {
  readonly repoRoot: string;
  readonly scannedFileCount: number;
  readonly violations: readonly Violation[];
}

/**
 * Role suffixes the contract forbids on files and exported identifiers.
 *
 * Purpose: Closed set for `bannedSuffixIn`.
 * When to use: When a name ends with one of these tokens.
 * Expected outcome: Exact suffix string or unused when the name is allowed.
 * Exceptions: None.
 */
export type BannedSuffix = 'Utils' | 'Impl' | 'Manager' | 'Service' | 'Processor' | 'Controller';

/**
 * Kind of rename a ledger entry describes.
 *
 * Purpose: Selects path vs identifier apply behavior in the rename engine.
 * When to use: When reading `renameLedger.json`.
 * Expected outcome: `directory`, `file`, or `symbol`.
 * Exceptions: None.
 */
export type LedgerEntryKind = 'directory' | 'file' | 'symbol';

/**
 * Apply state for one ledger row.
 *
 * Purpose: Makes apply idempotent and supports explicit waivers.
 * When to use: Before mutating a path or identifier.
 * Expected outcome: `pending` is eligible; `applied` is a no-op; `waived` is skipped.
 * Exceptions: None.
 */
export type LedgerStatus = 'pending' | 'applied' | 'waived';

/**
 * One signed rename (or waiver) the apply CLI may execute.
 *
 * Purpose: Single source of planned product-source renames.
 * When to use: `naming:apply --id`; never invent ids at apply time.
 * Expected outcome: Enough data to find the current path/name and the proposed name.
 * Exceptions: None.
 */
export interface LedgerEntry {
  readonly id: string;
  readonly kind: LedgerEntryKind;
  readonly currentPath: string;
  readonly currentName: string;
  readonly proposedPath?: string;
  readonly proposedName: string;
  readonly category: ViolationCategory | 'judgement';
  readonly rationale: string;
  readonly referencingFileCount: number;
  readonly linkedEntryIds: readonly string[];
  readonly status: LedgerStatus;
  readonly waiverReason?: string;
}

/**
 * Root document stored at `scripts/naming/renameLedger.json`.
 *
 * Purpose: Lets the apply CLI load every entry from one file.
 * When to use: `loadLedger(repoRoot)`.
 * Expected outcome: An `entries` array covering the scan (plus waivers).
 * Exceptions: None.
 */
export interface RenameLedgerDocument {
  readonly entries: LedgerEntry[];
}

/**
 * Result of one apply (or dry-run) invocation.
 *
 * Purpose: CLI and tests assert edits, no-ops, and comment leftovers.
 * When to use: Returned from `applyLedgerEntry`.
 * Expected outcome: Lists edited files and comment occurrences; `noop` when already applied.
 * Exceptions: None.
 */
export interface ApplyResult {
  readonly id: string;
  readonly dryRun: boolean;
  readonly noop: boolean;
  readonly commentOccurrences: readonly string[];
  readonly editedFiles: readonly string[];
}
