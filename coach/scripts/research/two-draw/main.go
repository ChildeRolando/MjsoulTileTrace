package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"github.com/EndlessCheng/mahjong-helper/util"
	"os"
	"sort"
	"time"
)

type Tile struct {
	ID  string `json:"id"`
	Red bool   `json:"red"`
}
type Eff struct {
	Tile   string `json:"tile"`
	Unseen *int   `json:"unseen"`
}
type Basic struct {
	Status    string `json:"status"`
	Shanten   int    `json:"shanten"`
	Effective []Eff  `json:"effectiveTiles"`
	Total     *int   `json:"unseenTotal"`
}
type Candidate struct {
	Ref    string `json:"actionRef"`
	Tile   Tile   `json:"tile"`
	Tile34 int    `json:"tile34"`
	Mode   string `json:"discardMode"`
	Basic  Basic  `json:"basic"`
}
type Scene struct {
	Index      int         `json:"index"`
	CaseRef    string      `json:"caseRef"`
	Riichi     string      `json:"ownRiichi"`
	MeldCount  int         `json:"ownMeldCount"`
	Hand       []int       `json:"rootHand34"`
	MeldTiles  []int       `json:"ownMeldTiles34"`
	Unseen     []int       `json:"unseen34"`
	Candidates []Candidate `json:"candidates"`
}
type Input struct {
	Cases []Scene `json:"cases"`
}
type Counts struct {
	ShapeRequests         int64 `json:"shapeRequests"`
	CacheHits             int64 `json:"cacheHits"`
	NormalCalls           int64 `json:"normalCalls"`
	ChiitoiCalls          int64 `json:"chiitoiCalls"`
	FirstDrawBranches     int64 `json:"firstDrawBranches"`
	DiscardBranches       int64 `json:"hypotheticalDiscardBranches"`
	SecondDrawTransitions int64 `json:"secondDrawTransitions"`
	First14Checks         int64 `json:"first14Checks"`
	First14Mismatch       int64 `json:"first14Mismatch"`
}
type Evaluator struct {
	meld  int
	cache map[[34]uint8]int
	stats Counts
}

func (e *Evaluator) shape(h []int) int {
	e.stats.ShapeRequests++
	var key [34]uint8
	n := 0
	for i, x := range h {
		if x < 0 || x > 4 {
			panic("invalid count")
		}
		key[i] = uint8(x)
		n += x
	}
	if s, ok := e.cache[key]; ok {
		e.stats.CacheHits++
		return s
	}
	e.stats.NormalCalls++
	t := append([]int(nil), h...)
	s := util.CalculateShantenOfNormal(t, n)
	if e.meld == 0 {
		e.stats.ChiitoiCalls++
		c := util.CalculateShantenOfChiitoi(append([]int(nil), h...))
		if c < s {
			s = c
		}
	}
	e.cache[key] = s
	return s
}
func id(t int) string {
	if t < 27 {
		return fmt.Sprintf("%d%c", t%9+1, "mps"[t/9])
	}
	return fmt.Sprintf("%dz", t-26)
}
func total(x []int) int {
	n := 0
	for _, v := range x {
		n += v
	}
	return n
}

type Oracle func([]int) int
type Branch struct {
	Draw             string   `json:"firstDraw"`
	Count            int      `json:"unseenCount"`
	Absorbed         bool     `json:"absorbed"`
	BestSecondWeight int      `json:"bestSecondWeight"`
	DiscardTies      []string `json:"hypotheticalDiscardTies,omitempty"`
}
type Probability struct {
	Target      int      `json:"target"`
	Numerator   int      `json:"numerator"`
	Denominator int      `json:"denominator"`
	Probability float64  `json:"probability"`
	Branches    []Branch `json:"branches"`
}

