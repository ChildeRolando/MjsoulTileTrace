package main

import (
	"github.com/EndlessCheng/mahjong-helper/util"
	"github.com/EndlessCheng/mahjong-helper/util/model"
	"testing"
	"time"
)

func TestTraceManualAndUpstream(t *testing.T) {
	cases := []struct {
		name, hand, win string
		melds           []model.Meld
		red             []int
		want            int
		yakuman         bool
		noYaku          bool
	}{
		{"pinfu_tsumo", "123456m 234p 678s 22p", "4m", nil, []int{0, 0, 0}, 1500, false, false},
		{"seven_pairs", "11m 22m 33p 44p 55s 66s 77z", "7z", nil, []int{0, 0, 0}, 3200, false, false},
		{"red_bonus", "123456m 234p 678s 22p", "4m", nil, []int{1, 0, 0}, 2700, false, false},
		{"open_east", "123m 456p 789s 22p", "3m", []model.Meld{{MeldType: model.MeldTypePon, Tiles: []int{27, 27, 27}}}, []int{0, 0, 0}, 1100, false, false},
		{"open_no_yaku", "456m 789p 123s 22p", "4m", []model.Meld{{MeldType: model.MeldTypeChi, Tiles: []int{0, 1, 2}}}, []int{0, 0, 0}, 0, false, true},
		{"yakuman", "11122233344455z", "5z", nil, []int{0, 0, 0}, 0, true, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &model.PlayerInfo{HandTiles34: util.MustStrToTiles34(c.hand), Melds: c.melds, NumRedFives: c.red, IsTsumo: true, WinTile: util.MustStrToTile34(c.win), RoundWindTile: 27, SelfWindTile: 28}
			tr := util.ResearchCalcPoint(p)
			raw := util.CalcPoint(p)
			t.Logf("fixture_score_calls=2 trace_status=%s", tr.Status)
			if tr.Point == nil || *tr.Point != raw.Point {
				t.Fatalf("trace parity: %+v raw=%d", tr, raw.Point)
			}
			if c.noYaku {
				if tr.Status != "no_yaku" || *tr.Point != 0 {
					t.Fatalf("no yaku: %+v", tr)
				}
				return
			}
			if tr.Status != "supported" {
				t.Fatalf("unsupported: %+v", tr)
			}
			if c.yakuman {
				if tr.YakumanTimes < 1 || tr.Han != nil || tr.Fu != nil {
					t.Fatalf("yakuman trace: %+v", tr)
				}
				return
			}
			if *tr.Point != c.want || tr.Han == nil || tr.Fu == nil {
				t.Fatalf("manual expected %d got %+v", c.want, tr)
			}
		})
	}
}
func TestNoPeekNonreplacementTieAndAbsorb(t *testing.T) {
	if secondWeight(2, 34, 34) != 1 || secondWeight(2, 34, 4) != 2 {
		t.Fatal("physical red draw decrement")
	}
	point, win := absorbingMass(1500, 10)
	if point != 13500 || win != 9 {
		t.Fatal("first-draw absorption")
	}
	ds := []*Discard{{Variant: 2, PointMass: 10, WinMass: 1}, {Variant: 3, PointMass: 10, WinMass: 3}, {Variant: 4, PointMass: 9, WinMass: 9}}
	best, ties, samePolicyWin := choosePolicy(ds)
	if best != 10 || len(ties) != 2 || ties[0] != 2 || ties[1] != 3 || samePolicyWin != 1 {
		t.Fatal("single first-visible policy or ties")
	}
	if best == 19 {
		t.Fatal("would be illegally optimizing separately for each second draw")
	}
}
func TestUnavailableAndBudget(t *testing.T) {
	p := &model.PlayerInfo{HandTiles34: util.MustStrToTiles34("19m 19p 19s 1234567z 1m"), NumRedFives: []int{0, 0, 0}, IsTsumo: true, WinTile: 0, RoundWindTile: 27, SelfWindTile: 28}
	tr := util.ResearchCalcPoint(p)
	if tr.Status != "unknown" || tr.Point != nil {
		t.Fatalf("kokushi unknown: %+v", tr)
	}
	cnt := &Counters{Shape: maxShape}
	e := &Eval{cnt: cnt, batch: time.Now(), start: time.Now()}
	defer func() {
		if _, ok := recover().(stop); !ok {
			t.Fatal("shape limit not enforced")
		}
	}()
	e.shape()
}
