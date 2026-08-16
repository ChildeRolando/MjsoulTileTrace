/**
 * @riichi-coach/tenhou-source — second production canonical importer (M6-A3 §12).
 *
 * Strict, deterministic, fail-closed Tenhou mjloggm → CanonicalEventStream
 * mapping with explicit diagnostic codes and no Mortal/mjai_log dependency.
 * Source-specific details stop at this package: callers consume canonical
 * contracts only.
 */
export {
  TENHOU_MAPPER_VERSION,
  mapTenhouRecord,
  type TenhouCanonicalMapperResult,
  type TenhouRecordMapperInput,
} from "./record-mapper.js";
export {
  TenhouSourceError,
  type TenhouSourceErrorCode,
} from "./errors.js";
export { tokenizeMjlog, type MjlogToken } from "./mjlog-tokenizer.js";
export {
  isRedCode,
  tenhouTileCode,
  tenhouTileList,
} from "./tile-codec.js";
export {
  decodeTenhouMeld,
  tenhouMeldFlavor,
  type TenhouMeld,
  type TenhouMeldFlavor,
} from "./meld-codec.js";
export {
  TENHOU_COVERAGE_BRANCHES,
  censusCanonicalGame,
  type BranchWindowLocators,
  type GameCensus,
  type SeatCensus,
  type TenhouCoverageBranch,
} from "./census.js";
export {
  discoverTenhouCorpus,
  mergeDamaTsumoCandidates,
  type DamaTsumoPassStats,
  type DiscoveryBranchCandidate,
  type DiscoveryInput,
  type DiscoveryOptions,
  type DiscoveryReport,
  type DiscoverySelectionPair,
} from "./discovery.js";
export {
  delayBeforeRequestMs,
  planAcceptanceRun,
  updateCheckpoint,
  type AcceptanceBudget,
  type AcceptanceCachedSuccess,
  type AcceptanceCheckpointEntry,
  type AcceptanceCheckpointStatus,
  type AcceptancePlanInput,
  type AcceptancePlanReason,
  type AcceptanceSelectionEntry,
  type PlannedAcceptanceItem,
} from "./acceptance-policy.js";
export {
  ACCEPTANCE_LOCAL_SOURCE_TYPES,
  canTransitionAcceptance,
  createEmptyAcceptanceCheckpoint,
  findAcceptancePair,
  isTerminalAcceptanceState,
  MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION,
  MORTAL_ACCEPTANCE_PIPELINE_STATES,
  parseAcceptanceCheckpointFile,
  transitionAcceptanceState,
  upsertAcceptancePair,
  type AcceptanceLocalSourceType,
  type AcceptanceTransitionEvent,
  type MortalAcceptanceCheckpointFile,
  type MortalAcceptancePairRecord,
  type MortalAcceptancePipelineState,
  type MortalAcceptanceState,
} from "./acceptance-state.js";