func optimize(hand, unseen []int, target int, shape Oracle, stats *Counts) Probability {
	N := total(unseen)
	if N < 2 {
		panic("insufficient pool")
	}
	ans := Probability{Target: target, Denominator: N * (N - 1), Branches: []Branch{}}
	for x, nx := range unseen {
		if nx <= 0 {
			continue
		}
		stats.FirstDrawBranches++
		hand[x]++
		s := shape(hand)
		branch := Branch{Draw: id(x), Count: nx}
		if s <= target {
			branch.Absorbed = true
			branch.BestSecondWeight = N - 1
			ans.Numerator += nx * (N - 1)
			hand[x]--
			ans.Branches = append(ans.Branches, branch)
			continue
		}
		best := -1
		ties := []string{}
		for d, v := range hand {
			if v == 0 {
				continue
			}
			stats.DiscardBranches++
			hand[d]--
			w := 0
			for y, ny := range unseen {
				ny2 := ny
				if y == x {
					ny2--
				}
				if ny2 <= 0 {
					continue
				}
				stats.SecondDrawTransitions++
				hand[y]++
				if shape(hand) <= target {
					w += ny2
				}
				hand[y]--
			}
			hand[d]++
			if w > best {
				best = w
				ties = []string{id(d)}
			} else if w == best {
				ties = append(ties, id(d))
			}
		}
		if best < 0 {
			panic("no hypothetical discard")
		}
		branch.BestSecondWeight = best
		branch.DiscardTies = ties
		ans.Numerator += nx * best
		hand[x]--
		ans.Branches = append(ans.Branches, branch)
	}
	ans.Probability = float64(ans.Numerator) / float64(ans.Denominator)
	return ans
}
func main() {
	mode := flag.String("mode", "parity", "parity or full")
	in := flag.String("input", "", "blind input json")
	out := flag.String("out", "", "output json")
	flag.Parse()
	if *in == "" || *out == "" || (*mode != "parity" && *mode != "full") {
		panic("arguments")
	}
	data, err := os.ReadFile(*in)
	if err != nil {
		panic(err)
	}
	var x Input
	if err = json.Unmarshal(data, &x); err != nil {
		panic(err)
	}
	start := time.Now()
	output := []map[string]any{}
	aggregate := Counts{}
	mismatches := 0
	for _, scene := range x.Cases {
		es := &Evaluator{meld: scene.MeldCount, cache: map[[34]uint8]int{}}
		if len(scene.Hand) != 34 || len(scene.Unseen) != 34 || len(scene.MeldTiles) != 34 || scene.Riichi != "none" || total(scene.Unseen) < 2 {
			output = append(output, map[string]any{"index": scene.Index, "status": "unavailable_required_context"})
			continue
		}
		minS := 100
		for _, c := range scene.Candidates {
			if c.Basic.Status != "available" || c.Basic.Total == nil {
				panic("unknown baseline")
			}
			if c.Basic.Shanten < minS {
				minS = c.Basic.Shanten
			}
		}
		targets := []int{max(-1, minS-1), max(-1, minS-2)}
		if targets[0] == targets[1] {
			targets = targets[:1]
		}
		rows := []map[string]any{}
		sceneMismatch := 0
		for _, cand := range scene.Candidates {
			hand := append([]int(nil), scene.Hand...)
			if hand[cand.Tile34] < 1 {
				panic("root discard missing")
			}
			hand[cand.Tile34]--
			base := es.shape(hand)
			if base != cand.Basic.Shanten {
				sceneMismatch++
				mismatches++
			}
			eff := []Eff{}
			sum := 0
			for t := 0; t < 34; t++ {
				if hand[t]+scene.MeldTiles[t] >= 4 {
					continue
				}
				hand[t]++
				s := es.shape(hand)
				hand[t]--
				if s < base {
					n := scene.Unseen[t]
					eff = append(eff, Eff{Tile: id(t), Unseen: &n})
					sum += n
				}
			}
			same := len(eff) == len(cand.Basic.Effective) && sum == *cand.Basic.Total
			if same {
				for i := range eff {
					a, b := eff[i], cand.Basic.Effective[i]
					if a.Tile != b.Tile || b.Unseen == nil || *a.Unseen != *b.Unseen {
						same = false
						break
					}
				}
			}
			if !same {
				sceneMismatch++
				mismatches++
			}
			checks := 0
			for t, n := range scene.Unseen {
				if n <= 0 {
					continue
				}
				hand[t]++
				v := es.shape(hand)
				if v != -1 {
					best := 100
					for d, c := range hand {
						if c == 0 {
							continue
						}
						hand[d]--
						s := es.shape(hand)
						hand[d]++
						if s < best {
							best = s
						}
					}
					checks++
					es.stats.First14Checks++
					if v != best {
						es.stats.First14Mismatch++
						sceneMismatch++
						mismatches++
					}
				}
				hand[t]--
			}
			row := map[string]any{"actionRef": cand.Ref, "tile": cand.Tile, "discardMode": cand.Mode, "baseShanten": base, "basicShanten": cand.Basic.Shanten, "basicUkeire": *cand.Basic.Total, "computedUkeire": sum, "effectiveTilesMatch": same, "first14Checks": checks}
			if *mode == "full" && sceneMismatch == 0 {
				probs := []Probability{}
				for _, target := range targets {
					probs = append(probs, optimize(hand, scene.Unseen, target, es.shape, &es.stats))
				}
				row["targets"] = probs
			}
			rows = append(rows, row)
		}
		aggregate.ShapeRequests += es.stats.ShapeRequests
		aggregate.CacheHits += es.stats.CacheHits
		aggregate.NormalCalls += es.stats.NormalCalls
		aggregate.ChiitoiCalls += es.stats.ChiitoiCalls
		aggregate.FirstDrawBranches += es.stats.FirstDrawBranches
		aggregate.DiscardBranches += es.stats.DiscardBranches
		aggregate.SecondDrawTransitions += es.stats.SecondDrawTransitions
		aggregate.First14Checks += es.stats.First14Checks
		aggregate.First14Mismatch += es.stats.First14Mismatch
		output = append(output, map[string]any{"index": scene.Index, "caseRef": scene.CaseRef, "status": map[bool]string{true: "baseline_mismatch", false: "available"}[sceneMismatch > 0], "mismatches": sceneMismatch, "ownMeldCount": scene.MeldCount, "unseenTotal": total(scene.Unseen), "sceneMinShanten": minS, "targets": targets, "candidates": rows, "counts": es.stats})
	}
	sort.SliceStable(output, func(i, j int) bool { return false })
	result := map[string]any{"version": "two-draw-local/v1", "mode": *mode, "sampleCases": len(x.Cases), "mismatches": mismatches, "counts": aggregate, "elapsedMs": time.Since(start).Milliseconds(), "scenes": output}
	b, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		panic(err)
	}
	if err = os.WriteFile(*out, append(b, '\n'), 0600); err != nil {
		panic(err)
	}
	fmt.Printf("mode=%s cases=%d mismatches=%d normal=%d chiitoi=%d elapsedMs=%d\n", *mode, len(x.Cases), mismatches, aggregate.NormalCalls, aggregate.ChiitoiCalls, time.Since(start).Milliseconds())
}
