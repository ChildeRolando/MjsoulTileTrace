package main

import (
	"sort"

	"github.com/EndlessCheng/mahjong-helper/util"
	"github.com/EndlessCheng/mahjong-helper/util/model"
)

type waitEvidence struct {
	families      map[string]bool
	waitTypes     map[string]bool
	refs          map[string]bool
	eligibilities []string
}

func newWaitEvidence() *waitEvidence {
	return &waitEvidence{
		families:      make(map[string]bool),
		waitTypes:     make(map[string]bool),
		refs:          make(map[string]bool),
		eligibilities: []string{},
	}
}

func sequenceWaitType(first, win int) string {
	position := win - first
	if position == 1 {
		return "kanchan"
	}
	if position == 2 && first%9 == 0 {
		return "penchan"
	}
	if position == 0 && first%9 == 6 {
		return "penchan"
	}
	return "ryanmen"
}

func sequenceTaatsuKind(first, win int) string {
	switch sequenceWaitType(first, win) {
	case "kanchan":
		return "kanchan_taatsu"
	case "penchan":
		return "penchan_taatsu"
	default:
		return "ryanmen_taatsu"
	}
}

func completedDivisionPreDrawGroups(
	division *util.DivideResult,
	winTile int,
	targetKind string,
	targetIndex int,
) []ShapeGroup {
	groups := make([]ShapeGroup, 0, 1+len(division.KotsuTiles)+len(division.ShuntsuFirstTiles))
	if targetKind == "pair" {
		groups = appendGroup(groups, "floating", division.PairTile)
	} else {
		groups = appendGroup(groups, "pair_candidate", division.PairTile, division.PairTile)
	}
	for index, tile := range division.KotsuTiles {
		if targetKind == "triplet" && index == targetIndex {
			groups = appendGroup(groups, "pair_candidate", tile, tile)
		} else {
			groups = appendGroup(groups, "triplet", tile, tile, tile)
		}
	}
	for index, first := range division.ShuntsuFirstTiles {
		if targetKind == "sequence" && index == targetIndex {
			tiles := []int{first, first + 1, first + 2}
			remaining := make([]int, 0, 2)
			removed := false
			for _, tile := range tiles {
				if tile == winTile && !removed {
					removed = true
					continue
				}
				remaining = append(remaining, tile)
			}
			groups = appendGroup(groups, sequenceTaatsuKind(first, winTile), remaining...)
		} else {
			groups = appendGroup(groups, "sequence", first, first+1, first+2)
		}
	}
	return canonicalizeGroups(groups)
}

func returnedDecompositionRefs(set DecompositionSetV2) map[string]string {
	refs := make(map[string]string, len(set.Items))
	for _, item := range set.Items {
		key := item.Family + "|" + partitionKey(canonicalizeGroups(item.Groups))
		refs[key] = item.DecompositionRef
	}
	return refs
}

func addMappedRef(evidence *waitEvidence, family string, groups []ShapeGroup, returned map[string]string) {
	if ref, exists := returned[family+"|"+partitionKey(canonicalizeGroups(groups))]; exists {
		evidence.refs[ref] = true
	}
}

func addStandardWaitEvidence(
	evidence *waitEvidence,
	preDraw []int,
	completed []int,
	winTile int,
	returned map[string]string,
) {
	for _, division := range util.DivideTiles34(cloneInts(completed)) {
		if division.IsChiitoi {
			continue
		}
		if division.PairTile == winTile && preDraw[winTile] == 1 {
			evidence.waitTypes["tanki"] = true
			groups := completedDivisionPreDrawGroups(division, winTile, "pair", 0)
			addMappedRef(evidence, "standard", groups, returned)
		}
		if preDraw[winTile] == 2 {
			for index, tile := range division.KotsuTiles {
				if tile != winTile {
					continue
				}
				evidence.waitTypes["shanpon"] = true
				groups := completedDivisionPreDrawGroups(division, winTile, "triplet", index)
				addMappedRef(evidence, "standard", groups, returned)
			}
		}
		for index, first := range division.ShuntsuFirstTiles {
			if winTile < first || winTile > first+2 {
				continue
			}
			evidence.waitTypes[sequenceWaitType(first, winTile)] = true
			groups := completedDivisionPreDrawGroups(division, winTile, "sequence", index)
			addMappedRef(evidence, "standard", groups, returned)
		}
	}
}

func sortedFamilies(values map[string]bool) []string {
	result := make([]string, 0, len(values))
	for family := range values {
		result = append(result, family)
	}
	sort.Slice(result, func(left, right int) bool {
		return familyOrder(result[left]) < familyOrder(result[right])
	})
	return result
}

func waitTypeOrder(kind string) int {
	switch kind {
	case "ryanmen":
		return 0
	case "kanchan":
		return 1
	case "penchan":
		return 2
	case "shanpon":
		return 3
	case "tanki":
		return 4
	case "kokushi_single":
		return 5
	case "kokushi_thirteen_sided":
		return 6
	default:
		return 7
	}
}

