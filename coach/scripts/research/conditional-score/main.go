package main

import (
	"bufio"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/EndlessCheng/mahjong-helper/util"
	"github.com/EndlessCheng/mahjong-helper/util/model"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	maxShape     int64 = 40000000
	maxPrimitive int64 = 8000000
	maxScore     int64 = 800000
)

type Tile struct {
	ID  string `json:"id"`
	Red bool   `json:"red"`
}
type Meld struct {
	Kind     string `json:"kind"`
	Called   Tile   `json:"calledTile"`
	Consumed []Tile `json:"consumedTiles"`
	Added    Tile   `json:"addedTile"`
	Tiles    []Tile `json:"tiles"`
}
type Eff struct {
	Tile   string `json:"tile"`
	Unseen *int   `json:"unseen"`
}
type Basic struct {
	Status    string `json:"status"`
	Shanten   *int   `json:"shanten"`
	Effective []Eff  `json:"effectiveTiles"`
	Unseen    *int   `json:"unseenTotal"`
	Dora      *int   `json:"doraCount"`
}
type Candidate struct {
	Ref     string `json:"actionRef"`
	Variant int    `json:"variant"`
	Basic   Basic  `json:"basic"`
}
type Case struct {
	Index      int             `json:"selectionIndex"`
	ID         string          `json:"caseId"`
	Hand       []int           `json:"hand37"`
	Pool       []int           `json:"unseen37"`
	MeldCount  int             `json:"ownMeldCount"`
	Melds      []Meld          `json:"ownMelds"`
	Riichi     string          `json:"riichiStatus"`
	Round      string          `json:"roundWind"`
	Seat       string          `json:"selfWind"`
	Dealer     bool            `json:"dealer"`
	Indicators []int           `json:"doraIndicators"`
	Rules      json.RawMessage `json:"ruleSet"`
	Candidates []Candidate     `json:"candidates"`
}
type Counters struct {
	Shape               int64 `json:"shapeRequests"`
	CacheHits           int64 `json:"shapeCacheHits"`
	Primitives          int64 `json:"uncachedShapePrimitiveCalls"`
	Normal              int64 `json:"normalCalls"`
	Chiitoi             int64 `json:"chiitoiCalls"`
	Agari               int64 `json:"isAgariCalls"`
	ScoreDivideReserved int64 `json:"scoreDividePrimitiveReservations"`
	Score               int64 `json:"scoreCalls"`
	ScoreCache          int64 `json:"scoreCacheHits"`
	Unknown             int64 `json:"unknownScore"`
	First               int64 `json:"firstDrawBranches"`
	Discards            int64 `json:"hypotheticalDiscardBranches"`
	Second              int64 `json:"secondDrawTransitions"`
}
type stop struct{ why string }
type Eval struct {
	c            Case
	cnt          *Counters
	batch, start time.Time
	sh           map[[34]byte]int
	ag           map[[34]byte]bool
	score        map[string]string
	traces       map[string]util.ResearchTrace
	melds        []model.Meld
	meld34       [34]int
	meldRed      [3]int
	round, seat  int
}

