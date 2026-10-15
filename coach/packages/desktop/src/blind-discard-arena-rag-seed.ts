import type { ArenaRagApplicability, ArenaRagTopic } from "@riichi-coach/contracts";

export type ArenaRagSeedPassage = Readonly<{
  id: string;
  sourceId: string;
  sourceTitle: string;
  documentLocation: string;
  localSourcePath: string;
  attributedReferences: readonly string[];
  rightsBasis: string;
  topics: readonly ArenaRagTopic[];
  applicableWhen: readonly ArenaRagApplicability[];
  content: string;
}>;

/** Curated, repo-local summaries only; course exercises, answers, and case data are not ingested. */
export const BLIND_DISCARD_ARENA_RAG_SEED_CORPUS = Object.freeze({
  corpusVersion: "blind-discard-arena-seeds/v1",
  passages: Object.freeze([
    Object.freeze({
      id: "effective-tile-counts",
      sourceId: "course.lesson.0001",
      sourceTitle: "第 1 课｜有效牌，不只是‘有几种’",
      documentLocation: "本课只记一条 / 概念说明",
      localSourcePath: "course/lessons/0001-effective-tiles-and-live-counts.html#本课只记一条",
      attributedReferences: Object.freeze(["https://github.com/MahjongRepository/mahjong"]),
      rightsBasis: "仓库课程作者原创概念的本地摘要；没有复制外部教材或练习题文本。课程列明的技术参考仅用于溯源。",
      topics: Object.freeze(["tile-efficiency"]),
      applicableWhen: Object.freeze(["general-discard-choice", "complete-visibility-only"]),
      content: "比较弃牌后的进张机会时，先比较向听数；同层比较再合并能降低向听数的不同牌种，避免从多种拆法重复计数。每种牌的未知剩余枚数需从四张上限中扣除手牌与可见牌。形状改良不等同于直接降低向听数。适用限制：具体枚数依赖完整的决策时可见牌信息。",
    } satisfies ArenaRagSeedPassage),
    Object.freeze({
      id: "overlapping-shapes",
      sourceId: "course.lesson.0006",
      sourceTitle: "第 6 课｜四连形与中膨形不要早拆",
      documentLocation: "本课只记一条 / 概念说明",
      localSourcePath: "course/lessons/0006-compound-shapes-abcd-abbc.html#本课只记一条",
      attributedReferences: Object.freeze(["https://dainachiba.github.io/RiichiBooks/"]),
      rightsBasis: "仓库课程作者原创概念的本地摘要；没有复制外部教材或练习题文本。课程列明的技术参考仅用于溯源。",
      topics: Object.freeze(["shape-flexibility"]),
      applicableWhen: Object.freeze(["general-discard-choice"]),
      content: "一组数牌可能有多种互相重叠的面子、搭子或雀头拆法；评价牌形时应保留这些可替代解释，不能把共享牌张误当成互不相关的块。可用的后续形状不等于已经兑现的进张或打点。适用限制：这只是结构描述，不单独决定唯一弃牌，也不替代规则、可见牌枚数或防守因素。",
    } satisfies ArenaRagSeedPassage),
  ] satisfies readonly ArenaRagSeedPassage[]),
});
