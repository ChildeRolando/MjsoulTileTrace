package main

import (
	"fmt"

	"github.com/EndlessCheng/mahjong-helper/util"
)

const handStructureSchemaVersion = "hand-structure/v2"

var kokushiTiles34 = [...]int{0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33}

type HandStructureRequestV2 struct {
	RequestBase
	SchemaVersion         string        `json:"schemaVersion"`
	HandTiles34           []int         `json:"handTiles34"`
	Melds                 []MeldInput   `json:"melds"`
	LeftTiles34           []int         `json:"leftTiles34"`
	VisibleCountsComplete bool          `json:"visibleCountsComplete"`
	RonContext            string        `json:"ronContext"`
	YakuContext           YakuContextV2 `json:"yakuContext"`
}

type YakuContextV2 struct {
	WindsStatus      string `json:"windsStatus"`
	RoundWindTile34  *int   `json:"roundWindTile34"`
	SelfWindTile34   *int   `json:"selfWindTile34"`
	RiichiStatus     string `json:"riichiStatus"`
	OpenTanyaoStatus string `json:"openTanyaoStatus"`
}

func (context *YakuContextV2) UnmarshalJSON(data []byte) error {
	type yakuContextAlias YakuContextV2
	var decoded yakuContextAlias
	if err := strictDecode(data, &decoded); err != nil {
		return err
	}
	if err := requireJSONFields(
		data,
		"windsStatus", "roundWindTile34", "selfWindTile34", "riichiStatus", "openTanyaoStatus",
	); err != nil {
		return err
	}
	*context = YakuContextV2(decoded)
	return nil
}

type EffectiveTileV2 struct {
	Tile34          int    `json:"tile34"`
	RemainingStatus string `json:"remainingStatus"`
	Remaining       *int   `json:"remaining"`
}

type HandFamilyResultV2 struct {
	Family         string            `json:"family"`
	Applicability  string            `json:"applicability"`
	Shanten        *int              `json:"shanten"`
	EffectiveTiles []EffectiveTileV2 `json:"effectiveTiles"`
}

type ShapeGroup struct {
	Kind    string `json:"kind"`
	Tiles34 []int  `json:"tiles34"`
}

type DecompositionV2 struct {
	DecompositionRef string       `json:"decompositionRef"`
	Family           string       `json:"family"`
	Shanten          int          `json:"shanten"`
	Groups           []ShapeGroup `json:"groups"`
}

type AlternativeClaimV2 struct {
	Kind              string   `json:"kind"`
	Tiles34           []int    `json:"tiles34"`
	DecompositionRefs []string `json:"decompositionRefs"`
}

type DecompositionSetV2 struct {
	Status            string               `json:"status"`
	TotalNonDominated int                  `json:"totalNonDominated"`
	Truncated         bool                 `json:"truncated"`
	Items             []DecompositionV2    `json:"items"`
	InvariantClaims   []ShapeGroup         `json:"invariantClaims"`
	AlternativeClaims []AlternativeClaimV2 `json:"alternativeClaims"`
}

type WaitV2 struct {
	Tile34             int      `json:"tile34"`
	Families           []string `json:"families"`
	WaitTypes          []string `json:"waitTypes"`
	RemainingStatus    string   `json:"remainingStatus"`
	Remaining          *int     `json:"remaining"`
	BaseRonEligibility string   `json:"baseRonEligibility"`
	DecompositionRefs  []string `json:"decompositionRefs"`
}

type HandStructureResultV2 struct {
	Kind            string               `json:"kind"`
	SchemaVersion   string               `json:"schemaVersion"`
	RequestID       string               `json:"requestId"`
	ProtocolVersion string               `json:"protocolVersion"`
	ActionRef       string               `json:"actionRef"`
	StateHash       string               `json:"stateHash"`
	Identity        EngineIdentity       `json:"identity"`
	OverallShanten  int                  `json:"overallShanten"`
	BestFamilies    []string             `json:"bestFamilies"`
	Families        []HandFamilyResultV2 `json:"families"`
	Decompositions  DecompositionSetV2   `json:"decompositions"`
	Waits           []WaitV2             `json:"waits"`
	Diagnostics     []string             `json:"diagnostics"`
}

type familyShanten struct {
	Standard   int
	Chiitoitsu *int
	Kokushi    *int
}

func countTiles(tiles []int) int {
	total := 0
	for _, count := range tiles {
		total += count
	}
	return total
}

