import type {
  Axis,
  CoverageEntry,
  SceneSnapshot,
} from "@riichi-coach/contracts";

export const DIMENSION_CATALOG_VERSION = "1.1.0";

type MissingSceneData = SceneSnapshot["missingData"][number];

export type DimensionDefinition = {
  id: string;
  axis: Axis;
  implementation: "implemented" | "unsupported";
  summary: string;
  requiredSceneData?: MissingSceneData[];
};

export const DIMENSION_CATALOG: readonly DimensionDefinition[] = [
  {
    id: "efficiency.standard_hand_shanten",
    axis: "efficiency",
    implementation: "implemented",
    summary: "Deterministic standard-hand shanten after each discard",
  },
  {
    id: "efficiency.special_hand_shanten",
    axis: "efficiency",
    implementation: "unsupported",
    summary: "Chiitoitsu and kokushi shanten",
  },
  {
    id: "efficiency.hand_structure_blocks",
    axis: "efficiency",
    implementation: "unsupported",
    summary: "Completed groups, pair, taatsu, floating tiles, and five-block structure",
  },
  {
    id: "efficiency.live_ukeire",
    axis: "efficiency",
    implementation: "unsupported",
    summary: "Effective draws after subtracting every public visible tile",
    requiredSceneData: ["remaining_tiles", "meld_state", "called_discard_markers"],
  },
  {
    id: "efficiency.second_order_improvement",
    axis: "efficiency",
    implementation: "unsupported",
    summary: "Second-order improvement and future wait quality",
  },
  {
    id: "efficiency.wait_quality_and_furiten",
    axis: "efficiency",
    implementation: "unsupported",
    summary: "Wait types, ron availability, and furiten",
    requiredSceneData: ["furiten_state"],
  },
  {
    id: "efficiency.call_effects",
    axis: "efficiency",
    implementation: "unsupported",
    summary: "Chi, pon, and kan effects on shanten, ukeire, and legal yaku",
    requiredSceneData: ["meld_state", "legal_actions"],
  },
  {
    id: "efficiency.tenpai_win_draw_speed_value",
    axis: "efficiency",
    implementation: "unsupported",
    summary: "Speed value of tenpai, winning, and exhaustive-draw tenpai",
    requiredSceneData: ["remaining_tiles"],
  },
  {
    id: "value.confirmed_and_potential_yaku",
    axis: "value",
    implementation: "unsupported",
    summary: "Confirmed yaku, potential yaku, and yaku-loss risk",
    requiredSceneData: ["meld_state"],
  },
  {
    id: "value.dora_red_ura_and_kan_dora",
    axis: "value",
    implementation: "unsupported",
    summary: "Dora, red fives, ura-dora opportunity, and kan-dora changes",
    requiredSceneData: ["kan_dora_state"],
  },
  {
    id: "value.riichi_damaten_and_open_hand",
    axis: "value",
    implementation: "unsupported",
    summary: "Riichi, damaten, open-hand, and closed-hand value",
    requiredSceneData: ["meld_state", "legal_actions"],
  },
  {
    id: "value.fu_han_and_point_range",
    axis: "value",
    implementation: "unsupported",
    summary: "Fu, han, dealer/non-dealer, and minimum or typical point range",
    requiredSceneData: ["meld_state"],
  },
  {
    id: "value.wait_quality_and_ron_availability",
    axis: "value",
    implementation: "unsupported",
    summary: "Wait count, wait type, furiten, and ron availability",
    requiredSceneData: ["furiten_state", "remaining_tiles"],
  },
  {
    id: "value.speed_safety_option_tradeoff",
    axis: "value",
    implementation: "unsupported",
    summary: "Speed, safety, and option cost paid for value improvement",
  },
  {
    id: "defense.riichi_threat_state",
    axis: "defense",
    implementation: "implemented",
    summary: "Riichi actor, declaration event, and ippatsu state",
  },
  {
    id: "defense.open_hand_threat_state",
    axis: "defense",
    implementation: "unsupported",
    summary: "Fast or high-value open-hand threats",
    requiredSceneData: ["meld_state"],
  },
  {
    id: "defense.per_threat_genbutsu",
    axis: "defense",
    implementation: "implemented",
    summary: "Player-specific deterministic genbutsu evidence",
  },
  {
    id: "defense.structural_suji",
    axis: "defense",
    implementation: "unsupported",
    summary: "Player-specific suji safety heuristic",
  },
  {
    id: "defense.structural_wall",
    axis: "defense",
    implementation: "unsupported",
    summary: "Wall safety heuristic",
    requiredSceneData: ["meld_state", "called_discard_markers"],
  },
  {
    id: "defense.structural_one_chance",
    axis: "defense",
    implementation: "unsupported",
    summary: "One-chance safety heuristic",
    requiredSceneData: ["meld_state", "called_discard_markers"],
  },
  {
    id: "defense.honor_visibility",
    axis: "defense",
    implementation: "unsupported",
    summary: "Honor-tile safety from public visibility",
    requiredSceneData: ["meld_state", "called_discard_markers"],
  },
  {
    id: "defense.unsuji",
    axis: "defense",
    implementation: "unsupported",
    summary: "Player-specific unsuji classification",
  },
  {
    id: "defense.multi_threat_per_opponent",
    axis: "defense",
    implementation: "implemented",
    summary: "Separate deterministic safety result for every riichi threat",
  },
  {
    id: "defense.river_behavioral_inference",
    axis: "defense",
    implementation: "unsupported",
    summary: "Behavioral river inference for suit, value, and hand-shape tendencies",
  },
  {
    id: "defense.wait_shape_inference",
    axis: "defense",
    implementation: "unsupported",
    summary: "Wait heuristics such as matagi, urasuji, and aida yon ken",
  },
  {
    id: "defense.calibrated_dealin_probability",
    axis: "defense",
    implementation: "unsupported",
    summary:
      "Calibrated per-opponent deal-in probability with dataset and metric metadata",
  },
  {
    id: "defense.dealin_consequence",
    axis: "defense",
    implementation: "unsupported",
    summary: "Point and placement consequence of dealing in",
  },
  {
    id: "defense.multi_threat_risk_combination",
    axis: "defense",
    implementation: "unsupported",
    summary: "Combined risk across simultaneous threats",
  },
  {
    id: "placement.current_scores_rank_and_gaps",
    axis: "placement",
    implementation: "unsupported",
    summary: "Current scores, rank, and score gaps as a strategic factor",
  },
  {
    id: "placement.remaining_rounds_and_target_rank",
    axis: "placement",
    implementation: "unsupported",
    summary: "Target placement and remaining-round context",
  },
  {
    id: "placement.dealer_continuation_and_end_conditions",
    axis: "placement",
    implementation: "unsupported",
    summary: "Dealer continuation, all-last, and west-entry conditions",
  },
  {
    id: "placement.riichi_sticks_honba_and_noten_penalty",
    axis: "placement",
    implementation: "unsupported",
    summary: "Riichi sticks, honba, and exhaustive-draw tenpai payments",
  },
  {
    id: "placement.outcome_path_rank_impact",
    axis: "placement",
    implementation: "unsupported",
    summary: "Rank effect of win, deal-in, tsumo loss, tenpai, and noten paths",
  },
  {
    id: "placement.strategic_objective",
    axis: "placement",
    implementation: "unsupported",
    summary: "Acceptable loss, must-win, must-tenpai, and stick-preservation objectives",
  },
  {
    id: "placement.result_path_sensitivity",
    axis: "placement",
    implementation: "unsupported",
    summary: "Sensitivity of target placement to multiple result paths",
  },
  {
    id: "option_value.irreversible_riichi_calls_and_kans",
    axis: "option_value",
    implementation: "unsupported",
    summary: "Irreversibility introduced by riichi, calls, and kans",
    requiredSceneData: ["meld_state", "legal_actions"],
  },
  {
    id: "option_value.current_and_future_safe_inventory",
    axis: "option_value",
    implementation: "unsupported",
    summary: "Current and future safe-tile inventory after each action",
  },
  {
    id: "option_value.mawashi_preserves_efficiency",
    axis: "option_value",
    implementation: "unsupported",
    summary: "Whether mawashi-uchi preserves shanten or effective draws",
  },
  {
    id: "option_value.future_mode_switches",
    axis: "option_value",
    implementation: "unsupported",
    summary: "Future switching among attack, damaten, riichi, and fold",
    requiredSceneData: ["legal_actions"],
  },
  {
    id: "option_value.furiten_and_danger_deferral",
    axis: "option_value",
    implementation: "unsupported",
    summary: "Temporary or permanent furiten and deferral of dangerous tiles",
    requiredSceneData: ["furiten_state"],
  },
  {
    id: "option_value.information_and_delay_value",
    axis: "option_value",
    implementation: "unsupported",
    summary: "Information value of waiting one turn before committing",
  },
] as const;

export function coverageForDecision(scene: SceneSnapshot): CoverageEntry[] {
  const missing = new Set(scene.missingData);
  return DIMENSION_CATALOG.map((definition) => {
    const missingRequirements = (definition.requiredSceneData ?? []).filter(
      (requirement) => missing.has(requirement),
    );
    if (missingRequirements.length > 0) {
      return {
        axis: definition.axis,
        dimension: definition.id,
        status: "blocked_by_missing_data" as const,
        reason:
          `${definition.summary}; blocked because the scene is missing ` +
          missingRequirements.join(", "),
      };
    }
    if (definition.implementation === "implemented") {
      return {
        axis: definition.axis,
        dimension: definition.id,
        status: "implemented" as const,
        reason: definition.summary,
      };
    }
    return {
      axis: definition.axis,
      dimension: definition.id,
      status: "unsupported" as const,
      reason: `${definition.summary}; unsupported in strict reasoning milestone 1`,
    };
  });
}
