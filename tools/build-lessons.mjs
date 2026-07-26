import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve("lessons");
fs.mkdirSync(outputDir, { recursive: true });

const names = JSON.parse(fs.readFileSync(path.resolve("assets/tiles/manifest.json"), "utf8"));

function tile(id, state = "") {
  const item = names[id];
  if (!item) throw new Error(`unknown tile ${id}`);
  const badge = state === "discard" ? "舍" : state === "effective" ? "进" : "";
  return `<span class="tile-wrap${state ? ` ${state}` : ""}">${badge ? `<span class="tile-badge">${badge}</span>` : ""}<img class="tile" src="../assets/tiles/${item.file}" alt="${item.name}"></span>`;
}

function rack(ids, label, states = {}) {
  return `<div class="tile-rack" role="img" aria-label="${label}"><span class="tile-group">${ids.map((id, index) => tile(id, states[index] || "")).join("")}</span></div>`;
}

function concept(term, text) {
  return `<article class="concept"><strong>${term}</strong>${text}</article>`;
}

const commonSource = {
  label: "Daina Chiba《Riichi Book I》",
  url: "https://dainachiba.github.io/RiichiBooks/"
};

const lessons = [
  {
    slug: "0001-effective-tiles-and-live-counts",
    id: "lesson-0001",
    title: "有效牌，不只是“有几种”",
    objective: "先保留最低向听，再把有效牌种换算成实际剩余枚数。",
    principle: "先向听，后枚数；先列牌种，再扣已知牌。",
    concepts: [
      ["有效牌种","摸入后能让向听数下降的不同牌名。集合去重后，能防止漏算或重复计算。"],
      ["剩余枚数","每一种有效牌在未知区域最多还剩多少张。它比“有几种”更接近真实摸入机会。"]
    ],
    exampleTitle: "一眼看出：先切无关浮牌",
    exampleTiles: ["1m","2m","3m","4m","5m","6m","7p","8p","9p","2s","3s","5z","5z","9s"],
    exampleLabel: "三个完成面子、二三索搭子、白牌对子和九索浮牌",
    exampleStates: {13:"discard"},
    exampleHtml: `${rack(["1s","4s"],"一索和四索是有效牌",{0:"effective",1:"effective"})}
      <p>切掉标红的浮牌后，手牌进入<strong>听牌，也就是零向听</strong>。最后的搭子可由两端任一张完成。</p>
      <div class="calculation">一索：4 枚　＋　四索：4 枚　＝　2 种、8 枚</div>
      <p class="note">原版页面把这里称为“一向听”，这是错误的：舍牌后只差一次摸牌即可和牌，严格名称是零向听／听牌。</p>`,
    quizzes: [
      {
        prompt: `${rack(["2m","5m","8p"],"二万五万八筒三种有效牌")}三种有效牌分别还剩三、四、三枚。应怎样描述？`,
        choices: [
          ["三种有效牌，共十枚",true,"牌种是三个不同名字；剩余枚数为三加四加三，共十枚。"],
          ["十种有效牌，共十枚",false,"十是实体牌数量，不是不同牌名的数量。"],
          ["三种有效牌，共三枚",false,"三只是牌种数，不能代替逐种剩余枚数之和。"]
        ]
      },
      {
        prompt: `${rack(["3s","3s"],"手中已有两张三索")}三索是有效牌，公开区域没有三索。未知区域最多还有几张？`,
        choices: [
          ["未知区最多四张牌",false,"每种牌总共四张，手中两张必须先扣除。"],
          ["未知区最多两张牌",true,"四减手中两张，再减公开零张，剩两张。"],
          ["未知区最多零张牌",false,"手中有对子不代表另外两张已经消失。"]
        ]
      },
      {
        prompt: "候选甲保持一向听、有效牌八枚；候选乙退为二向听、却有十五枚牌能改善形状。纯进攻效率先选谁？",
        choices: [
          ["优先选择候选甲方案",true,"向听数严格更低时先胜出；乙的十五枚只是改善，不是同层有效牌。"],
          ["优先选择候选乙方案",false,"把改善牌数量放在向听数之前，会系统性退向听。"],
          ["两个候选完全等价值",false,"二者舍牌后的向听数不同，因此不是平手。"]
        ]
      }
    ],
    retrieval: "闭眼复述：向听数、有效牌种、剩余枚数三者的比较顺序。",
    source: {label:"MahjongRepository 可审查向听实现",url:"https://github.com/MahjongRepository/mahjong"}
  },
  {
    slug: "0002-wait-shapes-and-direct-ukeire",
    id: "lesson-0002",
    title: "两面为何值八枚",
    objective: "从实际完成牌数量理解两面、嵌张与边张，不再只背好形与愚形。",
    principle: "两面通常有两种完成牌；嵌张与边张通常只有一种。",
    concepts: [
      ["两面","连续中间两张，可由左端或右端完成。未见牌时通常两种八枚。"],
      ["嵌张与边张","隔一张的嵌张、靠边的边张都只由一种牌直接完成，未见牌时通常四枚。"]
    ],
    exampleTitle: "直接进张的量纲统一",
    exampleTiles: ["2s","3s","2p","4p","1m","2m"],
    exampleLabel: "二三索两面、二四筒嵌张、一二万边张",
    exampleHtml: `<p>把三个搭子分别独立看：</p>
      ${rack(["1s","4s"],"二三索接受一索和四索",{0:"effective",1:"effective"})}
      <div class="calculation">两面：两种 × 四枚 ＝ 八枚</div>
      ${rack(["3p","3m"],"嵌张只接受三筒，边张只接受三万",{0:"effective",1:"effective"})}
      <div class="calculation">嵌张：一种四枚　｜　边张：一种四枚</div>
      <p>这是“直接完成搭子”这一层的比较；下一课才加入改良。</p>`,
    quizzes: [
      {
        prompt: `${rack(["6m","7m"],"六七万搭子")}未见相关牌时，它的直接完成牌是哪一组？`,
        choices: [
          ["五万与八万共八枚",true,"六七万是两面，左右两端都可组成顺子。"],
          ["只有五万共四枚牌",false,"遗漏了八万也能组成六七八万。"],
          ["只有八万共四枚牌",false,"遗漏了五万也能组成五六七万。"]
        ]
      },
      {
        prompt: `${rack(["3p","5p"],"三五筒搭子")}未见相关牌时，直接进张是多少？`,
        choices: [
          ["四筒一种共四枚牌",true,"中间缺四筒，这是典型嵌张。"],
          ["二筒六筒共八枚牌",false,"二筒或六筒都不能直接把三五筒组成顺子。"],
          ["三筒五筒共六枚牌",false,"重复自身不能直接完成顺子。"]
        ]
      },
      {
        prompt: `${rack(["1s","2s"],"一二索搭子")}为什么它与三五筒的直接枚数相同？`,
        choices: [
          ["都仅靠一种牌完成",true,"一二索只靠三索；三五筒只靠四筒。"],
          ["都能靠左右两端完成",false,"这描述的是两面，不是边张或嵌张。"],
          ["都必须先改良再完成",false,"两者都有一张能直接完成的有效牌。"]
        ]
      }
    ],
    retrieval: "回忆第一课：两种八枚中的“两种”与“八枚”分别是什么量？",
    source: commonSource
  },
  {
    slug: "0003-penchan-versus-kanchan-improvement",
    id: "lesson-0003",
    title: "边张与嵌张并非永远相等",
    objective: "在直接进张相同时，用下一巡的形状改良解释边张与嵌张的差距。",
    principle: "一次进张打平时，再看不降向听的摸牌能否换成两面。",
    concepts: [
      ["一次进张","当前下一张牌能否立刻降低向听数。边张和嵌张在这一层常同为四枚。"],
      ["二次改良","摸入后暂时不降向听，却让下一阶段接受牌变多或质量变好。它用于同层破平。"]
    ],
    exampleTitle: "为什么中间嵌张更有弹性",
    exampleTiles: ["1s","2s","1p","3p"],
    exampleLabel: "一二索边张与一三筒嵌张",
    exampleHtml: `<p>两组的直接完成都只有一种：</p>
      ${rack(["3s","2p"],"三索完成边张，二筒完成嵌张",{0:"effective",1:"effective"})}
      <p>但嵌张摸到右侧相邻牌后，可以替换掉最外侧牌，留下新的两面：</p>
      ${rack(["1p","3p","4p"],"一三四筒摸到四筒后可保留三四筒")}
      ${rack(["3p","4p"],"三四筒成为两面")}
      <div class="calculation">直接层：四枚 对 四枚　→　改良层：能转两面者优先</div>`,
    quizzes: [
      {
        prompt: `${rack(["1m","3m","4m"],"一三四万复合形")}若当前只需保留一个搭子，哪组最有前景？`,
        choices: [
          ["保留三四万的两面",true,"舍去一万后，三四万接受二万与五万。"],
          ["保留一三万的嵌张",false,"一三万只接受二万，直接枚数更少。"],
          ["拆掉三四万留一万",false,"这会把已形成的两面退成单张。"]
        ]
      },
      {
        prompt: "边张与嵌张直接进张都为四枚时，下一步先比较什么？",
        choices: [
          ["比较转成两面的改良",true,"同向听、同直接枚数后，改良能力用于破平。"],
          ["直接认定两者永远相同",false,"直接进张相同不代表未来状态完全相同。"],
          ["忽略牌形只比较打点",false,"本阶段目标是纯进攻成牌速度。"]
        ]
      },
      {
        prompt: `${rack(["1s","2s","4s"],"一二四索复合形")}摸入三索时发生什么？`,
        choices: [
          ["完成顺子并留下四索",true,"一二三索组成面子，四索成为剩余浮牌。"],
          ["形成两组独立的两面",false,"四张中只有一二三索已经完成，四索单独留下。"],
          ["手牌向听数必然不变",false,"若该搭子正是缺少的面子，摸三索会降低向听。"]
        ]
      }
    ],
    retrieval: "先说直接进张，再说改良；不要把两层混成一个神秘分数。",
    source: commonSource
  },
  {
    slug: "0004-floating-tile-value",
    id: "lesson-0004",
    title: "浮牌价值来自可连接范围",
    objective: "用能形成搭子的邻近牌数量解释中张、二八与幺九浮牌等级。",
    principle: "没有上下文干涉时，三至七最灵活，二八次之，幺九最窄。",
    concepts: [
      ["中张浮牌","三至七可与左右距离一或二的多种牌形成搭子，潜在连接范围广。"],
      ["幺九浮牌","一与九只向牌河内侧延伸，形成搭子的路径较少。字牌更只靠自身成对或成刻。"]
    ],
    exampleTitle: "把浮牌变成可数的连接",
    exampleTiles: ["1m","2m","3m","5m","8m","9m"],
    exampleLabel: "一二三五八九万六种浮牌",
    exampleHtml: `<p>以五万为例，摸到距离一或二的牌都能立刻形成一个搭子：</p>
      ${rack(["3m","4m","6m","7m"],"五万可连接三四六七万",{0:"effective",1:"effective",2:"effective",3:"effective"})}
      <div class="calculation">五万：四种邻近牌　｜　二万：三种邻近牌　｜　一万：两种邻近牌</div>
      <p class="note">这是“形成搭子”的改良宽度，不等于降低向听的有效牌。只有在五牌块尚未齐备时，浮牌连接范围才有较高权重。</p>`,
    quizzes: [
      {
        prompt: `${rack(["1p","5p"],"一筒与五筒两个浮牌")}牌块不足且无可见牌干涉，通常保留哪张？`,
        choices: [
          ["优先保留中间五筒",true,"五筒向两侧各有两档连接，形成好搭子的路径更多。"],
          ["优先保留边缘一筒",false,"一筒只能向内侧连接，灵活性较低。"],
          ["两张浮牌完全相同",false,"它们可连接的邻近牌种数量不同。"]
        ]
      },
      {
        prompt: `${rack(["2s","8s"],"二索与八索两个浮牌")}忽略其他牌时，二者关系如何？`,
        choices: [
          ["关于牌面中心近似对称",true,"二索与八索的连接范围镜像对应。"],
          ["二索固定强于八索牌",false,"没有上下文时它们是镜像结构。"],
          ["八索固定强于二索牌",false,"没有上下文时它们是镜像结构。"]
        ]
      },
      {
        prompt: "手牌已经有五个完整且合格的牌块时，浮牌连接范围还应放在哪一层？",
        choices: [
          ["放在直接有效牌之后",true,"五块已齐时，先比较保持向听和直接进张；浮牌改良用于破平。"],
          ["放在向听数判断之前",false,"浮牌再灵活也不应优先导致退向听。"],
          ["完全忽略所有有效牌",false,"有效牌仍是同向听候选的主要量。"]
        ]
      }
    ],
    retrieval: "说出浮牌价值的来源，不要只背“三至七强”。",
    source: commonSource
  },
  {
    slug: "0005-five-block-and-shanten",
    id: "lesson-0005",
    title: "五牌块是手牌骨架",
    objective: "把整手牌压缩为四个面子槽与一个雀头槽，快速发现缺块或多块。",
    principle: "普通和牌需要五个功能块：四个面子与一个雀头。",
    concepts: [
      ["牌块不足","少于五块时，浮牌的连接能力很重要，因为你还需要制造新搭子。"],
      ["牌块过剩","多于五块时，必须让一个块退出；比较的是拆掉哪块损失最小。"]
    ],
    exampleTitle: "先数块，再精算",
    exampleTiles: ["1m","2m","3m","4m","5m","6m","2p","3p","6s","7s","5z","5z","9p","1s"],
    exampleLabel: "两个完成面子、两个搭子、一个对子和两个浮牌",
    exampleHtml: `<p>这手已经拥有：两个完成面子、两个搭子、一个对子，共<strong>五个功能块</strong>。两张孤立牌不必承担造块任务。</p>
      ${rack(["1m","2m","3m","4m","5m","6m"],"两个完成面子")}
      ${rack(["2p","3p","6s","7s"],"两个两面搭子")}
      ${rack(["5z","5z"],"白牌对子")}
      <div class="calculation">二面子 ＋ 二搭子 ＋ 一对子 ＝ 五块</div>
      <p>因此优先从两张真正的浮牌中比较，而不是随意拆掉现成两面。</p>`,
    quizzes: [
      {
        prompt: "普通四面子一雀头手牌，目标功能块总数是多少？",
        choices: [
          ["目标总数正好五块",true,"四个面子槽加一个雀头槽，共五块。"],
          ["目标总数正好四块",false,"四个面子之外还必须有一个雀头。"],
          ["目标总数正好六块",false,"六块意味着最终至少有一块要退出。"]
        ]
      },
      {
        prompt: `${rack(["2m","3m","6p","7p","2s","4s","5z","5z"],"两面两面嵌张与对子四个牌块")}只有四个功能块时，孤立五万的主要价值是什么？`,
        choices: [
          ["帮助制造第五个牌块",true,"牌块不足时，中张浮牌可连接多种邻牌，承担造块任务。"],
          ["立即充当完成的面子",false,"单张牌本身不是面子。"],
          ["直接充当固定的雀头",false,"单张牌需要再摸同种牌才能成为对子。"]
        ]
      },
      {
        prompt: "已经数出六个可用牌块时，正确的下一步是什么？",
        choices: [
          ["比较拆哪块损失最小",true,"最终只需五块，必须选择一个退出。"],
          ["把六个牌块全部保留",false,"手牌张数不允许六块都成为最终和牌结构。"],
          ["立即拆掉最强的两面",false,"应比较损失，通常不会先拆最强块。"]
        ]
      }
    ],
    retrieval: "用一句话解释牌块不足时为什么浮牌更值钱。",
    source: commonSource
  },
  {
    slug: "0006-compound-shapes-abcd-abbc",
    id: "lesson-0006",
    title: "四连形与中膨形不要早拆",
    objective: "识别共享牌张的复合结构，避免把它们误算成一个普通搭子加一张浮牌。",
    principle: "一张牌能同时参与多种拆法时，牌块价值来自“重叠解释”。",
    concepts: [
      ["四连形","四张连续数牌可解释成左右两个两面，也可完成顺子后留下相邻浮牌。"],
      ["中膨形","两端相邻、中间重复的四张牌同时具有顺子、对子与两面方向。"]
    ],
    exampleTitle: "同四张牌，多条进路",
    exampleTiles: ["3m","4m","5m","6m","3p","4p","4p","5p"],
    exampleLabel: "三四五六万四连形与三四四五筒中膨形",
    exampleHtml: `${rack(["3m","4m","5m","6m"],"三四五六万四连形")}
      <p>左侧三四万接受二万、五万；右侧五六万接受四万、七万。中间牌还共享顺子解释。</p>
      ${rack(["3p","4p","4p","5p"],"三四四五筒中膨形")}
      <p>它既含三四筒与四五筒两个两面方向，又可把四筒看作对子候选。提前切掉中间牌会同时损失多种功能。</p>
      <div class="calculation">复合形价值 ＝ 多种有效拆法的并集 − 重复牌种</div>`,
    quizzes: [
      {
        prompt: `${rack(["4s","5s","6s","7s"],"四五六七索四连形")}为什么不能只把它看成四五索加六七索？`,
        choices: [
          ["两组搭子共享顺子解释",true,"中间牌可在不同完成路径中重新组合，结构不是两块完全独立。"],
          ["四张牌已经是完整面子",false,"一个面子只有三张；四连形仍多一张。"],
          ["四张牌只能等待一种牌",false,"四连形通常向多个方向延伸。"]
        ]
      },
      {
        prompt: `${rack(["2p","3p","3p","4p"],"二三三四筒中膨形")}其中哪张通常不应当作普通浮牌轻易切掉？`,
        choices: [
          ["中间重复的三筒牌",true,"三筒同时服务顺子、对子和两侧搭子解释。"],
          ["左端单独的二筒牌",false,"二筒也参与二三筒两面，但不具有中间重复牌的全部功能。"],
          ["右端单独的四筒牌",false,"四筒也参与三四筒两面，但不具有中间重复牌的全部功能。"]
        ]
      },
      {
        prompt: "计算复合形有效牌时，最常见的数量错误是什么？",
        choices: [
          ["把共享有效牌重复相加",true,"不同拆法可能接受同一张牌，集合并集必须去重。"],
          ["把每种牌都固定算四枚",false,"还要扣手牌与公开牌，但这不是复合形特有错误。"],
          ["先比较舍牌后的向听数",false,"这恰好是正确的第一步。"]
        ]
      }
    ],
    retrieval: "画出一组四连形，并口述它包含的两个两面方向。",
    source: commonSource
  },
  {
    slug: "0007-reinforced-taatsu-2334",
    id: "lesson-0007",
    title: "强化搭子：中间牌不是浮牌",
    objective: "理解两端相邻且中间成对的四张结构，解释为何中间牌常强于同种孤张。",
    principle: "牌的价值取决于它在整组中的功能数量，不取决于牌面名字。",
    concepts: [
      ["双两面解释","两三索与三四索共享中间三索，左右都可能伸展。"],
      ["对子保险","中间的对子还可承担雀头或碰成刻子的结构角色。"]
    ],
    exampleTitle: "同是三索，结构位置不同",
    exampleTiles: ["2s","3s","3s","4s","3p"],
    exampleLabel: "二三三四索强化搭子与孤立三筒",
    exampleHtml: `${rack(["2s","3s","3s","4s"],"二三三四索强化搭子")}
      ${rack(["3p"],"孤立三筒")}
      <p>强化搭子中的三索同时属于两三索、三四索、三索对子和二三四索顺子解释；孤立三筒目前只有未来连接潜力。</p>
      ${rack(["1s","2s","3s","4s","5s"],"强化搭子向一至五索多方向响应",{0:"effective",4:"effective"})}
      <div class="calculation">局部牌名相同 ≠ 结构价值相同</div>`,
    quizzes: [
      {
        prompt: `${rack(["2m","3m","3m","4m"],"二三三四万强化搭子")}中间三万具有什么额外功能？`,
        choices: [
          ["兼具对子与两侧连接",true,"三万重复且连接二万、四万，承担多种解释。"],
          ["只是一张普通的浮牌",false,"它已参与多个现成结构。"],
          ["已经固定成为一个刻子",false,"只有两张三万，还不是刻子。"]
        ]
      },
      {
        prompt: "为什么强化搭子中的中间牌通常强于异色同数字孤张？",
        choices: [
          ["它参与更多现有拆法",true,"结构功能数量决定局部牌力。"],
          ["同花色永远提高打点",false,"纯牌效率讨论的不是固定打点。"],
          ["中间数字必定成为宝牌",false,"宝牌与数字位置没有这种必然关系。"]
        ]
      },
      {
        prompt: "比较强化搭子与浮牌时，仍必须先检查什么？",
        choices: [
          ["舍牌是否改变向听数",true,"任何形状口诀都服从向听优先。"],
          ["牌面颜色是否更鲜艳",false,"视觉颜色不参与牌效率计算。"],
          ["这一局是否已经流局",false,"流局不是当前何切比较层。"]
        ]
      }
    ],
    retrieval: "用“功能数量”而不是“牌名”解释中间牌为何强。",
    source: commonSource
  },
  {
    slug: "0008-pair-selection",
    id: "lesson-0008",
    title: "对子既是雀头，也是未完成块",
    objective: "在多个对子之间选择雀头与拆解对象，避免把所有对子都当成同价值。",
    principle: "第一个对子解决雀头；额外对子要和搭子竞争牌块名额。",
    concepts: [
      ["唯一对子","在没有其他雀头时，它具有结构刚需，轻易拆掉会增加找对子任务。"],
      ["额外对子","两个对子可形成双碰方向；对子过多时，剩余副本少、形成刻子的效率会下降。"]
    ],
    exampleTitle: "两个对子时，不急着定死雀头",
    exampleTiles: ["5m","5m","6p","6p","2s","3s","4s"],
    exampleLabel: "五万对子、六筒对子与二三四索顺子",
    exampleHtml: `${rack(["5m","5m","6p","6p"],"五万和六筒两个对子")}
      <p>若进入双碰听牌，两种牌各剩两枚，理论合计四枚；若其中一对周围能形成顺子，它还可能转成数牌搭子。</p>
      ${rack(["4m","5m","5m","6m"],"五万对子周围有四万和六万时可转顺子")}
      <p>因此数牌对子与无役字牌对子不总是等价；但唯一对子仍优先承担雀头。</p>
      <div class="calculation">唯一对子：结构价值高　｜　第二对子：双碰＋改良　｜　过多对子：块过剩</div>`,
    quizzes: [
      {
        prompt: "普通手牌完全没有其他对子时，拆掉唯一对子会新增什么任务？",
        choices: [
          ["必须重新寻找一个雀头",true,"四个面子之外仍需要两张相同牌。"],
          ["必须重新寻找两个面子",false,"拆对子并不会同时消灭两个面子。"],
          ["必须立刻改做七对子",false,"本课程当前不采用七对子路线。"]
        ]
      },
      {
        prompt: `${rack(["5s","5s","6s","6s"],"五索与六索两个相邻对子")}这组牌为什么比两个孤立字牌对子更灵活？`,
        choices: [
          ["还能向顺子方向改良",true,"相邻数牌可借周围牌形成顺子结构。"],
          ["一定能同时形成两刻子",false,"刻子仍需要各自再摸同种牌。"],
          ["已经算作两个完整面子",false,"对子不是完整面子。"]
        ]
      },
      {
        prompt: "出现三个以上对子且走普通手时，最该警惕什么？",
        choices: [
          ["对子占用过多牌块名额",true,"最终只需一个雀头，其余对子必须转刻子、顺子或退出。"],
          ["所有对子都必须保到底",false,"这会让普通手结构僵化。"],
          ["对子数量会自动降向听",false,"是否降向听取决于整手结构。"]
        ]
      }
    ],
    retrieval: "说明“第一个对子”和“第二个对子”的结构价值为何不同。",
    source: commonSource
  },
  {
    slug: "0009-six-block-theory",
    id: "lesson-0009",
    title: "六牌块：主动淘汰最弱块",
    objective: "当手牌有六个候选块时，用损失最小原则决定拆哪块。",
    principle: "六块手最终必弃一块；现在比较的是每次删除造成的边际损失。",
    concepts: [
      ["保留六块的代价","短期看似进张多，但块之间争夺有限张数，常造成有效牌重复和最终愚形。"],
      ["淘汰顺序","先向听，再直接枚数，再好形率与改良；弱边张、死枚多的搭子常优先退出。"]
    ],
    exampleTitle: "五个槽，六个候选",
    exampleTiles: ["1m","2m","3m","4m","5m","6m","1p","2p","3s","4s","6s","7s","5z","5z"],
    exampleLabel: "两个完成面子、三个搭子和一个对子共六块",
    exampleHtml: `${rack(["1m","2m","3m","4m","5m","6m"],"两个完成面子")}
      ${rack(["1p","2p","3s","4s","6s","7s"],"一个边张与两个两面")}
      ${rack(["5z","5z"],"白牌对子")}
      <p>总计六块，而最终只需五块。若相关牌均未见，边张直接四枚，两个两面各八枚；拆边张的直接损失最小。</p>
      <div class="calculation">候选删除损失：边张四枚　＜　两面八枚</div>
      <p class="note">若边张有效牌全活，而某两面两端已大量见牌，必须用实际剩余枚数重算，不能机械背结论。</p>`,
    quizzes: [
      {
        prompt: "六牌块手为什么必须主动比较拆块？",
        choices: [
          ["最终结构只容纳五块",true,"普通和牌是四面子加一雀头。"],
          ["第六块会自动变成宝牌",false,"牌块数量与宝牌无关。"],
          ["六块一定已经完成和牌",false,"六块是候选结构过剩，不是完成。"]
        ]
      },
      {
        prompt: `${rack(["1p","2p","4s","5s"],"一二筒边张与四五索两面")}相关牌全活且其他条件相同，通常拆哪组？`,
        choices: [
          ["优先拆一二筒边张",true,"边张直接四枚，两面直接八枚，删除边张损失较小。"],
          ["优先拆四五索两面",false,"这会丢掉更宽的直接进张。"],
          ["两组必须随机选择",false,"直接剩余枚数已经给出排序依据。"]
        ]
      },
      {
        prompt: "什么情况可能推翻“先拆边张”的默认结论？",
        choices: [
          ["可见牌令实际枚数反转",true,"牌山剩余枚数比形状标签更具体。"],
          ["边张牌面颜色较好看",false,"视觉偏好不参与效率计算。"],
          ["两面名称听起来更长",false,"术语长度与成牌概率无关。"]
        ]
      }
    ],
    retrieval: "六块不是越多越好；说出删除候选的比较层次。",
    source: commonSource
  },
  {
    slug: "0010-visible-tile-interference",
    id: "lesson-0010",
    title: "可见牌会让形状排名反转",
    objective: "把手牌、牌河与副露中的已知牌全部扣除，处理重复有效牌和死枚。",
    principle: "牌形给出候选集合；可见牌决定真实剩余枚数。",
    concepts: [
      ["已知牌","手牌、所有牌河、副露与明杠中的牌都不在未知摸牌池中。王牌未知，不能擅自扣除。"],
      ["枚数干涉","同一种有效牌可能被其他牌块占用，也可能已经公开；每种实体牌最多只有四张。"]
    ],
    exampleTitle: "八枚两面也可能只剩五枚",
    exampleTiles: ["2s","3s","1s","4s","4s"],
    exampleLabel: "二三索两面，一索已见一张，四索已见两张",
    exampleHtml: `${rack(["2s","3s"],"二三索两面")}
      <p>理论有效牌是两端各四枚；现在把已知牌划掉：</p>
      ${rack(["1s","1s","1s","1s"],"四张一索中一张已知",{0:"known"})}
      ${rack(["4s","4s","4s","4s"],"四张四索中两张已知",{0:"known",1:"known"})}
      <div class="calculation">一索剩 3 枚　＋　四索剩 2 枚　＝　实际 5 枚</div>
      <p>如果另一个嵌张仍有四枚全活，这个受损两面只领先一枚；后续改良与最终听牌质量就可能决定取舍。</p>`,
    quizzes: [
      {
        prompt: `${rack(["3m","3m","3m"],"手中已有三张三万")}三万是某候选的有效牌，外部未见。还剩几张？`,
        choices: [
          ["未知区域只剩一张牌",true,"四张总数减去手中三张，剩一张。"],
          ["未知区域仍剩三张牌",false,"手里的三张不能继续从牌山摸到。"],
          ["未知区域仍剩四张牌",false,"忽略手牌会高估三张。"]
        ]
      },
      {
        prompt: "同一张五筒同时完成两个重叠牌块时，应怎样计数？",
        choices: [
          ["牌种并集只计算一次",true,"同一实体牌不能因为两种解释而复制。"],
          ["每个牌块各计算四次",false,"这会把最多四张牌虚增为八张。"],
          ["直接从有效牌中删除",false,"重叠不代表无效，只代表不能重复相加。"]
        ]
      },
      {
        prompt: "王牌中的未知牌是否应在普通可见牌计算里提前扣除？",
        choices: [
          ["未知位置不能直接扣除",true,"你不知道具体哪些牌在王牌中，只能基于已知信息计算。"],
          ["固定扣除每种一张牌",false,"王牌组成不是每种牌各一张。"],
          ["固定扣除全部有效牌",false,"这会让任何进张都错误归零。"]
        ]
      }
    ],
    retrieval: "口述剩余枚数公式，并指出哪些区域属于已知牌。",
    source: commonSource
  },
  {
    slug: "0011-lexicographic-discard-model",
    id: "lesson-0011",
    title: "完整何切：用词典序，不用万能分",
    objective: "把所有牌效率因素放入严格顺序，对完整十四张手牌形成可复核舍牌结论。",
    principle: "向听数 → 直接剩余枚数 → 进张质量 → 二次改良 → 最终形。",
    concepts: [
      ["词典序","只有上一层打平或近似打平，才进入下一层。避免用随意权重把退向听合理化。"],
      ["候选缩减","先用牌块结构筛出两到四个合理候选，再精算；桌上不必机械分析十四种舍牌。"]
    ],
    exampleTitle: "五层决策树",
    exampleTiles: ["1m","2m","3m","4m","5m","6m","2p","3p","6s","7s","5z","5z","9p","1s"],
    exampleLabel: "用于完整何切的十四张手牌",
    exampleHtml: `<ol>
        <li><strong>向听：</strong>排除拆完成面子或雀头而退向听的候选。</li>
        <li><strong>枚数：</strong>比较切一索与切九筒后，降低向听的实际剩余枚数。</li>
        <li><strong>质量：</strong>若枚数相同，比较进张后是两面还是愚形。</li>
        <li><strong>改良：</strong>再看暂不降向听的摸牌能否扩大下一巡进张。</li>
        <li><strong>最终形：</strong>仍接近时，保留更容易形成好听牌的结构。</li>
      </ol>
      <div class="calculation">不是相加打分；是从第一层开始逐层破平。</div>
      ${rack(["1s","9p"],"一索和九筒是优先比较的浮牌候选",{0:"discard",1:"discard"})}`,
    quizzes: [
      {
        prompt: "候选甲比候选乙少一向听，但乙有更多改良牌。第一判断是什么？",
        choices: [
          ["先选向听更低的甲",true,"改良不能越级覆盖严格的向听优势。"],
          ["先选改良更多的乙",false,"这违反词典序的第一层。"],
          ["把两者分数直接相加",false,"课程模型刻意避免无依据权重。"]
        ]
      },
      {
        prompt: "两个候选同向听，直接剩余枚数分别为十二枚和八枚，其他信息普通。先选谁？",
        choices: [
          ["先选十二枚的候选",true,"同向听后，直接降向听机会更多者优先。"],
          ["先选八枚的候选牌",false,"需要额外强理由才足以补偿四枚差距。"],
          ["跳过枚数先看改良牌",false,"改良位于直接枚数之后。"]
        ]
      },
      {
        prompt: "两个候选同向听、同为八枚直接进张，下一层是什么？",
        choices: [
          ["比较进张后的牌形质量",true,"看哪些进张形成两面、愚形或更好的最终听牌。"],
          ["重新随机选择一个候选",false,"仍有可比较的信息。"],
          ["立即结束所有牌形分析",false,"同枚数只是进入下一层。"]
        ]
      }
    ],
    retrieval: "不看页面，完整说出五层词典序。",
    source: {label:"MahjongRepository 向听算法",url:"https://github.com/MahjongRepository/mahjong"}
  },
  {
    slug: "0012-speed-drills-and-exam",
    id: "lesson-0012",
    title: "从精算到三秒扫描",
    objective: "把完整模型压缩成实战扫描，并用混合题验证迁移而非背题。",
    principle: "第一眼数块与向听，第二眼比直接枚数，第三眼才看改良。",
    concepts: [
      ["三秒扫描","零至一秒找完成面子、雀头与牌块数；一至二秒排除退向听；二至三秒比较最接近候选。"],
      ["慢算复盘","牌桌先用模式缓存，牌后再精确枚举。发现错例就更新模式，不用错口诀保护自尊。"]
    ],
    exampleTitle: "速度来自分层，不来自跳步",
    exampleTiles: ["1m","2m","3m","3m","4m","5m","1p","2p","6p","7p","2s","4s","5z","5z"],
    exampleLabel: "两个完成面子、三个搭子与一个对子组成的六牌块手",
    exampleHtml: `<p><strong>第一扫：</strong>识别一二三万与三四五万两个完成面子、一二筒边张、六七筒两面、二四索嵌张、白牌对子；总计六个功能块。</p>
      ${rack(["6p","7p"],"六七筒两面")}
      ${rack(["2s","4s"],"二四索嵌张")}
      ${rack(["1p","2p"],"一二筒边张")}
      <p><strong>第二扫：</strong>两面八枚、嵌张与边张各四枚；若实际可见牌不反转，先保留两面。</p>
      <p><strong>第三扫：</strong>嵌张与边张直接层打平，再比较转成两面的改良；通常先让更难改良的边张退出。</p>
      <div class="calculation">快判断 ＝ 已验证模式的检索；不是省略向听检查</div>`,
    quizzes: [
      {
        prompt: `${rack(["1p","2p","5s","6s"],"一二筒边张与五六索两面")}六块手、相关牌全活，三秒内先标记哪组为弱候选？`,
        choices: [
          ["先标记一二筒边张",true,"直接四枚低于两面八枚，是明显弱块。"],
          ["先标记五六索两面",false,"两面直接进张更宽。"],
          ["先拆掉已经完成面子",false,"这通常会退向听。"]
        ]
      },
      {
        prompt: "某题你三秒内无法区分两个同向听、同枚数候选，实战最佳处理是什么？",
        choices: [
          ["用改良与最终形破平",true,"进入词典序下一层，并在牌后精算复盘。"],
          ["故意选择退向听方案",false,"不确定不等于放弃第一原则。"],
          ["把两候选都同时舍掉",false,"每巡只能舍一张牌。"]
        ]
      },
      {
        prompt: "毕业后的正确训练循环是什么？",
        choices: [
          ["限时作答再慢算复盘",true,"速度训练与精确反馈结合，才能同时提高流畅度和储存强度。"],
          ["只背答案从不算枚数",false,"遇到新复合形会失去迁移能力。"],
          ["只做慢题从不加计时",false,"这无法建立牌桌上的检索速度。"]
        ]
      }
    ],
    retrieval: "毕业口令：数块与向听、直接枚数、形与改良。",
    source: commonSource
  }
];

