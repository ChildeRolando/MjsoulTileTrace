import type { FixedReviewDetailDto, FixedReviewSnapshotDto, Tile } from "@riichi-coach/contracts";
const winds = ["东", "南", "西", "北"];
const windIds = ["E", "S", "W", "N"];
const tags: Record<string, string> = { efficiency: "牌效", value: "打点", defense: "防守", placement: "顺位", option_value: "选择空间" };
const make = <K extends keyof HTMLElementTagNameMap>(d: Document, tag: K, cls: string, text?: string) => {
    const n = d.createElement(tag);
    n.className = cls;
    if (text !== undefined)
        n.textContent = text;
    return n;
};
export function tileName(t: Tile): string {
    return (t.red ? "赤" : "") + (t.id[1] === "z" ? ["东", "南", "西", "北", "白", "发", "中"][Number(t.id[0]) - 1] : t.id[0] + ({ m: "万", p: "筒", s: "索" }[t.id[1]!] ?? ""));
}
function tileImage(d: Document, t: Tile) {
    const image = make(d, "img", "tile");
    image.src = `./tiles/${t.red ? "0" + t.id[1] : t.id}.svg`;
    image.alt = tileName(t);
    image.draggable = false;
    return image;
}
export function readWorkspaceNotes(): Array<{
    packageId: string;
    decisionId: string;
    title: string;
}> {
    try {
        const data = JSON.parse(localStorage.getItem("coach-workspace-notes") ?? "[]");
        return Array.isArray(data) ? data.filter(x => typeof x?.packageId === "string" && typeof x?.decisionId === "string" && typeof x?.title === "string") : [];
    }
    catch {
        return [];
    }
}
export function rememberedDecision(packageId: string): string | null {
    try {
        return localStorage.getItem(`coach-position:${packageId}`);
    }
    catch {
        return null;
    }
}
export function rememberDecision(packageId: string, decisionId: string) {
    try {
        localStorage.setItem(`coach-position:${packageId}`, decisionId);
    }
    catch { /* Navigation works without storage. */ }
}
export function createReviewWorkspace(d: Document, root: HTMLElement, snapshot: FixedReviewSnapshotDto, open: (id: string) => void) {
    const layout = make(d, "div", "review-layout");
    const boardLane = make(d, "section", "board-lane");
    boardLane.setAttribute("aria-label", "牌局工作区");
    const boardHost = make(d, "div", "board-host");
    boardHost.append(make(d, "p", "workspace-empty", "选择一手打牌，查看决策前的局面。"));
    const timeline = make(d, "section", "decision-timeline");
    timeline.setAttribute("aria-label", "与教练不一致的打牌");
    const head = make(d, "div", "timeline-heading");
    head.append(make(d, "strong", "", "与教练不一致的打牌"));
    const controls = make(d, "div", "timeline-controls"), counter = make(d, "span", ""), prev = make(d, "button", "icon-button", "‹"), next = make(d, "button", "icon-button", "›");
    prev.type = next.type = "button";
    prev.setAttribute("aria-label", "上一手分歧打牌");
    next.setAttribute("aria-label", "下一手分歧打牌");
    controls.append(counter, prev, next);
    head.append(controls);
    const track = make(d, "div", "decision-track");
    let selected = 0;
    const items = snapshot.selection.items;
    const buttons = items.map((item, i) => {
        const b = make(d, "button", "decision-node");
        b.type = "button";
        b.dataset.decisionId = item.decisionId;
        b.append(make(d, "small", "", item.roundLabel ?? `第 ${item.roundOrdinal + 1} 局`), make(d, "span", "", item.turnLabel ?? `第 ${i + 1} 手`), make(d, "strong", "", item.tags.map(t => tags[t]).join(" · ") || "行动比较"));
        b.addEventListener("click", () => open(item.decisionId));
        track.append(b);
        return b;
    });
    prev.addEventListener("click", () => { if (selected > 0)
        open(items[selected - 1]!.decisionId); });
    next.addEventListener("click", () => { if (selected < items.length - 1)
        open(items[selected + 1]!.decisionId); });
    track.addEventListener("keydown", e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const i = Math.max(0, Math.min(items.length - 1, selected + (e.key === "ArrowRight" ? 1 : -1)));
        if (items[i])
            open(items[i]!.decisionId);
    } });
    timeline.append(head, track);
    if (!items.length)
        timeline.append(make(d, "p", "workspace-empty", "本盘没有入选的分歧打牌。可在复盘信息中查看分析覆盖情况。"));
    const coach = make(d, "aside", "workspace-coach");
    coach.setAttribute("aria-label", "当前局面教练");
    const coachHeader = make(d, "div", "workspace-coach-header");
    coachHeader.append(make(d, "strong", "", "Coach"), make(d, "span", "", "跟随当前局面"));
    const detailHost = make(d, "div", "workspace-detail-host");
    detailHost.append(make(d, "p", "workspace-empty", items.length ? "正在读取当前局面…" : "暂无入选条目"));
    const statusHost = make(d, "div", "workspace-status-host");
    const meta = make(d, "details", "workspace-review-meta");
    meta.append(make(d, "summary", "", "复盘信息与教练设置"));
    coach.append(coachHeader, statusHost, detailHost, meta);
    boardLane.append(boardHost, timeline);
    layout.append(boardLane, coach);
    root.append(layout);
    const select = (id: string) => {
        selected = Math.max(0, items.findIndex(x => x.decisionId === id));
        counter.textContent = items.length ? `${selected + 1} / ${items.length}` : "0 / 0";
        prev.disabled = selected === 0;
        next.disabled = selected >= items.length - 1;
        buttons.forEach((b, i) => { b.classList.toggle("active", i === selected); b.setAttribute("aria-pressed", String(i === selected)); });
        const active = buttons[selected];
        if (active)
            track.scrollLeft = Math.max(0, active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2);
        rememberDecision(snapshot.packageId, id);
    };
    if (items[0])
        select(items[0].decisionId);
    else {
        prev.disabled = next.disabled = true;
        counter.textContent = "0 / 0";
    }
    const showBoard = (detail: FixedReviewDetailDto) => {
        select(detail.decisionId);
        boardHost.replaceChildren();
        const b = detail.board;
        if (!b) {
            boardHost.append(make(d, "p", "workspace-empty", "这份旧复盘没有可显示的牌桌数据。教练解说和依据仍可查看。"));
            return;
        }
        const heading = make(d, "div", "board-heading");
        const title = make(d, "div", "");
        title.append(make(d, "h1", "", `${b.roundLabel} / ${b.turnLabel}`), make(d, "p", "", `你的视角 · ${winds[windIds.indexOf(b.seatWind)]}家`));
        const note = make(d, "button", "quiet");
        note.type = "button";
        const updateNote = () => { note.textContent = readWorkspaceNotes().some(x => x.packageId === detail.packageId && x.decisionId === detail.decisionId) ? "✓ 已读" : "标记已读"; };
        updateNote();
        note.addEventListener("click", () => { const notes = readWorkspaceNotes(); if (!notes.some(x => x.packageId === detail.packageId && x.decisionId === detail.decisionId))
            notes.push({ packageId: detail.packageId, decisionId: detail.decisionId, title: `${b.roundLabel} · ${b.turnLabel}` }); try {
            localStorage.setItem("coach-workspace-notes", JSON.stringify(notes));
            updateNote();
        }
        catch {
            note.textContent = "无法保存，请检查本机存储";
        } });
        heading.append(title, note);
        const table = make(d, "div", "mahjong-table");
        table.setAttribute("aria-label", "决策前的牌桌");
        const center = make(d, "div", "table-center");
        center.append(make(d, "strong", "", b.roundLabel), make(d, "span", "", b.turnLabel), make(d, "small", "", `本场 ${b.honba ?? "未知"} · 供托 ${b.riichiSticks ?? "未知"}`));
        table.append(center);
        ["bottom", "right", "top", "left"].forEach((position, offset) => {
            const actor = (b.actor + offset) % 4;
            const seat = make(d, "div", `table-seat ${position}`);
            seat.append(make(d, "span", "wind", winds[(windIds.indexOf(b.seatWind) + offset) % 4]), make(d, "span", "", ["你", "下家", "对家", "上家"][offset]), make(d, "strong", "", b.scores?.[actor]?.toLocaleString("zh-CN") ?? "点数未知"));
            if (b.riichiActors.includes(actor))
                seat.append(make(d, "span", "riichi", "立直"));
            const river = make(d, "div", `table-river ${position}`);
            river.setAttribute("aria-label", `${["你的", "下家", "对家", "上家"][offset]}牌河`);
            let riverRow: HTMLElement;
            b.rivers[actor]!.forEach((x,index) => {
                if (index % 6 === 0) { riverRow = make(d,"div","river-row"); river.append(riverRow); }
                const cell = make(d,"span",`river-tile${x.tsumogiri ? " tsumogiri" : ""}${x.riichiDeclaration ? " sideways" : ""}`);
                cell.title = `${tileName(x.tile)} · ${x.tsumogiri ? "摸切" : "手切"}${x.riichiDeclaration ? " · 立直宣言" : ""}`;
                cell.append(tileImage(d,x.tile)); riverRow!.append(cell);
            });
            const melds = make(d,"div",`table-melds ${position}`);
            melds.setAttribute("aria-label",`${["你的","下家","对家","上家"][offset]}副露`);
            b.melds.filter(m => m.actor === actor).forEach(m => {
                const group = make(d,"div","meld"); group.title = m.label;
                group.setAttribute("aria-label",m.label);
                m.tiles.forEach(t => group.append(tileImage(d,t))); melds.append(group);
            });
            table.append(seat, river, melds);
        });
        const dora = make(d, "div", "table-dora");
        dora.append(make(d, "small", "", "宝牌指示"));
        b.dora.forEach(t => dora.append(tileImage(d, t)));
        table.append(dora);
        const handZone = make(d, "div", "workspace-hand-zone");
        const hand = make(d, "div", "workspace-hand");
        handZone.append(make(d, "p", "hand-caption", "你的手牌 · 悬浮或点按查看"), hand);
        const loss = make(d, "div", "hand-loss");
        loss.hidden = true;
        loss.setAttribute("role", "status");
        const handTiles = [...b.hand, ...(b.draw ? [b.draw] : [])];
        handTiles.forEach((t, i) => {
            const button = make(d, "button", b.draw && i === handTiles.length - 1 ? "drawn" : "");
            button.type = "button";
            button.setAttribute("aria-label", `查看${tileName(t)}`);
            button.append(tileImage(d, t));
            if (b.actualTile?.id === t.id && b.actualTile.red === t.red)
                button.classList.add("actual-tile");
            const show = () => {
                loss.replaceChildren(make(d,"strong","",`打出 ${tileName(t)}`));
                const result = b.discardLoss;
                if (!result || result.status !== "ready") {
                    const reason = result?.status === "unavailable" ? result.reason : "facts_missing";
                    loss.append(make(d,"p","",({legal_actions_missing:"旧复盘缺少完整合法切牌记录，请重新分析牌谱。",facts_missing:"可见牌记录不完整，暂不能计算损失。",engine_failed:"计算暂时失败，重新打开这手牌可重试。",not_discard_window:"当前局面不是打牌窗口。"})[reason]));
                } else {
                    const mode = b.draw && i === handTiles.length - 1 ? "tsumogiri" : "tedashi";
                    const candidate = result.candidates.find(c => c.tile.id === t.id && c.tile.red === t.red && c.discardMode === mode);
                    if (!candidate) loss.append(make(d,"p","","当前不能打出这张牌。"));
                    else {
                        if (candidate.shanten > result.baselineShanten) loss.append(make(d,"p","loss-regression",`退向听：${result.baselineShanten} → ${candidate.shanten}`));
                        const group = (label:string,tiles:typeof candidate.directLost) => {
                            const section = make(d,"section","loss-group");
                            section.append(make(d,"p","",`${label} · 损 ${tiles.reduce((n,x)=>n+x.count,0)} 枚${tiles.length ? ` / ${tiles.length} 种` : ""}`));
                            const list = make(d,"div","loss-tiles");
                            tiles.forEach(x => {
                                const item = make(d,"div","loss-tile"); item.append(tileImage(d,x.tile),make(d,"span","",`损 ${x.count}`));
                                if (x.degradedToImprovement) item.append(make(d,"small","","降为改良"));
                                list.append(item);
                            });
                            section.append(list); loss.append(section);
                        };
                        group("直接进张",candidate.directLost); group("改良张",candidate.improvementLost);
                        loss.append(make(d,"small","loss-basis","相对摸牌后可保留的机会；改良仅指不进向听、后续进张增加。枚数按已知可见牌计算。"));
                    }
                }
                loss.hidden = false;
            };
            button.addEventListener("pointerenter", show);
            button.addEventListener("focus", show);
            button.addEventListener("click", show);
            button.addEventListener("keydown", e => { if (e.key === "Escape")
                loss.hidden = true; });
            hand.append(button);
        });
        handZone.addEventListener("pointerleave", () => { loss.hidden = true; });
        handZone.addEventListener("focusout", e => { if (!handZone.contains(e.relatedTarget as Node))
            loss.hidden = true; });
        handZone.append(loss);
        if (b.melds.some(m => m.actor === null)) handZone.append(make(d,"small","","部分副露归属未记录，未摆放到玩家位置。"));
        boardHost.append(heading, make(d, "p", "board-caption", b.complete ? "决策前的牌桌" : "局面数据不完整，以下仅显示已知牌面"), table, handZone);
    };
    return { detailHost, statusHost, meta, showBoard, select, showLoading: (id: string) => { select(id); boardHost.replaceChildren(make(d, "p", "workspace-empty", "正在读取这手牌…")); detailHost.replaceChildren(make(d, "p", "workspace-empty", "正在读取教练解说…")); } };
}
