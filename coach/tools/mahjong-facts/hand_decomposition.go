package main

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strconv"
	"strings"

	"github.com/EndlessCheng/mahjong-helper/util"
)

const maxNonDominatedDecompositions = 64

type DecompositionMetrics struct {
	Valid         bool
	Shanten       int
	CompleteMelds int
	UsableTaatsu  int
	HasHead       int
	FloatingTiles int
}

func appendGroup(groups []ShapeGroup, kind string, tiles ...int) []ShapeGroup {
	next := make([]ShapeGroup, len(groups), len(groups)+1)
	for index, group := range groups {
		next[index] = ShapeGroup{Kind: group.Kind, Tiles34: cloneInts(group.Tiles34)}
	}
	next = append(next, ShapeGroup{Kind: kind, Tiles34: cloneInts(tiles)})
	return next
}

func cloneGroups(groups []ShapeGroup) []ShapeGroup {
	result := make([]ShapeGroup, len(groups))
	for index, group := range groups {
		result[index] = ShapeGroup{Kind: group.Kind, Tiles34: cloneInts(group.Tiles34)}
	}
	return result
}

type compactShapeGroup struct {
	Kind  string
	Tiles [3]int
	Count int
}

func compactGroup(kind string, tiles ...int) compactShapeGroup {
	group := compactShapeGroup{Kind: kind, Count: len(tiles)}
	copy(group.Tiles[:], tiles)
	return group
}

func compactGroupsToShapeGroups(groups []compactShapeGroup) []ShapeGroup {
	result := make([]ShapeGroup, len(groups))
	for index, group := range groups {
		tiles := make([]int, group.Count)
		copy(tiles, group.Tiles[:group.Count])
		result[index] = ShapeGroup{Kind: group.Kind, Tiles34: tiles}
	}
	return result
}

// enumerateStandardPartitions streams compact partitions to visit. It mutates
// only the private counts vector and restores it before returning; no suffix
// tree or per-branch tile slice is allocated.
func enumerateStandardPartitions(
	counts []int,
	groups []compactShapeGroup,
	pairMask uint64,
	visit func([]compactShapeGroup),
) {
	first := -1
	for tile, count := range counts {
		if count > 0 {
			first = tile
			break
		}
	}
	if first < 0 {
		visit(groups)
		return
	}

	consume := func(group compactShapeGroup, nextPairMask uint64) {
		for index := 0; index < group.Count; index++ {
			counts[group.Tiles[index]]--
		}
		next := append(groups, group)
		enumerateStandardPartitions(counts, next, nextPairMask, visit)
		for index := 0; index < group.Count; index++ {
			counts[group.Tiles[index]]++
		}
	}
	consumeHonorQuad := func(tile int) {
		counts[tile] -= 4
		next := append(groups,
			compactGroup("triplet", tile, tile, tile),
			compactGroup("floating", tile),
		)
		enumerateStandardPartitions(counts, next, pairMask, visit)
		counts[tile] += 4
	}

	if first >= 27 {
		switch counts[first] {
		case 1:
			consume(compactGroup("floating", first), pairMask)
		case 2:
			consume(compactGroup("pair_candidate", first, first), pairMask|(uint64(1)<<first))
		case 3:
			consume(compactGroup("triplet", first, first, first), pairMask)
		case 4:
			consumeHonorQuad(first)
		}
		return
	}

	if counts[first] >= 3 {
		consume(compactGroup("triplet", first, first, first), pairMask)
	}
	rank := first % 9
	if first < 27 && rank <= 6 && counts[first+1] > 0 && counts[first+2] > 0 {
		consume(compactGroup("sequence", first, first+1, first+2), pairMask)
	}
	if counts[first] >= 2 && pairMask&(uint64(1)<<first) == 0 {
		consume(compactGroup("pair_candidate", first, first), pairMask|(uint64(1)<<first))
	}
	if first < 27 && rank <= 7 && counts[first+1] > 0 {
		kind := "ryanmen_taatsu"
		if rank == 0 || rank == 7 {
			kind = "penchan_taatsu"
		}
		consume(compactGroup(kind, first, first+1), pairMask)
	}
	if first < 27 && rank <= 6 && counts[first+2] > 0 {
		consume(compactGroup("kanchan_taatsu", first, first+2), pairMask)
	}
	consume(compactGroup("floating", first), pairMask)
}

