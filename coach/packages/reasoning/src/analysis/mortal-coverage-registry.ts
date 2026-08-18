// M6-A3 semantic coverage matrix (spec: 2026-08-16-m6-a3, ADR-0002).
// Every new decision branch stays production fail-closed until at least one
// REAL E2E hit (tenhou/majsoul corpus → canonical → binding → assembly →
// redacted output) is recorded against it. Synthetic fixtures can never lift
// the gate: they only prove regression behavior.
//
// M6-A4.2: the response surface (discard_response / kan_response windows)
// joins the matrix — wave-1 six branches per the A4 spec (resp_chi_actual /
// resp_pon_actual / resp_daiminkan_actual / resp_hora_actual /
// resp_pass_on_discard / resp_chankan_actual) plus the wave-2
// resp_pass_on_kakan entry. They stay fail-closed (production default is the
// empty registry) until A4.3 records real E2E evidence for each.

export const MORTAL_COVERAGE_BRANCHES = [
  "riichi_window",
  "dama_with_riichi_candidate",
  "post_call_chi",
  "post_call_pon",
  "post_riichi",
  "self_turn_tsumo_actual",
  "dama_with_tsumo_candidate",
  "self_turn_ankan",
  "self_turn_kakan",
  "self_turn_kyuushu",
  // M6-A4.2 wave-1: response window × actual action matrix (A4 spec §分支矩阵).
  "resp_chi_actual",
  "resp_pon_actual",
  "resp_daiminkan_actual",
  "resp_hora_actual",
  "resp_pass_on_discard",
  "resp_chankan_actual",
  // M6-A4.2 wave-2 (fail-closed + degradation clause; A4.3 acceptance).
  "resp_pass_on_kakan",
] as const;

export type MortalCoverageBranch = (typeof MORTAL_COVERAGE_BRANCHES)[number];

const branchSet: ReadonlySet<string> = new Set(MORTAL_COVERAGE_BRANCHES);

export type MortalCoverageWindowKind =
  | "self_turn"
  | "post_call_discard"
  | "post_riichi_discard"
  | "discard_response"
  | "kan_response";

// Classify which coverage branches a bound decision row exercises. The
// candidate action types are the RAW mjai types from the Mortal report
// (dahai / reach / ankan / kakan / hora / ryukyoku / ...). Returns an empty
// list for the ordinary self-turn discard surface, which A2 live evidence
// already covers.
export function classifyCoverageBranches(input: {
  readonly windowKind: MortalCoverageWindowKind;
  readonly actualActionKind: string | null;
  readonly callKind: "chi" | "pon" | null;
  readonly candidateActionTypes: readonly string[];
}): readonly MortalCoverageBranch[] {
  const branches = new Set<MortalCoverageBranch>();
  const candidates = input.candidateActionTypes;
  const has = (type: string) => candidates.includes(type);

  // Every branch is scoped to the window surface that can legally carry it:
  // terminal and riichi branches are self-turn facts, and a post-call hand is
  // open so it can never carry a riichi actual. An unknown call kind fails
  // closed — it is never tallied as a specific branch.
  if (
    input.windowKind === "post_call_discard" &&
    input.actualActionKind === "discard" &&
    (input.callKind === "chi" || input.callKind === "pon")
  ) {
    branches.add(input.callKind === "chi" ? "post_call_chi" : "post_call_pon");
  }
  if (
    input.windowKind === "post_riichi_discard" &&
    input.actualActionKind === "discard"
  ) {
    branches.add("post_riichi");
  }

  if (input.windowKind === "self_turn") {
    if (input.actualActionKind === "riichi_discard" && has("reach")) {
      branches.add("riichi_window");
    }
    if (input.actualActionKind === "discard") {
      if (has("reach")) branches.add("dama_with_riichi_candidate");
      if (has("hora") || has("agari")) branches.add("dama_with_tsumo_candidate");
    }
    if (input.actualActionKind === "tsumo") {
      branches.add("self_turn_tsumo_actual");
    }
    if (input.actualActionKind === "kakan") {
      branches.add("self_turn_kakan");
    }
    // Candidate-driven branches fire on any actual: the surface was
    // exercised the moment the model scored that alternative.
    if (input.actualActionKind === "ankan" || has("ankan")) {
      branches.add("self_turn_ankan");
    }
    if (input.actualActionKind === "kyuushu_kyuuhai" || has("ryukyoku")) {
      branches.add("self_turn_kyuushu");
    }
  }

  // M6-A4.2: the response surface matrix (A4 spec §分支矩阵). The actual
  // action kind is the TYPED local actual (pass / chi / pon / daiminkan /
  // ron); the pass branch is only ever fired by an actual pass — a pass is
  // never a proxy for another branch (resp_pass_on_discard vs
  // resp_chi_actual are distinct acceptance facts). Candidate-driven
  // branches are not used here: the response surface's wave-1/2 matrix is
  // actual-driven by design (the candidate set is the 同构 enumeration, the
  // actual outcome is the acceptance fact).
  if (input.windowKind === "discard_response") {
    if (input.actualActionKind === "chi") branches.add("resp_chi_actual");
    if (input.actualActionKind === "pon") branches.add("resp_pon_actual");
    if (input.actualActionKind === "daiminkan") branches.add("resp_daiminkan_actual");
    if (input.actualActionKind === "ron") branches.add("resp_hora_actual");
    if (input.actualActionKind === "pass") branches.add("resp_pass_on_discard");
  }
  if (input.windowKind === "kan_response") {
    if (input.actualActionKind === "ron") branches.add("resp_chankan_actual");
    if (input.actualActionKind === "pass") branches.add("resp_pass_on_kakan");
  }

  return MORTAL_COVERAGE_BRANCHES.filter((branch) => branches.has(branch));
}

export interface MortalCoverageRegistry {
  isCovered(branch: MortalCoverageBranch): boolean;
}

export function createMortalCoverageRegistry(
  coveredBranches: readonly MortalCoverageBranch[],
): MortalCoverageRegistry {
  for (const branch of coveredBranches) {
    if (!branchSet.has(branch)) {
      throw new Error(`unknown_mortal_coverage_branch:${String(branch)}`);
    }
  }
  const covered = new Set(coveredBranches);
  return Object.freeze({
    isCovered(branch: MortalCoverageBranch): boolean {
      return covered.has(branch);
    },
  });
}

// Production default: nothing is lifted until real E2E acceptance evidence
// is recorded by the corpus runner. The default registry is frozen so no
// runtime path can silently mark a branch covered.
export const EMPTY_MORTAL_COVERAGE_REGISTRY: MortalCoverageRegistry =
  createMortalCoverageRegistry([]);