func sortedWaitTypes(values map[string]bool) []string {
	result := make([]string, 0, len(values))
	for kind := range values {
		result = append(result, kind)
	}
	sort.Slice(result, func(left, right int) bool {
		leftOrder, rightOrder := waitTypeOrder(result[left]), waitTypeOrder(result[right])
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return result[left] < result[right]
	})
	return result
}

func sortedStringSet(values map[string]bool) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func cloneMelds(melds []model.Meld) []model.Meld {
	result := make([]model.Meld, len(melds))
	for index, meld := range melds {
		result[index] = meld
		result[index].Tiles = cloneInts(meld.Tiles)
		result[index].SelfTiles = cloneInts(meld.SelfTiles)
	}
	return result
}

func cloneEligibilityPlayer(source *model.PlayerInfo) *model.PlayerInfo {
	return &model.PlayerInfo{
		HandTiles34:        cloneInts(source.HandTiles34),
		Melds:              cloneMelds(source.Melds),
		DoraTiles:          []int{},
		NumRedFives:        []int{0, 0, 0},
		IsTsumo:            false,
		WinTile:            source.WinTile,
		RoundWindTile:      source.RoundWindTile,
		SelfWindTile:       source.SelfWindTile,
		IsParent:           source.IsParent,
		IsDaburii:          false,
		IsRiichi:           source.IsRiichi,
		DiscardTiles:       []int{},
		LeftTiles34:        []int{},
		LeftDrawTilesCount: 0,
		NukiDoraNum:        0,
	}
}

func playerOwnsOnlySimples(player *model.PlayerInfo) bool {
	for tile, count := range player.HandTiles34 {
		if count > 0 && (tile >= 27 || tile%9 == 0 || tile%9 == 8) {
			return false
		}
	}
	for _, meld := range player.Melds {
		for _, tile := range meld.Tiles {
			if tile >= 27 || tile%9 == 0 || tile%9 == 8 {
				return false
			}
		}
	}
	return true
}

func expandedWinds(context YakuContextV2) [][2]int {
	if context.WindsStatus == "known" && context.RoundWindTile34 != nil && context.SelfWindTile34 != nil {
		return [][2]int{{*context.RoundWindTile34, *context.SelfWindTile34}}
	}
	result := make([][2]int, 0, 12)
	for _, roundWind := range []int{27, 28, 29} {
		for _, selfWind := range []int{27, 28, 29, 30} {
			result = append(result, [2]int{roundWind, selfWind})
		}
	}
	return result
}

func expandedRiichi(player *model.PlayerInfo, status string) []bool {
	if player.IsNaki() {
		return []bool{false}
	}
	switch status {
	case "accepted":
		return []bool{true}
	case "inactive":
		return []bool{false}
	case "unknown":
		return []bool{false, true}
	default:
		return []bool{false}
	}
}

func expandedOpenTanyao(status string) []bool {
	switch status {
	case "enabled":
		return []bool{true}
	case "disabled":
		return []bool{false}
	case "unknown":
		return []bool{false, true}
	default:
		return []bool{false}
	}
}

const (
	eligibilityFalse = iota
	eligibilityTrue
	eligibilityUnknown
)

func baselineRonEligibility(player *model.PlayerInfo, context YakuContextV2) string {
	truths := make([]int, 0, 48)
	openAllSimples := player.IsNaki() && playerOwnsOnlySimples(player)
	for _, winds := range expandedWinds(context) {
		for _, riichi := range expandedRiichi(player, context.RiichiStatus) {
			for _, openTanyaoEnabled := range expandedOpenTanyao(context.OpenTanyaoStatus) {
				candidate := cloneEligibilityPlayer(player)
				candidate.RoundWindTile = winds[0]
				candidate.SelfWindTile = winds[1]
				candidate.IsParent = winds[1] == 27
				candidate.IsRiichi = riichi
				point := util.CalcPoint(candidate).Point
				if point > 0 && openAllSimples && !openTanyaoEnabled {
					// Upstream always enables kuitan. A positive result here may be
					// tanyao alone or another yaku, so it proves neither outcome.
					truths = append(truths, eligibilityUnknown)
				} else if point > 0 {
					truths = append(truths, eligibilityTrue)
				} else {
					truths = append(truths, eligibilityFalse)
				}
			}
		}
	}
	allTrue, allFalse := len(truths) > 0, len(truths) > 0
	for _, truth := range truths {
		allTrue = allTrue && truth == eligibilityTrue
		allFalse = allFalse && truth == eligibilityFalse
	}
	if allTrue {
		return "eligible"
	}
	if allFalse {
		return "ineligible"
	}
	return "unknown_missing_situational_yaku_context"
}

