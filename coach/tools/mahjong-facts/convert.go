package main

import (
	"fmt"
	"sort"

	"github.com/EndlessCheng/mahjong-helper/util/model"
)

type MeldInput struct {
	Kind    string `json:"kind"`
	Tiles34 []int  `json:"tiles34"`
}

type HandContext struct {
	Melds           []MeldInput `json:"melds"`
	DoraTiles34     []int       `json:"doraTiles34"`
	RedFiveCounts   []int       `json:"redFiveCounts"`
	RoundWindTile34 int         `json:"roundWindTile34"`
	SelfWindTile34  int         `json:"selfWindTile34"`
	Dealer          bool        `json:"dealer"`
	Riichi          bool        `json:"riichi"`
	SelfDiscards34  []int       `json:"selfDiscards34"`
}

func cloneInts(values []int) []int {
	return append([]int(nil), values...)
}

func validateTile34(tile int, field string) error {
	if tile < 0 || tile >= 34 {
		return fmt.Errorf("%s contains invalid Tile34 index %d", field, tile)
	}
	return nil
}

func validateTile34List(values []int, field string) error {
	if values == nil {
		return fmt.Errorf("%s must be an array", field)
	}
	for _, tile := range values {
		if err := validateTile34(tile, field); err != nil {
			return err
		}
	}
	return nil
}

func validateCounts34(counts []int, field string) error {
	if len(counts) != 34 {
		return fmt.Errorf("%s must contain exactly 34 counts", field)
	}
	for index, count := range counts {
		if count < 0 || count > 4 {
			return fmt.Errorf("%s[%d] must be between 0 and 4", field, index)
		}
	}
	return nil
}

func meldType(kind string) (int, error) {
	switch kind {
	case "chi":
		return model.MeldTypeChi, nil
	case "pon":
		return model.MeldTypePon, nil
	case "ankan":
		return model.MeldTypeAnkan, nil
	case "daiminkan":
		return model.MeldTypeMinkan, nil
	case "kakan":
		return model.MeldTypeKakan, nil
	default:
		return 0, fmt.Errorf("unsupported meld kind %q", kind)
	}
}

func convertMelds(inputs []MeldInput) ([]model.Meld, error) {
	if inputs == nil {
		return nil, fmt.Errorf("melds must be an array")
	}
	melds := make([]model.Meld, 0, len(inputs))
	for index, input := range inputs {
		convertedType, err := meldType(input.Kind)
		if err != nil {
			return nil, fmt.Errorf("melds[%d]: %w", index, err)
		}
		expectedLength := 4
		if input.Kind == "chi" || input.Kind == "pon" {
			expectedLength = 3
		}
		if len(input.Tiles34) != expectedLength {
			return nil, fmt.Errorf("melds[%d] requires %d tiles", index, expectedLength)
		}
		if err := validateTile34List(input.Tiles34, fmt.Sprintf("melds[%d].tiles34", index)); err != nil {
			return nil, err
		}
		tiles := cloneInts(input.Tiles34)
		sort.Ints(tiles)
		if input.Kind == "chi" {
			if tiles[0] >= 27 || tiles[0]/9 != tiles[2]/9 || tiles[1] != tiles[0]+1 || tiles[2] != tiles[1]+1 {
				return nil, fmt.Errorf("melds[%d] chi must be one suited sequence", index)
			}
		} else {
			for _, tile := range tiles[1:] {
				if tile != tiles[0] {
					return nil, fmt.Errorf("melds[%d] tiles must match", index)
				}
			}
		}
		melds = append(melds, model.Meld{
			MeldType: convertedType,
			Tiles:    tiles,
		})
	}
	return melds, nil
}

func theoreticalLeftTiles34(hand []int, melds []MeldInput) []int {
	left := make([]int, 34)
	for index := range left {
		left[index] = 4
	}
	for tile, count := range hand {
		if tile < len(left) {
			left[tile] -= count
		}
	}
	for _, meld := range melds {
		for _, tile := range meld.Tiles34 {
			if tile >= 0 && tile < len(left) {
				left[tile]--
			}
		}
	}
	return left
}

func validateHandContext(context HandContext, hand []int) ([]model.Meld, error) {
	melds, err := convertMelds(context.Melds)
	if err != nil {
		return nil, err
	}
	if err := validateTile34List(context.DoraTiles34, "doraTiles34"); err != nil {
		return nil, err
	}
	if len(context.RedFiveCounts) != 3 {
		return nil, fmt.Errorf("redFiveCounts must contain exactly three counts")
	}
	for index, count := range context.RedFiveCounts {
		if count < 0 || count > 1 {
			return nil, fmt.Errorf("redFiveCounts[%d] must be zero or one", index)
		}
	}
	if context.RoundWindTile34 < 27 || context.RoundWindTile34 > 30 {
		return nil, fmt.Errorf("roundWindTile34 must be a wind tile")
	}
	if context.SelfWindTile34 < 27 || context.SelfWindTile34 > 30 {
		return nil, fmt.Errorf("selfWindTile34 must be a wind tile")
	}
	if context.Dealer != (context.SelfWindTile34 == 27) {
		return nil, fmt.Errorf("dealer must agree with east self wind")
	}
	if err := validateTile34List(context.SelfDiscards34, "selfDiscards34"); err != nil {
		return nil, err
	}

	ownedCounts := cloneInts(hand)
	for _, meld := range context.Melds {
		for _, tile := range meld.Tiles34 {
			ownedCounts[tile]++
		}
	}
	for suit, count := range context.RedFiveCounts {
		if count > ownedCounts[suit*9+4] {
			return nil, fmt.Errorf("redFiveCounts[%d] exceeds owned five tiles", suit)
		}
	}
	return melds, nil
}

func newPlayerInfo(request Hand13Request, left []int) (*model.PlayerInfo, error) {
	melds, err := validateHandContext(request.HandContext, request.HandTiles34)
	if err != nil {
		return nil, err
	}
	leftDraws := 0
	if request.RemainingDraws != nil {
		leftDraws = *request.RemainingDraws
	}
	return &model.PlayerInfo{
		HandTiles34:        cloneInts(request.HandTiles34),
		Melds:              melds,
		DoraTiles:          cloneInts(request.DoraTiles34),
		NumRedFives:        cloneInts(request.RedFiveCounts),
		RoundWindTile:      request.RoundWindTile34,
		SelfWindTile:       request.SelfWindTile34,
		IsParent:           request.Dealer,
		IsRiichi:           request.Riichi,
		DiscardTiles:       cloneInts(request.SelfDiscards34),
		LeftTiles34:        cloneInts(left),
		LeftDrawTilesCount: leftDraws,
	}, nil
}