func compactDecompositionMetrics(
	groups []compactShapeGroup,
	physicalCounts []int,
	openMelds int,
) DecompositionMetrics {
	complete, pairs, taatsu, floating := 0, 0, 0, 0
	var floatingMask uint64
	for _, group := range groups {
		switch group.Kind {
		case "sequence", "triplet":
			complete++
		case "pair_candidate":
			pairs++
		case "ryanmen_taatsu", "kanchan_taatsu", "penchan_taatsu":
			taatsu++
		case "floating":
			floating++
			floatingMask |= uint64(1) << group.Tiles[0]
		}
	}
	hasHead := 0
	if pairs > 0 {
		hasHead = 1
	}
	usableSlots := 4 - openMelds - complete
	if usableSlots < 0 {
		usableSlots = 0
	}
	usableTaatsu := taatsu + pairs - hasHead
	if usableTaatsu > usableSlots {
		usableTaatsu = usableSlots
	}
	shanten := 8 - 2*(openMelds+complete) - taatsu - pairs
	groupCandidates := openMelds + complete + taatsu
	if pairs > 0 {
		groupCandidates += pairs - 1
	} else if floatingMask != 0 {
		onlyQuadRemainders := true
		for tile := 0; tile < 34; tile++ {
			if floatingMask&(uint64(1)<<tile) != 0 && physicalCounts[tile] != 4 {
				onlyQuadRemainders = false
				break
			}
		}
		if onlyQuadRemainders {
			shanten++
		}
	}
	if groupCandidates > 4 {
		shanten += groupCandidates - 4
	}
	honorQuadLowerBound := 0
	for tile := 27; tile < 34; tile++ {
		if physicalCounts[tile] == 4 {
			honorQuadLowerBound++
		}
	}
	if honorQuadLowerBound > 0 && countTiles(physicalCounts)%3 == 2 {
		honorQuadLowerBound--
	}
	if shanten != -1 && shanten < honorQuadLowerBound {
		shanten = honorQuadLowerBound
	}
	return DecompositionMetrics{
		Valid:         true,
		Shanten:       shanten,
		CompleteMelds: complete,
		UsableTaatsu:  usableTaatsu,
		HasHead:       hasHead,
		FloatingTiles: floating,
	}
}

func canonicalizeGroups(groups []ShapeGroup) []ShapeGroup {
	copyGroups := cloneGroups(groups)
	for index := range copyGroups {
		sort.Ints(copyGroups[index].Tiles34)
	}
	sort.Slice(copyGroups, func(left, right int) bool {
		return claimKey(copyGroups[left]) < claimKey(copyGroups[right])
	})
	return copyGroups
}

func claimKey(group ShapeGroup) string {
	parts := make([]string, len(group.Tiles34))
	for index, tile := range group.Tiles34 {
		parts[index] = strconv.Itoa(tile)
	}
	return group.Kind + ":" + strings.Join(parts, ",")
}

func partitionKey(groups []ShapeGroup) string {
	parts := make([]string, len(groups))
	for index, group := range groups {
		parts[index] = claimKey(group)
	}
	return strings.Join(parts, "|")
}

