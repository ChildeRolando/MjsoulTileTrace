package main

import (
	"github.com/EndlessCheng/mahjong-helper/util"
	"github.com/EndlessCheng/mahjong-helper/util/model"
	"testing"
)

func TestFixedHandRonAndTsumo(t *testing.T) {
	p := &model.PlayerInfo{HandTiles34: util.MustStrToTiles34("345m 345s 334455p 44z"), WinTile: util.MustStrToTile34("3m"), RoundWindTile: 28, SelfWindTile: 28, NumRedFives: []int{0, 0, 0}}
	a := util.CalcPoint(p)
	if a.Point != 7700 || a.FixedPoint != float64(a.Point) {
		t.Fatalf("baseline %v %v", a.Point, a.FixedPoint)
	}
	p.IsTsumo = true
	b := util.CalcPoint(p)
	if b.Point <= 0 || b.FixedPoint != float64(b.Point) {
		t.Fatalf("tsumo %v %v", b.Point, b.FixedPoint)
	}
	p.IsParent = true
	p.SelfWindTile = 27
	c := util.CalcPoint(p)
	if c.Point <= b.Point {
		t.Fatalf("dealer %v vs %v", c.Point, b.Point)
	}
}
func TestCollapseAndPhysicalVariants(t *testing.T) {
	x := make([]int, 37)
	x[4] = 2
	x[34] = 1
	x[13] = 1
	x[35] = 1
	z := collapse(x)
	if z[4] != 3 || z[13] != 2 || tile(36) != 22 {
		t.Fatal("red variant mapping")
	}
}
