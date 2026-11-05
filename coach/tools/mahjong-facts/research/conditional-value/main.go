package main

import (
	"encoding/json"
	"fmt"
	"github.com/EndlessCheng/mahjong-helper/util"
	"github.com/EndlessCheng/mahjong-helper/util/model"
	"os"
	"time"
)

type Basic struct {
	Status    string `json:"status"`
	Shanten   *int   `json:"shanten"`
	Unseen    *int   `json:"unseenTotal"`
	Dora      *int   `json:"doraCount"`
	Effective []struct {
		Tile   string `json:"tile"`
		Unseen *int   `json:"unseen"`
	} `json:"effectiveTiles"`
}
type Candidate struct {
	Action  string `json:"actionRef"`
	Variant int    `json:"variant"`
	Basic   Basic  `json:"basic"`
}
type Case struct {
	Index      int         `json:"caseIndex"`
	Selected   bool        `json:"selected"`
	Hand       []int       `json:"hand37"`
	Unseen     []int       `json:"unseen37"`
	OwnMeld    int         `json:"ownMeldCount"`
	Riichi     string      `json:"riichiStatus"`
	Round      string      `json:"roundWind"`
	Seat       string      `json:"selfWind"`
	Dealer     bool        `json:"dealer"`
	Indicators []int       `json:"doraIndicators"`
	Candidates []Candidate `json:"candidates"`
}
type Input struct {
	Cases []Case `json:"cases"`
}