func decompositionMetrics(groups []ShapeGroup, openMelds int) DecompositionMetrics {
	complete, taatsu, floating := 0, 0, 0
	pairKinds := make(map[int]bool)
	physicalCounts := make([]int, 34)
	floatingKinds := make(map[int]bool)
	valid := true
	for _, group := range groups {
		for _, tile := range group.Tiles34 {
			physicalCounts[tile]++
		}
		switch group.Kind {
		case "sequence", "triplet":
			complete++
		case "pair_candidate":
			tile := group.Tiles34[0]
			if pairKinds[tile] {
				valid = false
			}
			pairKinds[tile] = true
		case "ryanmen_taatsu", "kanchan_taatsu", "penchan_taatsu":
			taatsu++
		case "floating":
			floating++
			floatingKinds[group.Tiles34[0]] = true
		}
	}
	if !validHonorGroups(groups, physicalCounts) {
		valid = false
	}
	pairs := len(pairKinds)
	hasHead := 0
	if pairs > 0 {
		hasHead = 1
	}
	usableSlots := 4 - openMelds - complete
	if usableSlots < 0 {
		usableSlots = 0
	}
	usableTaatsu := taatsu + pairs - hasHead
	if usableTaatsu > usableSlots {
		usableTaatsu = usableSlots
	}
	shanten := 8 - 2*(openMelds+complete) - taatsu - pairs
	groupCandidates := openMelds + complete + taatsu
	if pairs > 0 {
		groupCandidates += pairs - 1
	} else if len(floatingKinds) > 0 {
		onlyQuadRemainders := true
		for tile := range floatingKinds {
			if physicalCounts[tile] != 4 {
				onlyQuadRemainders = false
				break
			}
		}
		if onlyQuadRemainders {
			shanten++
		}
	}
	if groupCandidates > 4 {
		shanten += groupCandidates - 4
	}
	honorQuadLowerBound := 0
	for tile := 27; tile < 34; tile++ {
		if physicalCounts[tile] == 4 {
			honorQuadLowerBound++
		}
	}
	if honorQuadLowerBound > 0 && countTiles(physicalCounts)%3 == 2 {
		honorQuadLowerBound--
	}
	if shanten != -1 && shanten < honorQuadLowerBound {
		shanten = honorQuadLowerBound
	}
	return DecompositionMetrics{
		Valid:         valid,
		Shanten:       shanten,
		CompleteMelds: complete,
		UsableTaatsu:  usableTaatsu,
		HasHead:       hasHead,
		FloatingTiles: floating,
	}
}

func validHonorGroups(groups []ShapeGroup, physicalCounts []int) bool {
	type honorGroups struct {
		triplets int
		pairs    int
		floating int
	}
	byTile := make([]honorGroups, 34)
	for _, group := range groups {
		if len(group.Tiles34) == 0 || group.Tiles34[0] < 27 {
			continue
		}
		tile := group.Tiles34[0]
		switch group.Kind {
		case "triplet":
			byTile[tile].triplets++
		case "pair_candidate":
			byTile[tile].pairs++
		case "floating":
			byTile[tile].floating++
		default:
			return false
		}
	}
	for tile := 27; tile < 34; tile++ {
		got := byTile[tile]
		switch physicalCounts[tile] {
		case 0:
			if got != (honorGroups{}) {
				return false
			}
		case 1:
			if got != (honorGroups{floating: 1}) {
				return false
			}
		case 2:
			if got != (honorGroups{pairs: 1}) {
				return false
			}
		case 3:
			if got != (honorGroups{triplets: 1}) {
				return false
			}
		case 4:
			if got != (honorGroups{triplets: 1, floating: 1}) {
				return false
			}
		default:
			return false
		}
	}
	return true
}

func dominates(left, right DecompositionMetrics) bool {
	if left.Shanten != right.Shanten {
		return left.Shanten < right.Shanten
	}
	noWorse := left.CompleteMelds >= right.CompleteMelds &&
		left.UsableTaatsu >= right.UsableTaatsu &&
		left.HasHead >= right.HasHead &&
		left.FloatingTiles <= right.FloatingTiles
	strict := left.CompleteMelds > right.CompleteMelds ||
		left.UsableTaatsu > right.UsableTaatsu ||
		left.HasHead > right.HasHead ||
		left.FloatingTiles < right.FloatingTiles
	return noWorse && strict
}

func stableDecompositionRef(family, key string) string {
	digest := sha256.Sum256([]byte(family + "|" + key))
	return family + ":" + hex.EncodeToString(digest[:])
}

func assertStandardDecompositionInput(tiles []int, openMelds int) {
	if len(tiles) != 34 {
		panic("standard decomposition requires 34 tile counts")
	}
	if openMelds < 0 || openMelds > 4 {
		panic("standard decomposition open meld count must be between zero and four")
	}
	for _, count := range tiles {
		if count < 0 || count > 4 {
			panic("standard decomposition tile counts must be between zero and four")
		}
	}
	if countTiles(tiles) != 13-3*openMelds {
		panic("standard decomposition concealed tile count does not match open meld count")
	}
}

