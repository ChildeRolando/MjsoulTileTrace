package util

import (
	"github.com/EndlessCheng/mahjong-helper/util/model"
	"sort"
)

// ResearchTrace is a read-only representation of the exact upstream CalcPoint choice.
// Yakuman Han/Fu are nil: upstream's private fields can carry an earlier division.
type ResearchTrace struct {
	Status        string        `json:"status"`
	Point         *int          `json:"point"`
	Han           *int          `json:"han"`
	Fu            *int          `json:"fu"`
	YakumanTimes  int           `json:"yakumanTimes"`
	YakuIDs       []int         `json:"yakuIds"`
	DoraCount     *int          `json:"doraCount"`
	Division      *DivideResult `json:"division"`
	WinTile       int           `json:"winTile"`
	IsParent      bool          `json:"isParent"`
	ChildPayment  *int          `json:"childPayment"`
	ParentPayment *int          `json:"parentPayment"`
	Reason        string        `json:"reason,omitempty"`
}

func ResearchCalcPoint(p *model.PlayerInfo) (tr ResearchTrace) {
	tr.Status = "unknown"
	tr.WinTile = p.WinTile
	tr.IsParent = p.IsParent
	defer func() {
		if recover() != nil {
			tr.Status = "unknown"
			tr.Point = nil
			tr.Han = nil
			tr.Fu = nil
			tr.ChildPayment = nil
			tr.ParentPayment = nil
			tr.Reason = "upstream_panic"
		}
	}()
	if considerOldYaku || !p.IsTsumo || p.IsRiichi || p.IsDaburii || len(p.HandTiles34) != 34 || len(p.NumRedFives) != 3 {
		tr.Reason = "unsupported_context"
		return
	}
	dora := p.CountDora()
	tr.DoraCount = &dora
	divisions := DivideTiles34(p.HandTiles34)
	if len(divisions) == 0 {
		tr.Reason = "unsupported_or_unrecognized_completion"
		return
	}
	r := CalcPoint(p)
	if r.Point == 0 {
		for _, d := range divisions {
			hi := &_handInfo{PlayerInfo: p, divideResult: d}
			if len(findYakuTypes(hi, p.IsNaki())) != 0 {
				tr.Reason = "zero_with_yaku_unknown"
				return
			}
		}
		zero := 0
		tr.Point = &zero
		tr.Status = "no_yaku"
		tr.Reason = "all_supported_divisions_no_yaku"
		return
	}
	if r.divideResult == nil || len(r.yakuTypes) == 0 {
		tr.Reason = "positive_missing_trace"
		return
	}
	tr.Status = "supported"
	point := r.Point
	tr.Point = &point
	tr.YakumanTimes = r.yakumanTimes
	tr.YakuIDs = append([]int(nil), r.yakuTypes...)
	sort.Ints(tr.YakuIDs)
	d := *r.divideResult
	d.KotsuTiles = append([]int(nil), d.KotsuTiles...)
	d.ShuntsuFirstTiles = append([]int(nil), d.ShuntsuFirstTiles...)
	tr.Division = &d
	if r.yakumanTimes == 0 {
		han, fu := r.han, r.fu
		tr.Han = &han
		tr.Fu = &fu
	}
	child, parent := CalcPointTsumo(r.han, r.fu, r.yakumanTimes, p.IsParent)
	tr.ChildPayment, tr.ParentPayment = &child, &parent
	return
}