func baseRonEligibility(
	player *model.PlayerInfo,
	context YakuContextV2,
	ronContext string,
	isKokushi bool,
) string {
	if isKokushi {
		return "eligible"
	}
	switch ronContext {
	case "known_kakan_chankan", "known_houtei":
		return "eligible"
	case "known_ankan_chankan":
		return "ineligible"
	}
	baseline := baselineRonEligibility(player, context)
	if ronContext == "unknown_future" && baseline != "eligible" {
		return "unknown_missing_situational_yaku_context"
	}
	return baseline
}

func mergeEligibility(values []string) string {
	hasUnknown := false
	for _, value := range values {
		if value == "eligible" {
			return "eligible"
		}
		hasUnknown = hasUnknown || value == "unknown_missing_situational_yaku_context"
	}
	if hasUnknown || len(values) == 0 {
		return "unknown_missing_situational_yaku_context"
	}
	return "ineligible"
}

func completionPlayer(request HandStructureRequestV2, completed []int, winTile int) (*model.PlayerInfo, error) {
	melds, err := convertMelds(request.Melds)
	if err != nil {
		return nil, err
	}
	return &model.PlayerInfo{
		HandTiles34: cloneInts(completed),
		Melds:       melds,
		DoraTiles:   []int{},
		NumRedFives: []int{0, 0, 0},
		IsTsumo:     false,
		WinTile:     winTile,
	}, nil
}

func deriveWaits(
	request HandStructureRequestV2,
	families []HandFamilyResultV2,
	decompositions DecompositionSetV2,
) ([]WaitV2, error) {
	byTile := make(map[int]*waitEvidence)
	returned := returnedDecompositionRefs(decompositions)
	for _, family := range families {
		if family.Shanten == nil || *family.Shanten != 0 {
			continue
		}
		for _, effective := range family.EffectiveTiles {
			tile := effective.Tile34
			evidence := byTile[tile]
			if evidence == nil {
				evidence = newWaitEvidence()
				byTile[tile] = evidence
			}
			completed := cloneInts(request.HandTiles34)
			completed[tile]++
			evidence.families[family.Family] = true
			switch family.Family {
			case "standard":
				addStandardWaitEvidence(evidence, request.HandTiles34, completed, tile, returned)
				player, err := completionPlayer(request, completed, tile)
				if err != nil {
					return nil, err
				}
				evidence.eligibilities = append(evidence.eligibilities,
					baseRonEligibility(player, request.YakuContext, request.RonContext, false))
			case "chiitoitsu":
				for _, division := range util.DivideTiles34(cloneInts(completed)) {
					if !division.IsChiitoi || request.HandTiles34[tile] != 1 {
						continue
					}
					evidence.waitTypes["tanki"] = true
					pre := syntheticFamilyDecomposition(request.HandTiles34, "chiitoitsu", 0)
					addMappedRef(evidence, "chiitoitsu", pre.Groups, returned)
					break
				}
				player, err := completionPlayer(request, completed, tile)
				if err != nil {
					return nil, err
				}
				evidence.eligibilities = append(evidence.eligibilities,
					baseRonEligibility(player, request.YakuContext, request.RonContext, false))
			case "kokushi":
				if countUniqueKokushi(request.HandTiles34) == len(kokushiTiles34) {
					evidence.waitTypes["kokushi_thirteen_sided"] = true
				} else {
					evidence.waitTypes["kokushi_single"] = true
				}
				pre := syntheticFamilyDecomposition(request.HandTiles34, "kokushi", 0)
				addMappedRef(evidence, "kokushi", pre.Groups, returned)
				evidence.eligibilities = append(evidence.eligibilities,
					baseRonEligibility(nil, request.YakuContext, request.RonContext, true))
			}
		}
	}
	tiles := make([]int, 0, len(byTile))
	for tile := range byTile {
		tiles = append(tiles, tile)
	}
	sort.Ints(tiles)
	result := make([]WaitV2, 0, len(tiles))
	for _, tile := range tiles {
		evidence := byTile[tile]
		remainingStatus := "blocked_missing_facts"
		var remaining *int
		if request.VisibleCountsComplete {
			value := request.LeftTiles34[tile]
			remainingStatus = "calculated"
			remaining = &value
		}
		result = append(result, WaitV2{
			Tile34:             tile,
			Families:           sortedFamilies(evidence.families),
			WaitTypes:          sortedWaitTypes(evidence.waitTypes),
			RemainingStatus:    remainingStatus,
			Remaining:          remaining,
			BaseRonEligibility: mergeEligibility(evidence.eligibilities),
			DecompositionRefs:  sortedStringSet(evidence.refs),
		})
	}
	return result, nil
}

func countUniqueKokushi(tiles []int) int {
	count := 0
	for _, tile := range kokushiTiles34 {
		if tiles[tile] > 0 {
			count++
		}
	}
	return count
}

func handStructureDiagnostics(decompositions DecompositionSetV2, waits []WaitV2) []string {
	diagnostics := decompositionDiagnostics(decompositions)
	for _, wait := range waits {
		if wait.BaseRonEligibility == "unknown_missing_situational_yaku_context" {
			return append(diagnostics, "ron_eligibility_missing_situational_context")
		}
	}
	return diagnostics
}