func nonDominatedStandardDecompositions(tiles []int, openMelds int) []DecompositionV2 {
	assertStandardDecompositionInput(tiles, openMelds)
	target := util.CalculateShantenOfNormal(cloneInts(tiles), countTiles(tiles))
	unique := make(map[string][]ShapeGroup)
	enumerateStandardPartitions(cloneInts(tiles), make([]compactShapeGroup, 0, countTiles(tiles)), 0, func(partition []compactShapeGroup) {
		metrics := compactDecompositionMetrics(partition, tiles, openMelds)
		if !metrics.Valid || metrics.Shanten != target {
			return
		}
		canonical := canonicalizeGroups(compactGroupsToShapeGroups(partition))
		unique[partitionKey(canonical)] = canonical
	})

	keys := make([]string, 0, len(unique))
	metrics := make(map[string]DecompositionMetrics, len(unique))
	for key, groups := range unique {
		keys = append(keys, key)
		metrics[key] = decompositionMetrics(groups, openMelds)
	}
	sort.Strings(keys)

	kept := make([]string, 0, len(keys))
	for _, candidate := range keys {
		dominated := false
		for _, other := range keys {
			if candidate != other && dominates(metrics[other], metrics[candidate]) {
				dominated = true
				break
			}
		}
		if !dominated {
			kept = append(kept, candidate)
		}
	}

	results := make([]DecompositionV2, 0, len(kept))
	for _, key := range kept {
		results = append(results, DecompositionV2{
			DecompositionRef: stableDecompositionRef("standard", key),
			Family:           "standard",
			Shanten:          target,
			Groups:           cloneGroups(unique[key]),
		})
	}
	return results
}

func isKokushiTile(tile int) bool {
	for _, candidate := range kokushiTiles34 {
		if tile == candidate {
			return true
		}
	}
	return false
}

func syntheticFamilyDecomposition(tiles []int, family string, shanten int) DecompositionV2 {
	groups := make([]ShapeGroup, 0, countTiles(tiles))
	for tile, count := range tiles {
		remaining := count
		if remaining >= 2 && (family == "chiitoitsu" || (family == "kokushi" && isKokushiTile(tile))) {
			groups = appendGroup(groups, "pair_candidate", tile, tile)
			remaining -= 2
		}
		for copyIndex := 0; copyIndex < remaining; copyIndex++ {
			groups = appendGroup(groups, "floating", tile)
		}
	}
	groups = canonicalizeGroups(groups)
	key := partitionKey(groups)
	return DecompositionV2{
		DecompositionRef: stableDecompositionRef(family, key),
		Family:           family,
		Shanten:          shanten,
		Groups:           groups,
	}
}

func familyOrder(family string) int {
	switch family {
	case "standard":
		return 0
	case "chiitoitsu":
		return 1
	case "kokushi":
		return 2
	default:
		return 3
	}
}

func canonicalDecompositions(items []DecompositionV2) []DecompositionV2 {
	unique := make(map[string]DecompositionV2)
	for _, item := range items {
		item.Groups = canonicalizeGroups(item.Groups)
		key := item.Family + "|" + partitionKey(item.Groups)
		previous, exists := unique[key]
		if !exists || item.DecompositionRef < previous.DecompositionRef {
			unique[key] = item
		}
	}
	result := make([]DecompositionV2, 0, len(unique))
	for _, item := range unique {
		result = append(result, item)
	}
	sort.Slice(result, func(left, right int) bool {
		leftOrder, rightOrder := familyOrder(result[left].Family), familyOrder(result[right].Family)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		leftKey, rightKey := partitionKey(result[left].Groups), partitionKey(result[right].Groups)
		if leftKey != rightKey {
			return leftKey < rightKey
		}
		return result[left].DecompositionRef < result[right].DecompositionRef
	})
	return result
}

func claimGroupsByKey(item DecompositionV2) (map[string]ShapeGroup, map[string]int) {
	claims := make(map[string]ShapeGroup)
	counts := make(map[string]int)
	for _, group := range item.Groups {
		key := claimKey(group)
		counts[key]++
		if _, exists := claims[key]; !exists {
			claims[key] = ShapeGroup{Kind: group.Kind, Tiles34: cloneInts(group.Tiles34)}
		}
	}
	return claims, counts
}

