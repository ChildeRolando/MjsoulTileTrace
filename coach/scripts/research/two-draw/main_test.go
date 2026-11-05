package main

import (
	"math/rand"
	"reflect"
	"testing"
)

// Independent slow reference: expand physical copies, choose one discard per observed first tile,
// then explicitly enumerate second physical copies. This makes max-before-second-draw explicit.
func reference(h, u []int, target int, f Oracle) int {
	deck := []int{}
	for t, n := range u {
		for k := 0; k < n; k++ {
			deck = append(deck, t)
		}
	}
	sum := 0
	for i, x := range deck {
		h[x]++
		if f(h) <= target {
			sum += len(deck) - 1
			h[x]--
			continue
		}
		best := -1
		for d, n := range h {
			if n == 0 {
				continue
			}
			h[d]--
			v := 0
			for j, y := range deck {
				if j == i {
					continue
				}
				h[y]++
				if f(h) <= target {
					v++
				}
				h[y]--
			}
			h[d]++
			if v > best {
				best = v
			}
		}
		sum += best
		h[x]--
	}
	return sum
}
func toy(h []int) int { return 3 - h[0] - 2*(h[1]/2) - h[2]/2 }
func TestExactSmallPools(t *testing.T) {
	r := rand.New(rand.NewSource(2026110601))
	for k := 0; k < 250; k++ {
		hand := make([]int, 34)
		pool := make([]int, 34)
		for j := 0; j < 3; j++ {
			hand[r.Intn(4)]++
		}
		for j := 0; j < 5; j++ {
			x := r.Intn(4)
			if hand[x]+pool[x] < 4 {
				pool[x]++
			}
		}
		if total(pool) < 2 {
			k--
			continue
		}
		for target := -1; target <= 2; target++ {
			h := append([]int(nil), hand...)
			var stats Counts
			got := optimize(h, pool, target, toy, &stats)
			want := reference(append([]int(nil), hand...), pool, target, toy)
			if got.Numerator != want || got.Denominator != total(pool)*(total(pool)-1) || !reflect.DeepEqual(h, hand) {
				t.Fatalf("case %d target %d got %d want %d", k, target, got.Numerator, want)
			}
		}
	}
}
func TestAbsorptionTiesAndDepletion(t *testing.T) {
	h := make([]int, 34)
	u := make([]int, 34)
	h[0] = 1
	h[1] = 1
	u[0] = 1
	u[1] = 2
	var stats Counts
	f := func(x []int) int {
		if x[0] >= 2 {
			return -1
		}
		return 0
	}
	p := optimize(h, u, -1, f, &stats)
	if p.Denominator != 6 || p.Numerator != 4 {
		t.Fatalf("got %+v", p)
	}
	if !p.Branches[0].Absorbed {
		t.Fatal("expected first-draw absorption")
	}
	if p.Branches[1].BestSecondWeight != 1 {
		t.Fatal("first tile was not depleted")
	}
}
func TestTies(t *testing.T) {
	h := make([]int, 34)
	u := make([]int, 34)
	h[0] = 1
	h[1] = 1
	u[2] = 2
	v := optimize(h, u, -1, func([]int) int { return 0 }, &Counts{})
	if len(v.Branches) != 1 || len(v.Branches[0].DiscardTies) != 3 {
		t.Fatal("ties not preserved")
	}
}
func TestInsufficientPool(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected insufficient pool rejection")
		}
	}()
	u := make([]int, 34)
	u[0] = 1
	optimize(make([]int, 34), u, 0, toy, &Counts{})
}
func TestHelperShapeFourteenAndSevenPairs(t *testing.T) {
	for _, h := range [][]int{{2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}} {
		meld := 0
		if total(h) == 11 {
			meld = 1
		}
		e := Evaluator{meld: meld, cache: map[[34]uint8]int{}}
		v := e.shape(h)
		if v == -1 {
			continue
		}
		best := 100
		for d, n := range h {
			if n > 0 {
				h[d]--
				s := e.shape(h)
				h[d]++
				if s < best {
					best = s
				}
			}
		}
		if v != best {
			t.Fatalf("14/explicit mismatch: %d != %d", v, best)
		}
	}
}
func TestSuitPermutation(t *testing.T) {
	h := make([]int, 34)
	for _, i := range []int{0, 1, 2, 3, 4, 9, 10, 11, 18, 19, 20, 27, 27} {
		h[i]++
	}
	e := Evaluator{meld: 0, cache: map[[34]uint8]int{}}
	s := e.shape(h)
	p := append([]int(nil), h...)
	for i := 0; i < 9; i++ {
		p[i], p[9+i] = p[9+i], p[i]
	}
	e2 := Evaluator{meld: 0, cache: map[[34]uint8]int{}}
	if e2.shape(p) != s {
		t.Fatal("suit permutation changed shanten")
	}
}
func TestChiitoiOnlyAndOpenMeld(t *testing.T) {
	closed := make([]int, 34)
	for _, i := range []int{0, 3, 6, 9, 12, 15, 18} {
		closed[i] = 2
	}
	e := Evaluator{meld: 0, cache: map[[34]uint8]int{}}
	if e.shape(closed) != -1 {
		t.Fatal("seven pairs completion not recognized")
	}
	normal := Evaluator{meld: 1, cache: map[[34]uint8]int{}}
	open := make([]int, 34)
	for _, i := range []int{0, 1, 2, 9, 10, 11, 18, 19, 20} {
		open[i]++
	}
	open[27] = 2
	if normal.shape(open) != -1 {
		t.Fatal("open-meld structural completion not recognized")
	}
}
func TestNoSecondDrawLookahead(t *testing.T) {
	r := rand.New(rand.NewSource(12345))
	found := false
	for k := 0; k < 400 && !found; k++ {
		h := make([]int, 34)
		u := make([]int, 34)
		for i := 0; i < 3; i++ {
			h[r.Intn(4)]++
		}
		for i := 0; i < 5; i++ {
			j := r.Intn(4)
			if h[j]+u[j] < 4 {
				u[j]++
			}
		}
		if total(u) < 2 {
			continue
		}
		target := 0
		honest := reference(append([]int(nil), h...), u, target, toy)
		clair := 0
		deck := []int{}
		for j, n := range u {
			for q := 0; q < n; q++ {
				deck = append(deck, j)
			}
		}
		for i, a := range deck {
			h[a]++
			if toy(h) <= target {
				clair += len(deck) - 1
				h[a]--
				continue
			}
			for j, b := range deck {
				if i == j {
					continue
				}
				success := false
				for d, n := range h {
					if n == 0 {
						continue
					}
					h[d]--
					h[b]++
					if toy(h) <= target {
						success = true
					}
					h[b]--
					h[d]++
				}
				if success {
					clair++
				}
			}
			h[a]--
		}
		if clair > honest {
			got := optimize(append([]int(nil), h...), u, target, toy, &Counts{})
			if got.Numerator != honest {
				t.Fatal("optimizer used second-draw knowledge")
			}
			found = true
		}
	}
	if !found {
		t.Fatal("synthetic set did not exercise lookahead gap")
	}
}
