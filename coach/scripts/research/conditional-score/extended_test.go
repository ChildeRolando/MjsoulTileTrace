package main

import (
	"encoding/json"
	"github.com/EndlessCheng/mahjong-helper/util"
	"github.com/EndlessCheng/mahjong-helper/util/model"
	"testing"
	"time"
)

func TestDoubleWindAndAnkanManual(t *testing.T) {
	hand := util.MustStrToTiles34("123m 456p 789s 22p")
	for _, z := range []struct {
		name          string
		meld          int
		seat          int
		dealer        bool
		want, han, fu int
		yakuhai       int
	}{{"double_wind", model.MeldTypePon, 27, true, 3000, 2, 30, 2}, {"concealed_kan", model.MeldTypeAnkan, 28, false, 4000, 2, 60, 1}} {
		t.Run(z.name, func(t *testing.T) {
			tiles := []int{27, 27, 27}
			if z.meld == model.MeldTypeAnkan {
				tiles = append(tiles, 27)
			}
			p := &model.PlayerInfo{HandTiles34: append([]int(nil), hand...), Melds: []model.Meld{{MeldType: z.meld, Tiles: tiles}}, NumRedFives: []int{0, 0, 0}, IsTsumo: true, WinTile: 2, RoundWindTile: 27, SelfWindTile: z.seat, IsParent: z.dealer}
			tr := util.ResearchCalcPoint(p)
			raw := util.CalcPoint(p)
			t.Log("fixture_score_calls=2")
			if tr.Point == nil || *tr.Point != z.want || raw.Point != z.want || tr.Han == nil || *tr.Han != z.han || tr.Fu == nil || *tr.Fu != z.fu {
				t.Fatalf("expected %d %dhan %dfu got %+v", z.want, z.han, z.fu, tr)
			}
			n := 0
			for _, v := range tr.YakuIDs {
				if v == util.YakuYakuhai {
					n++
				}
			}
			if n != z.yakuhai {
				t.Fatalf("yakuhai expected %d got %d", z.yakuhai, n)
			}
		})
	}
}
func TestPhysicalRedAndUnsupportedRules(t *testing.T) {
	h := make([]int, 37)
	h[4] = 1
	h[34] = 1
	if collapse(h)[4] != 2 || tile(34) != 4 || secondWeight(1, 34, 34) != 0 || secondWeight(1, 34, 4) != 1 {
		t.Fatal("red variant or same-class removal")
	}
	h[34]--
	if collapse(h)[4] != 1 {
		t.Fatal("discard red still retained")
	}
	rules, _ := json.Marshal(map[string]any{"openTanyao": "unknown", "redFives": map[string]int{"man": 1, "pin": 1, "sou": 1}})
	c := Case{Hand: make([]int, 37), Pool: make([]int, 37), MeldCount: 1, Melds: []Meld{{Kind: "pon"}}, Riichi: "none", Round: "E", Seat: "S", Rules: rules}
	e := &Eval{c: c}
	if e.prepare() != "unsupported_open_tanyao" {
		t.Fatal("unknown rule accepted")
	}
}
func TestScoreBudgetStopsBeforeCall(t *testing.T) {
	e := &Eval{cnt: &Counters{Score: maxScore}, batch: time.Now(), start: time.Now(), score: map[string]string{}, traces: map[string]util.ResearchTrace{}}
	defer func() {
		v, ok := recover().(stop)
		if !ok || v.why != "score_limit" || e.cnt.Score != maxScore {
			t.Fatal("score cap not enforced")
		}
	}()
	e.point(make([]int, 37), 0)
}
