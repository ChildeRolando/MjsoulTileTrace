package main

import "fmt"

// Teaching-only hand consequences. Current legal discards are supplied by the
// native rules pipeline; this routine never enumerates legal game actions.
// Reuse the pinned helper's standard/seven-pairs shanten and the adapter's
// existing kokushi calculation. No yaku, score or model estimate is computed.
func analyzeEfficiency13(r Hand13Request) (Hand13Result, error) {
	if countTiles(r.HandTiles34) != 13-3*len(r.Melds) {
		return Hand13Result{}, fmt.Errorf("expected post-discard hand")
	}
	if !r.VisibleCountsComplete {
		return Hand13Result{}, fmt.Errorf("complete visibility required")
	}
	cache := map[[34]uint8]int{}
	shanten := func(hand []int) int {
		var key [34]uint8
		for i, n := range hand {
			key[i] = uint8(n)
		}
		if n, ok := cache[key]; ok {
			return n
		}
		f := calculateFamilyShanten(hand, len(r.Melds))
		n := f.Standard
		if f.Chiitoitsu != nil && *f.Chiitoitsu < n {
			n = *f.Chiitoitsu
		}
		if f.Kokushi != nil && *f.Kokushi < n {
			n = *f.Kokushi
		}
		cache[key] = n
		return n
	}
	hand := cloneInts(r.HandTiles34)
	owned := ownedTileCounts34(hand, r.Melds)
	base := shanten(hand)
	waits := func(h []int, left []int) []TileCount {
		s := shanten(h)
		result := []TileCount{}
		for t, n := range left {
			if n == 0 {
				continue
			}
			h[t]++
			better := shanten(h) < s
			h[t]--
			if better {
				result = append(result, TileCount{Tile34: t, Count: n})
			}
		}
		return result
	}
	total := func(v []TileCount) int {
		n := 0
		for _, x := range v {
			n += x.Count
		}
		return n
	}
	effective := []int{}
	direct := []TileCount{}
	isDirect := [34]bool{}
	for t := 0; t < 34; t++ {
		if owned[t] >= 4 {
			continue
		}
		hand[t]++
		better := shanten(hand) < base
		hand[t]--
		if better {
			effective = append(effective, t)
			isDirect[t] = true
			direct = append(direct, TileCount{Tile34: t, Count: r.LeftTiles34[t]})
		}
	}
	improves := []ImproveResult{}
	// After accepted riichi the next non-winning draw must be discarded, so it
	// cannot improve this hand by replacing a concealed tile.
	if !r.Riichi {
		baseCount := total(direct)
		for draw, n := range r.LeftTiles34 {
			if n == 0 || isDirect[draw] {
				continue
			}
			hand[draw]++
			left := cloneInts(r.LeftTiles34)
			left[draw]--
			best := baseCount
			var bestWaits []TileCount
			for discard, count := range hand {
				if count == 0 || discard == draw {
					continue
				}
				hand[discard]--
				if shanten(hand) == base {
					w := waits(hand, left)
					if c := total(w); c > best {
						best = c
						bestWaits = w
					}
				}
				hand[discard]++
			}
			hand[draw]--
			if best > baseCount {
				improves = append(improves, ImproveResult{DrawTile34: draw, BestWaits: bestWaits})
			}
		}
	}
	return Hand13Result{CalculationMode: "efficiency-v1", Kind: "hand13_result", RequestID: r.RequestID, ProtocolVersion: protocolVersion, ActionRef: r.ActionRef, StateHash: r.StateHash, Identity: engineIdentity(), Shanten: base, EffectiveTile34: effective, WaitsRemainingStatus: "calculated", WaitsRemaining: direct, Improves: improves, DoraCountStatus: "blocked_missing_facts", Estimates: []UpstreamEstimate{}, Diagnostics: []FactEngineDiagnostic{{Code: "dora_count_blocked_missing_facts"}}}, nil
}
