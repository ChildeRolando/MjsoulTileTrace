package main

import (
	"github.com/EndlessCheng/mahjong-helper/util"
	"github.com/EndlessCheng/mahjong-helper/util/model"
	"testing"
)

func TestCorrectedNoYakuDora(t *testing.T) {
	p := &model.PlayerInfo{HandTiles34: util.MustStrToTiles34("456m 789p 123s 22p"), Melds: []model.Meld{{MeldType: model.MeldTypeChi, Tiles: []int{0, 1, 2}}}, NumRedFives: []int{1, 0, 0}, DoraTiles: []int{4}, IsTsumo: true, WinTile: 3, RoundWindTile: 27, SelfWindTile: 28}
	tr := util.ResearchCalcPoint(p)
	t.Log("fixture_score_calls=1; divide_reservations=2")
	if tr.Status != "no_yaku" || tr.Point == nil || *tr.Point != 0 || tr.DoraCount == nil || *tr.DoraCount != 2 {
		t.Fatalf("no-yaku dora must remain 2 without creating yaku: %+v", tr)
	}
}