func kokushiShanten(tiles []int) int {
	unique := 0
	hasPair := 0
	for _, tile := range kokushiTiles34 {
		if tiles[tile] > 0 {
			unique++
		}
		if tiles[tile] > 1 {
			hasPair = 1
		}
	}
	return 13 - unique - hasPair
}

func calculateFamilyShanten(tiles []int, meldCount int) familyShanten {
	copyForNormal := cloneInts(tiles)
	standard := util.CalculateShantenOfNormal(copyForNormal, countTiles(tiles))
	result := familyShanten{Standard: standard}
	if meldCount == 0 {
		copyForChiitoi := cloneInts(tiles)
		chiitoi := util.CalculateShantenOfChiitoi(copyForChiitoi)
		kokushi := kokushiShanten(tiles)
		result.Chiitoitsu = &chiitoi
		result.Kokushi = &kokushi
	}
	return result
}

func shantenForFamily(tiles []int, meldCount int, family string) *int {
	all := calculateFamilyShanten(tiles, meldCount)
	switch family {
	case "standard":
		return &all.Standard
	case "chiitoitsu":
		return all.Chiitoitsu
	case "kokushi":
		return all.Kokushi
	default:
		panic("validated family required")
	}
}

func effectiveTilesForFamily(tiles []int, meldCount int, family string) []int {
	base := shantenForFamily(tiles, meldCount, family)
	if base == nil {
		return []int{}
	}
	result := []int{}
	for tile := 0; tile < 34; tile++ {
		if tiles[tile] == 4 {
			continue
		}
		next := cloneInts(tiles)
		next[tile]++
		after := shantenForFamily(next, meldCount, family)
		if after != nil && *after < *base {
			result = append(result, tile)
		}
	}
	return result
}

func validateYakuContext(context YakuContextV2) error {
	switch context.WindsStatus {
	case "known":
		if context.RoundWindTile34 == nil || context.SelfWindTile34 == nil {
			return fmt.Errorf("yakuContext known winds require roundWindTile34 and selfWindTile34")
		}
	case "unknown":
		if context.RoundWindTile34 != nil || context.SelfWindTile34 != nil {
			return fmt.Errorf("yakuContext unknown winds require null roundWindTile34 and selfWindTile34")
		}
	default:
		return fmt.Errorf("yakuContext windsStatus is invalid")
	}
	if context.RoundWindTile34 != nil && (*context.RoundWindTile34 < 27 || *context.RoundWindTile34 > 29) {
		return fmt.Errorf("yakuContext roundWindTile34 must be between 27 and 29")
	}
	if context.SelfWindTile34 != nil && (*context.SelfWindTile34 < 27 || *context.SelfWindTile34 > 30) {
		return fmt.Errorf("yakuContext selfWindTile34 must be between 27 and 30")
	}
	switch context.RiichiStatus {
	case "accepted", "inactive", "unknown":
	default:
		return fmt.Errorf("yakuContext riichiStatus is invalid")
	}
	switch context.OpenTanyaoStatus {
	case "enabled", "disabled", "unknown":
	default:
		return fmt.Errorf("yakuContext openTanyaoStatus is invalid")
	}
	return nil
}