func tile(x int) int {
	if x >= 34 {
		return (x-34)*9 + 4
	}
	return x
}
func collapse(x []int) []int {
	z := make([]int, 34)
	for i, c := range x {
		z[tile(i)] += c
	}
	return z
}
func parseTile(s string) int {
	if len(s) != 2 || s[0] < '1' || s[0] > '9' {
		return -1
	}
	n := int(s[0] - '1')
	switch s[1] {
	case 'm':
		return n
	case 'p':
		return n + 9
	case 's':
		return n + 18
	case 'z':
		if n < 7 {
			return n + 27
		}
	}
	return -1
}
func wind(s string) int {
	switch s {
	case "E":
		return 27
	case "S":
		return 28
	case "W":
		return 29
	case "N":
		return 30
	}
	return -1
}
func cp(x []int) []int { return append([]int{}, x...) }
func main() {
	if len(os.Args) != 3 {
		panic("input output")
	}
	start := time.Now()
	b, e := os.ReadFile(os.Args[1])
	if e != nil {
		panic(e)
	}
	var in Input
	if json.Unmarshal(b, &in) != nil || len(in.Cases) != 200 {
		panic("invalid input")
	}
	rows := []any{}
	scores, shapes, checked, mismatch := 0, 0, 0, 0
	for _, c := range in.Cases {
		if !c.Selected {
			continue
		}
		for _, z := range c.Candidates {
			row := map[string]any{"caseIndex": c.Index, "actionRef": z.Action, "baselineShanten": z.Basic.Shanten, "baselineUnseen": z.Basic.Unseen, "baselineDora": z.Basic.Dora, "enumeration": "not_enumerated", "scoreStatus": "not_enumerated"}
			h := cp(c.Hand)
			if len(h) != 37 || len(c.Unseen) != 37 || z.Variant < 0 || z.Variant >= 37 || h[z.Variant] < 1 {
				panic("invalid tiles")
			}
			h[z.Variant]--
			reason := ""
			switch {
			case c.OwnMeld > 0:
				reason = "unsupported_own_meld"
			case c.Riichi != "none":
				reason = "unsupported_self_riichi_or_unknown"
			case wind(c.Round) < 0 || wind(c.Seat) < 0 || c.Dealer != (c.Seat == "E"):
				reason = "unknown_wind_or_dealer"
			case z.Basic.Status != "available" || z.Basic.Shanten == nil || z.Basic.Unseen == nil:
				reason = "unknown_baseline"
			}
			if reason != "" {
				row["enumeration"] = reason
				rows = append(rows, row)
				continue
			}
			h34 := collapse(h)
			sh, waits := util.CalculateShantenAndWaits13(h34, collapse(c.Unseen))
			sum := 0
			for _, v := range waits {
				sum += v
			}
			checked++
			expectedWaits := map[int]int{}
			validWaits := true
			for _, e := range z.Basic.Effective {
				t := parseTile(e.Tile)
				if t < 0 || e.Unseen == nil {
					validWaits = false
					break
				}
				if *e.Unseen > 0 {
					expectedWaits[t] = *e.Unseen
				}
			}
			actualWaits := map[int]int{}
			for t, n := range waits {
				if n > 0 {
					actualWaits[t] = n
				}
			}
			if len(expectedWaits) != len(actualWaits) {
				validWaits = false
			}
			for t, n := range expectedWaits {
				if actualWaits[t] != n {
					validWaits = false
				}
			}
			if sh != *z.Basic.Shanten || sum != *z.Basic.Unseen || !validWaits {
				mismatch++
				row["enumeration"] = "baseline_mismatch"
				row["observedShanten"] = sh
				row["observedUnseen"] = sum
				rows = append(rows, row)
				continue
			}
			if sh > 1 {
				row["enumeration"] = "not_enumerated_above_one_shanten"
				rows = append(rows, row)
				continue
			}
			var draws []int
			inter, win := -1, -1
			done := false
			for a := 0; a < 37 && !done; a++ {
				if c.Unseen[a] < 1 || h34[tile(a)] >= 4 {
					continue
				}
				h[a]++
				shapes++
				if util.IsAgari(collapse(h)) {
					draws = []int{a}
					win = a
					done = true
					break
				}
				for d := 0; d < 37 && !done; d++ {
					if h[d] == 0 {
						continue
					}
					h[d]--
					h13 := collapse(h)
					if util.CalculateShanten(h13) <= 0 {
						for b := 0; b < 37; b++ {
							avail := c.Unseen[b]
							if b == a {
								avail--
							}
							if avail <= 0 || h13[tile(b)] >= 4 {
								continue
							}
							h[b]++
							shapes++
							if util.IsAgari(collapse(h)) {
								draws = []int{a, b}
								inter = d
								win = b
								done = true
								break
							}
							h[b]--
						}
					}
					if !done {
						h[d]++
					}
				}
				if !done {
					h[a]--
				}
			}
			if !done {
				row["enumeration"] = "partial_no_witness_found"
				rows = append(rows, row)
				continue
			}
			if scores >= 2000 {
				row["enumeration"] = "truncated_scoring_cap"
				rows = append(rows, row)
				continue
			}
			n := 0
			for _, v := range h {
				n += v
			}
			if n != 14 {
				panic("bad complete hand")
			}
			p := &model.PlayerInfo{HandTiles34: collapse(h), NumRedFives: []int{h[34], h[35], h[36]}, IsTsumo: true, WinTile: tile(win), RoundWindTile: wind(c.Round), SelfWindTile: wind(c.Seat), IsParent: c.Dealer, DoraTiles: model.DoraList(c.Indicators, false)}
			res := util.CalcPoint(p)
			scores++
			status := "scorer_zero_unknown"
			if res.Point > 0 {
				status = "supported_helper_point"
			}
			row["enumeration"] = "one_deterministic_witness_partial"
			row["scoreStatus"] = status
			row["point"] = res.Point
			row["drawVariants"] = draws
			row["intermediateDiscardVariant"] = inter
			row["completedHand37"] = h
			row["winTile34"] = tile(win)
			row["retainedRedFives"] = p.NumRedFives
			row["doraTiles34"] = p.DoraTiles
			row["hypothesis"] = map[string]any{"win": "tsumo", "ron": false, "riichi": false, "doubleRiichi": false, "ippatsu": false, "uraAssumed": false, "additionalDoraIndicators": false, "opponentActions": false, "honbaAndRiichiSticksIncluded": false, "roundWind": c.Round, "selfWind": c.Seat, "dealer": c.Dealer}
			rows = append(rows, row)
		}
	}
	out := map[string]any{"schema": "conditional-value-witnesses/v1", "rows": rows, "scoringEvaluations": scores, "maxScoringEvaluations": 2000, "shapeChecks": shapes, "parityChecked": checked, "parityMismatch": mismatch, "elapsedMs": time.Since(start).Milliseconds(), "limitations": []string{"closed no-meld, non-riichi, tsumo only; no situational yaku, ura or new indicator", "single first witness per candidate, non-exhaustive, no ranking; 0 not treated as no-yaku", "native helper does not expose han/fu/yaku breakdown; kokushi unsupported"}}
	data, e := json.MarshalIndent(out, "", "  ")
	if e != nil {
		panic(e)
	}
	if e = os.WriteFile(os.Args[2], append(data, '\n'), 0600); e != nil {
		panic(e)
	}
	fmt.Printf("rows %d scoring %d parity %d mismatch %d elapsed_ms %d\n", len(rows), scores, checked, mismatch, time.Since(start).Milliseconds())
}