function quizHtml(quiz, lessonIndex, quizIndex) {
  const qid = `l${String(lessonIndex + 1).padStart(2,"0")}q${quizIndex + 1}`;
  const choices = quiz.choices.map(([label,correct,explanation]) =>
    `<button class="choice" data-question="${qid}" data-correct="${correct}" data-explanation="${explanation}">${label}</button>`
  ).join("\n");
  return `<article class="practice" id="practice-${quizIndex + 1}">
    <div class="practice-index">RETRIEVAL ${String(quizIndex + 1).padStart(2,"0")}</div>
    <div class="question-prompt">${quiz.prompt}</div>
    <div class="choices">${choices}</div>
    <p class="feedback" id="feedback-${qid}" aria-live="polite"></p>
  </article>`;
}

function buildLesson(lesson, index) {
  const previous = index === 0
    ? `<a href="../index.html">← 返回课程首页</a>`
    : `<a href="${lessons[index - 1].slug}.html">← 上一课：${lessons[index - 1].title}</a>`;
  const next = index === lessons.length - 1
    ? `<a href="../index.html">完成课程，返回总览 →</a>`
    : `<a href="${lessons[index + 1].slug}.html">下一课：${lessons[index + 1].title} →</a>`;
  const conceptHtml = lesson.concepts.map(([term,text]) => concept(term,text)).join("");
  const quizzes = lesson.quizzes.map((quiz, quizIndex) => quizHtml(quiz,index,quizIndex)).join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>第${index + 1}课｜${lesson.title}</title>
  <link rel="stylesheet" href="../assets/course.css">
</head>
<body data-lesson="${lesson.id}">
  <main class="page">
    <nav class="topbar"><a href="../index.html">科学日麻牌效率</a><span class="lesson-status" id="lesson-status">已掌握 0 / 3</span></nav>
    <header class="hero">
      <div>
        <p class="eyebrow">LESSON ${String(index + 1).padStart(2,"0")} · 普通四面子一雀头</p>
        <h1>${lesson.title}</h1>
        <p class="lead">${lesson.objective}</p>
      </div>
      <div class="hero-number">${String(index + 1).padStart(2,"0")}</div>
    </header>
    <section class="lesson-section">
      <h2>本课只记一条</h2>
      <div class="principle">${lesson.principle}</div>
      <div class="concept-grid">${conceptHtml}</div>
    </section>
    <section class="lesson-section" id="worked-example">
      <h2>${lesson.exampleTitle}</h2>
      <div class="worked">
        ${rack(lesson.exampleTiles,lesson.exampleLabel,lesson.exampleStates || {})}
        ${lesson.exampleHtml}
      </div>
    </section>
    <section class="lesson-section">
      <h2>主动检索</h2>
      <p>${lesson.retrieval}</p>
      ${quizzes}
    </section>
    <section class="lesson-section source">
      <p>主要来源：<a href="${lesson.source.url}">${lesson.source.label}</a>。资料提供定义与策略背景；课内具体枚数按四张同种牌和已知牌扣除复核。</p>
      <p><a href="../reference/decision-model.html">打开完整何切决策树</a> · <a href="../reference/effective-tiles.html">打开有效牌速查表</a></p>
      <p>有任何一步不清楚，继续追问你的教师。不要只报答案，请说明自己比较到哪一层。</p>
    </section>
    <nav class="lesson-nav">${previous}${next}</nav>
  </main>
  <script type="module" src="../assets/course.js"></script>
</body>
</html>
`;
}

for (const [index, lesson] of lessons.entries()) {
  fs.writeFileSync(path.join(outputDir, `${lesson.slug}.html`), buildLesson(lesson,index), "utf8");
}

console.log(`generated ${lessons.length} complete lessons`);