func validateHandStructureRequest(request HandStructureRequestV2) error {
	if request.Kind != "hand_structure" {
		return fmt.Errorf("kind must be hand_structure")
	}
	if request.SchemaVersion != handStructureSchemaVersion {
		return fmt.Errorf("schemaVersion must be %s", handStructureSchemaVersion)
	}
	if request.RequestID == "" {
		return fmt.Errorf("requestId is required")
	}
	if request.ProtocolVersion != protocolVersion {
		return fmt.Errorf("unsupported protocol version")
	}
	if request.ActionRef == "" {
		return fmt.Errorf("actionRef is required")
	}
	if request.StateHash == "" {
		return fmt.Errorf("stateHash is required")
	}
	if err := validateCounts34(request.HandTiles34, "handTiles34"); err != nil {
		return err
	}
	if _, err := convertMelds(request.Melds); err != nil {
		return err
	}
	if err := validateYakuContext(request.YakuContext); err != nil {
		return err
	}
	if request.YakuContext.RiichiStatus == "accepted" {
		for _, meld := range request.Melds {
			if meld.Kind != "ankan" {
				return fmt.Errorf("yakuContext riichiStatus accepted is incompatible with open meld %s", meld.Kind)
			}
		}
	}
	expectedConcealed := 13 - 3*len(request.Melds)
	if countTiles(request.HandTiles34) != expectedConcealed {
		return fmt.Errorf("handTiles34 must contain exactly %d concealed tiles", expectedConcealed)
	}
	owned := ownedTileCounts34(request.HandTiles34, request.Melds)
	for tile, count := range owned {
		if count > 4 {
			return fmt.Errorf("owned tile count for tile %d cannot exceed four", tile)
		}
	}
	if request.VisibleCountsComplete {
		if request.LeftTiles34 == nil {
			return fmt.Errorf("leftTiles34 must be an array when visible counts are complete")
		}
		if err := validateCounts34(request.LeftTiles34, "leftTiles34"); err != nil {
			return err
		}
		for tile, left := range request.LeftTiles34 {
			if left+owned[tile] > 4 {
				return fmt.Errorf("leftTiles34[%d] conflicts with owned tiles", tile)
			}
		}
	} else if request.LeftTiles34 != nil {
		return fmt.Errorf("leftTiles34 must be null when visible counts are incomplete")
	}
	switch request.RonContext {
	case "complete_none", "known_kakan_chankan", "known_ankan_chankan", "known_houtei", "unknown_future":
	default:
		return fmt.Errorf("ronContext is invalid")
	}
	return nil
}

func effectiveTileResults(
	request HandStructureRequestV2,
	family string,
	applicable bool,
	owned []int,
) []EffectiveTileV2 {
	if !applicable {
		return []EffectiveTileV2{}
	}
	tiles := effectiveTilesForFamily(request.HandTiles34, len(request.Melds), family)
	result := make([]EffectiveTileV2, 0, len(tiles))
	for _, tile := range tiles {
		if owned[tile] >= 4 {
			continue
		}
		effective := EffectiveTileV2{
			Tile34:          tile,
			RemainingStatus: "blocked_missing_facts",
			Remaining:       nil,
		}
		if request.VisibleCountsComplete {
			remaining := request.LeftTiles34[tile]
			effective.RemainingStatus = "calculated"
			effective.Remaining = &remaining
		}
		result = append(result, effective)
	}
	return result
}

func familyResult(
	request HandStructureRequestV2,
	family string,
	shanten *int,
	owned []int,
) HandFamilyResultV2 {
	if shanten == nil {
		return HandFamilyResultV2{
			Family:         family,
			Applicability:  "not_applicable_open_hand",
			Shanten:        nil,
			EffectiveTiles: []EffectiveTileV2{},
		}
	}
	value := *shanten
	return HandFamilyResultV2{
		Family:         family,
		Applicability:  "applicable",
		Shanten:        &value,
		EffectiveTiles: effectiveTileResults(request, family, true, owned),
	}
}

func analyzeHandStructure(request HandStructureRequestV2) (HandStructureResultV2, error) {
	if err := validateHandStructureRequest(request); err != nil {
		return HandStructureResultV2{}, err
	}
	shanten := calculateFamilyShanten(request.HandTiles34, len(request.Melds))
	owned := ownedTileCounts34(request.HandTiles34, request.Melds)
	standard := shanten.Standard
	families := []HandFamilyResultV2{
		familyResult(request, "standard", &standard, owned),
		familyResult(request, "chiitoitsu", shanten.Chiitoitsu, owned),
		familyResult(request, "kokushi", shanten.Kokushi, owned),
	}
	overall := standard
	for _, family := range families[1:] {
		if family.Shanten != nil && *family.Shanten < overall {
			overall = *family.Shanten
		}
	}
	best := []string{}
	for _, family := range families {
		if family.Shanten != nil && *family.Shanten == overall {
			best = append(best, family.Family)
		}
	}
	decompositions := buildDecompositionSet(bestFamilyDecompositions(
		request.HandTiles34,
		len(request.Melds),
		families,
		overall,
	))
	return HandStructureResultV2{
		Kind:            "hand_structure_result",
		SchemaVersion:   handStructureSchemaVersion,
		RequestID:       request.RequestID,
		ProtocolVersion: protocolVersion,
		ActionRef:       request.ActionRef,
		StateHash:       request.StateHash,
		Identity:        engineIdentity(),
		OverallShanten:  overall,
		BestFamilies:    best,
		Families:        families,
		Decompositions:  decompositions,
		Waits:           []WaitV2{},
		Diagnostics:     decompositionDiagnostics(decompositions),
	}, nil
}