func decompositionClaims(
	all []DecompositionV2,
	returned []DecompositionV2,
) ([]ShapeGroup, []AlternativeClaimV2) {
	if len(all) == 0 {
		return []ShapeGroup{}, []AlternativeClaimV2{}
	}
	claimByKey := make(map[string]ShapeGroup)
	countsByItem := make([]map[string]int, len(all))
	for index, item := range all {
		groups, counts := claimGroupsByKey(item)
		countsByItem[index] = counts
		for key, group := range groups {
			claimByKey[key] = group
		}
	}

	keys := make([]string, 0, len(claimByKey))
	for key := range claimByKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	invariants := make([]ShapeGroup, 0)
	alternatives := make([]AlternativeClaimV2, 0)
	for _, key := range keys {
		group := claimByKey[key]
		minimumCount := countsByItem[0][key]
		maximumCount := minimumCount
		for _, counts := range countsByItem[1:] {
			if counts[key] < minimumCount {
				minimumCount = counts[key]
			}
			if counts[key] > maximumCount {
				maximumCount = counts[key]
			}
		}
		for occurrence := 0; occurrence < minimumCount; occurrence++ {
			invariants = append(invariants, ShapeGroup{Kind: group.Kind, Tiles34: cloneInts(group.Tiles34)})
		}
		for occurrence := minimumCount; occurrence < maximumCount; occurrence++ {
			refs := make([]string, 0)
			for _, item := range returned {
				_, counts := claimGroupsByKey(item)
				if counts[key] > occurrence {
					refs = append(refs, item.DecompositionRef)
				}
			}
			if len(refs) == 0 {
				continue
			}
			sort.Strings(refs)
			alternatives = append(alternatives, AlternativeClaimV2{
				Kind:              group.Kind,
				Tiles34:           cloneInts(group.Tiles34),
				DecompositionRefs: refs,
			})
		}
	}
	return invariants, alternatives
}

func buildDecompositionSet(items []DecompositionV2) DecompositionSetV2 {
	all := canonicalDecompositions(items)
	selected := make(map[int]bool)
	if len(all) > maxNonDominatedDecompositions {
		seenFamily := make(map[string]bool)
		for index, item := range all {
			if !seenFamily[item.Family] {
				seenFamily[item.Family] = true
				selected[index] = true
			}
		}
		for index := range all {
			if len(selected) == maxNonDominatedDecompositions {
				break
			}
			selected[index] = true
		}
	} else {
		for index := range all {
			selected[index] = true
		}
	}
	returned := make([]DecompositionV2, 0, len(selected))
	for index, item := range all {
		if !selected[index] {
			continue
		}
		returned = append(returned, DecompositionV2{
			DecompositionRef: item.DecompositionRef,
			Family:           item.Family,
			Shanten:          item.Shanten,
			Groups:           cloneGroups(item.Groups),
		})
	}
	invariants, alternatives := decompositionClaims(all, returned)
	return DecompositionSetV2{
		Status:            "calculated",
		TotalNonDominated: len(all),
		Truncated:         len(all) > len(returned),
		Items:             returned,
		InvariantClaims:   invariants,
		AlternativeClaims: alternatives,
	}
}

func decompositionDiagnostics(set DecompositionSetV2) []string {
	if set.Truncated {
		return []string{"truncated_non_dominated_decompositions"}
	}
	return []string{}
}

func bestFamilyDecompositions(
	tiles []int,
	openMelds int,
	families []HandFamilyResultV2,
	overallShanten int,
) []DecompositionV2 {
	items := make([]DecompositionV2, 0)
	for _, family := range families {
		if family.Shanten == nil || *family.Shanten != overallShanten {
			continue
		}
		switch family.Family {
		case "standard":
			items = append(items, nonDominatedStandardDecompositions(tiles, openMelds)...)
		case "chiitoitsu", "kokushi":
			items = append(items, syntheticFamilyDecomposition(tiles, family.Family, overallShanten))
		}
	}
	return items
}