func (e *Eval) check() {
	if time.Since(e.batch) >= 1200*time.Second {
		panic(stop{"batch_time"})
	}
	if time.Since(e.start) >= 30*time.Second {
		panic(stop{"case_time"})
	}
}
func (e *Eval) shape() {
	e.check()
	if e.cnt.Shape >= maxShape {
		panic(stop{"shape_limit"})
	}
	e.cnt.Shape++
}
func (e *Eval) primitive() {
	e.check()
	if e.cnt.Primitives >= maxPrimitive {
		panic(stop{"primitive_limit"})
	}
	e.cnt.Primitives++
}
func collapse(h []int) []int {
	a := append([]int(nil), h[:34]...)
	for i := 0; i < 3; i++ {
		a[4+9*i] += h[34+i]
	}
	return a
}
func key(a []int) (k [34]byte) {
	for i, n := range a {
		k[i] = byte(n)
	}
	return
}
func tile(i int) int {
	if i >= 34 {
		return 4 + 9*(i-34)
	}
	return i
}
func tileName(i int) string {
	if i < 27 {
		return fmt.Sprintf("%d%c", i%9+1, "mps"[i/9])
	}
	return fmt.Sprintf("%dz", i-26)
}
func idx(t Tile) int {
	if len(t.ID) != 2 {
		return -1
	}
	s := strings.IndexByte("mpsz", t.ID[1])
	n := int(t.ID[0] - '1')
	if s < 0 || n < 0 || n > 8 || (s == 3 && n > 6) {
		return -1
	}
	return 9*s + n
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
func (e *Eval) shanten(h []int) int {
	e.shape()
	a := collapse(h)
	k := key(a)
	if v, ok := e.sh[k]; ok {
		e.cnt.CacheHits++
		return v
	}
	n := 0
	for _, x := range a {
		n += x
	}
	e.primitive()
	e.cnt.Normal++
	v := util.CalculateShantenOfNormal(append([]int(nil), a...), n)
	if e.c.MeldCount == 0 {
		e.primitive()
		e.cnt.Chiitoi++
		x := util.CalculateShantenOfChiitoi(append([]int(nil), a...))
		if x < v {
			v = x
		}
	}
	e.sh[k] = v
	return v
}
func (e *Eval) complete(h []int) string {
	e.shape()
	a := collapse(h)
	k := key(a)
	v, ok := e.ag[k]
	if ok {
		e.cnt.CacheHits++
	} else {
		e.primitive()
		e.cnt.Agari++
		v = util.IsAgari(a)
		e.ag[k] = v
	}
	if v {
		return "complete"
	}
	if e.c.MeldCount == 0 {
		count, dupe := 0, false
		for _, i := range []int{0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33} {
			if a[i] > 0 {
				count++
				if a[i] >= 2 {
					dupe = true
				}
			}
		}
		if count == 13 && dupe {
			return "unsupported_kokushi"
		}
	}
	return "not_complete"
}
func (e *Eval) prepare() string {
	c := e.c
	if len(c.Hand) != 37 || len(c.Pool) != 37 || len(c.Melds) != c.MeldCount || c.Riichi != "none" {
		return "unknown_context"
	}
	e.round = wind(c.Round)
	e.seat = wind(c.Seat)
	if e.round < 0 || e.seat < 0 || c.Dealer != (e.seat == 27) {
		return "unknown_winds"
	}
	var rules struct {
		Open any            `json:"openTanyao"`
		Red  map[string]any `json:"redFives"`
	}
	if json.Unmarshal(c.Rules, &rules) != nil {
		return "unknown_rules"
	}
	v, ok := rules.Open.(bool)
	if !ok || (c.MeldCount > 0 && !v) {
		return "unsupported_open_tanyao"
	}
	red := [3]int{}
	for i, s := range []string{"man", "pin", "sou"} {
		n, ok := rules.Red[s].(float64)
		if !ok || n < 0 || n > 4 || n != float64(int(n)) {
			return "unknown_red_rules"
		}
		red[i] = int(n)
	}
	for _, m := range c.Melds {
		t := 0
		switch m.Kind {
		case "chi":
			t = model.MeldTypeChi
		case "pon":
			t = model.MeldTypePon
		case "ankan":
			t = model.MeldTypeAnkan
		case "daiminkan":
			t = model.MeldTypeMinkan
		case "kakan":
			t = model.MeldTypeKakan
		default:
			return "unknown_meld"
		}
		ts := append([]Tile(nil), m.Tiles...)
		if m.Kind != "ankan" {
			ts = append([]Tile{m.Called}, m.Consumed...)
			if m.Kind == "kakan" {
				ts = append(ts, m.Added)
			}
		}
		want := 3
		if m.Kind == "ankan" || m.Kind == "daiminkan" || m.Kind == "kakan" {
			want = 4
		}
		if len(ts) != want {
			return "invalid_meld"
		}
		a := []int{}
		for _, z := range ts {
			i := idx(z)
			if i < 0 {
				return "unknown_meld_tile"
			}
			a = append(a, i)
			e.meld34[i]++
			if z.Red {
				if i >= 27 || i%9 != 4 {
					return "invalid_red_meld"
				}
				e.meldRed[i/9]++
			}
		}
		sort.Ints(a)
		e.melds = append(e.melds, model.Meld{MeldType: t, Tiles: a})
	}
	N := 0
	for i, n := range c.Pool {
		if n < 0 || c.Hand[i] < 0 {
			return "invalid_physical_counts"
		}
		N += n
	}
	for i := 0; i < 3; i++ {
		if c.Hand[34+i]+e.meldRed[i] > red[i] {
			return "invalid_red_count"
		}
	}
	if N < 2 {
		return "pool_too_small"
	}
	return ""
}
func (e *Eval) point(h []int, win int) (string, util.ResearchTrace) {
	k := fmt.Sprint(h, "|", win)
	if id, ok := e.score[k]; ok {
		e.cnt.ScoreCache++
		return id, e.traces[id]
	}
	e.check()
	if e.cnt.Score >= maxScore {
		panic(stop{"score_limit"})
	}
	// ResearchCalcPoint divides once for support and CalcPoint divides once for scoring.
	// Reserve both before the call so even an upstream panic cannot bypass caps.
	if e.cnt.Shape+2 > maxShape {
		panic(stop{"shape_limit"})
	}
	if e.cnt.Primitives+2 > maxPrimitive {
		panic(stop{"primitive_limit"})
	}
	e.cnt.Shape += 2
	e.cnt.Primitives += 2
	e.cnt.ScoreDivideReserved += 2
	e.cnt.Score++
	p := &model.PlayerInfo{HandTiles34: collapse(h), Melds: e.melds, NumRedFives: []int{h[34] + e.meldRed[0], h[35] + e.meldRed[1], h[36] + e.meldRed[2]}, IsTsumo: true, WinTile: tile(win), RoundWindTile: e.round, SelfWindTile: e.seat, IsParent: e.c.Dealer, DoraTiles: model.DoraList(e.c.Indicators, false)}
	r := util.ResearchCalcPoint(p)
	if r.Status == "unknown" {
		e.cnt.Unknown++
	}
	b, _ := json.Marshal(r)
	hash := sha256.Sum256(b)
	id := hex.EncodeToString(hash[:])
	e.score[k] = id
	e.traces[id] = r
	return id, r
}
func (e *Eval) baseline(c Candidate, h []int) bool {
	if c.Basic.Status != "available" || c.Basic.Shanten == nil || c.Basic.Unseen == nil || c.Basic.Dora == nil {
		return false
	}
	if e.shanten(h) != *c.Basic.Shanten {
		return false
	}
	a, u := collapse(h), collapse(e.c.Pool)
	actual := []Eff{}
	total := 0
	for t := 0; t < 34; t++ {
		if a[t]+e.meld34[t] >= 4 {
			continue
		}
		v := append([]int(nil), h...)
		v[t]++
		if e.shanten(v) < *c.Basic.Shanten {
			n := u[t]
			actual = append(actual, Eff{tileName(t), &n})
			total += n
		}
	}
	if total != *c.Basic.Unseen || len(actual) != len(c.Basic.Effective) {
		return false
	}
	for i, z := range actual {
		b := c.Basic.Effective[i]
		if b.Tile != z.Tile || b.Unseen == nil || *b.Unseen != *z.Unseen {
			return false
		}
	}
	p := model.PlayerInfo{HandTiles34: a, Melds: e.melds, NumRedFives: []int{h[34] + e.meldRed[0], h[35] + e.meldRed[1], h[36] + e.meldRed[2]}, DoraTiles: model.DoraList(e.c.Indicators, false)}
	return p.CountDora() == *c.Basic.Dora
}

type Outcome struct {
	Variant int    `json:"variant"`
	Weight  int    `json:"weight"`
	Status  string `json:"status"`
	Trace   string `json:"trace,omitempty"`
}
type Discard struct {
	Variant   int        `json:"variant"`
	PointMass int64      `json:"pointMass"`
	WinMass   int64      `json:"winMass"`
	Outcomes  []*Outcome `json:"outcomes"`
}
type First struct {
	Variant     int        `json:"variant"`
	Weight      int        `json:"weight"`
	Status      string     `json:"status"`
	Trace       string     `json:"trace,omitempty"`
	BestDiscard *int       `json:"bestDiscard"`
	Ties        []int      `json:"ties,omitempty"`
	PointMass   int64      `json:"pointMass"`
	WinMass     int64      `json:"winMass"`
	Discards    []*Discard `json:"discards,omitempty"`
}
type Result struct {
	ActionRef        string   `json:"actionRef"`
	Status           string   `json:"status"`
	Reason           string   `json:"reason,omitempty"`
	Numerator        *int64   `json:"numerator"`
	Denominator      *int64   `json:"denominator"`
	WinMassNumerator *int64   `json:"winMassNumerator"`
	Branches         []*First `json:"branches,omitempty"`
}

func secondWeight(n, x, y int) int {
	if x == y {
		return n - 1
	}
	return n
}
func absorbingMass(point, n int) (int64, int64) { return int64(n-1) * int64(point), int64(n - 1) }
func choosePolicy(ds []*Discard) (int64, []int, int64) {
	best := int64(-1)
	ties := []int{}
	var win int64
	for _, d := range ds {
		if d.PointMass > best {
			best = d.PointMass
			ties = []int{d.Variant}
			win = d.WinMass
		} else if d.PointMass == best {
			ties = append(ties, d.Variant)
		}
	}
	return best, ties, win
}
func (e *Eval) root(c Candidate, r *Result) {
	h := append([]int(nil), e.c.Hand...)
	if c.Variant < 0 || c.Variant >= 37 || h[c.Variant] < 1 {
		r.Reason = "invalid_root"
		return
	}
	h[c.Variant]--
	if !e.baseline(c, h) {
		r.Status = "baseline_mismatch"
		return
	}
	N := 0
	for _, v := range e.c.Pool {
		N += v
	}
	den := int64(N * (N - 1))
	num, wm := int64(0), int64(0)
	for x, nx := range e.c.Pool {
		if nx <= 0 {
			continue
		}
		e.check()
		e.cnt.First++
		h[x]++
		first := &First{Variant: x, Weight: nx, Status: "pending"}
		r.Branches = append(r.Branches, first)
		state := e.complete(h)
		first.Status = state
		if state == "unsupported_kokushi" {
			r.Reason = "unsupported_kokushi"
			h[x]--
			return
		}
		if state == "complete" {
			id, tr := e.point(h, x)
			first.Trace = id
			first.Status = tr.Status
			if tr.Status == "unknown" {
				r.Reason = "unknown_first_completion"
				h[x]--
				return
			}
			if tr.Status == "supported" && tr.Point != nil && *tr.Point > 0 {
				first.PointMass, first.WinMass = absorbingMass(*tr.Point, N)
				num += int64(nx) * first.PointMass
				wm += int64(nx) * first.WinMass
				h[x]--
				continue
			}
		}
		for d, v := range h {
			if v <= 0 {
				continue
			}
			e.check()
			e.cnt.Discards++
			h[d]--
			z := &Discard{Variant: d, Outcomes: []*Outcome{}}
			first.Discards = append(first.Discards, z)
			for y, ny := range e.c.Pool {
				n := secondWeight(ny, x, y)
				if n <= 0 {
					continue
				}
				e.cnt.Second++
				h[y]++
				o := &Outcome{Variant: y, Weight: n, Status: "pending"}
				z.Outcomes = append(z.Outcomes, o)
				st := e.complete(h)
				o.Status = st
				if st == "unsupported_kokushi" {
					r.Reason = "unsupported_kokushi"
					h[y]--
					h[d]++
					h[x]--
					return
				}
				if st == "complete" {
					id, tr := e.point(h, y)
					o.Status = tr.Status
					o.Trace = id
					if tr.Status == "unknown" {
						r.Reason = "unknown_second_completion"
						h[y]--
						h[d]++
						h[x]--
						return
					}
					if tr.Status == "supported" && tr.Point != nil && *tr.Point > 0 {
						z.PointMass += int64(n) * int64(*tr.Point)
						z.WinMass += int64(n)
					}
				}
				h[y]--
			}
			h[d]++
		}
		best, ties, bestWin := choosePolicy(first.Discards)
		if best < 0 {
			r.Reason = "no_hypothetical_discard"
			h[x]--
			return
		}
		chosen := ties[0]
		first.BestDiscard = &chosen
		first.Ties = ties
		first.Status = "continued"
		first.PointMass = best
		first.WinMass = bestWin
		num += int64(nx) * best
		wm += int64(nx) * bestWin
		h[x]--
	}
	r.Status = "available"
	r.Numerator = &num
	r.Denominator = &den
	r.WinMassNumerator = &wm
}
func write(path string, v any) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	if err = json.NewEncoder(f).Encode(v); err != nil {
		panic(err)
	}
}
func runCase(c Case, cnt *Counters, start time.Time, dir string) (summary map[string]any, halt bool) {
	e := &Eval{c: c, cnt: cnt, batch: start, start: time.Now(), sh: map[[34]byte]int{}, ag: map[[34]byte]bool{}, score: map[string]string{}, traces: map[string]util.ResearchTrace{}}
	results := []*Result{}
	status, reason := "complete", ""
	defer func() {
		if x := recover(); x != nil {
			if b, ok := x.(stop); ok {
				status = "budget_exhausted"
				reason = b.why
			} else {
				status = "error"
				reason = fmt.Sprint(x)
			}
			halt = true
			if len(results) > 0 && results[len(results)-1].Status == "unknown" && results[len(results)-1].Reason == "" {
				results[len(results)-1].Status = status
				results[len(results)-1].Reason = reason
			}
		}
		for i := len(results); i < len(c.Candidates); i++ {
			results = append(results, &Result{ActionRef: c.Candidates[i].Ref, Status: "not_started"})
		}
		summary = map[string]any{"index": c.Index, "caseId": c.ID, "status": status, "reason": reason, "plannedCandidates": len(c.Candidates), "elapsedMs": time.Since(e.start).Milliseconds(), "counters": *cnt}
		path := filepath.Join(dir, fmt.Sprintf("%03d-%s-evidence.json.gz", c.Index, c.ID))
		f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			panic(err)
		}
		g := gzip.NewWriter(f)
		if err = json.NewEncoder(g).Encode(map[string]any{"summary": summary, "roots": results, "traces": e.traces}); err != nil {
			panic(err)
		}
		if err = g.Close(); err != nil {
			panic(err)
		}
		if err = f.Close(); err != nil {
			panic(err)
		}
	}()
	if why := e.prepare(); why != "" {
		status = "unavailable"
		reason = why
		return
	}
	for _, cnd := range c.Candidates {
		r := &Result{ActionRef: cnd.Ref, Status: "unknown"}
		results = append(results, r)
		e.root(cnd, r)
		if r.Status != "available" {
			status = "incomplete"
		}
	}
	return
}
func main() {
	if len(os.Args) != 3 {
		panic("input outputdir")
	}
	b, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	var x struct {
		Cases []Case `json:"cases"`
	}
	if err = json.Unmarshal(b, &x); err != nil || len(x.Cases) != 79 {
		panic("invalid input")
	}
	dir := os.Args[2]
	if err = os.Mkdir(dir, 0700); err != nil {
		panic(err)
	}
	f, err := os.OpenFile(filepath.Join(dir, "progress.jsonl"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		panic(err)
	}
	defer f.Close()
	w := bufio.NewWriter(f)
	defer w.Flush()
	start := time.Now()
	cnt := &Counters{}
	out := []map[string]any{}
	halt := false
	for _, c := range x.Cases {
		if halt {
			r := map[string]any{"index": c.Index, "caseId": c.ID, "status": "not_started_budget_or_error"}
			out = append(out, r)
			z, _ := json.Marshal(r)
			fmt.Fprintln(w, string(z))
			w.Flush()
			continue
		}
		r, stop := runCase(c, cnt, start, dir)
		out = append(out, r)
		halt = stop
		z, _ := json.Marshal(r)
		fmt.Fprintln(w, string(z))
		w.Flush()
	}
	write(filepath.Join(dir, "receipt.json"), map[string]any{"version": "conditional-score-local-preflight/v1", "cases": len(x.Cases), "halted": halt, "elapsedMs": time.Since(start).Milliseconds(), "counters": cnt, "results": out, "modelCalls": 0, "mortalCalls": 0, "providerCalls": 0, "nativeCalls": 0, "helperServiceCalls": 0})
}
