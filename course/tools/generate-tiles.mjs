import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve("assets/tiles");
fs.mkdirSync(outputDir, { recursive: true });

const cnNumbers = ["一","二","三","四","五","六","七","八","九"];
const manifest = {};

function shell(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 96" role="img">
  <rect x="2" y="2" width="68" height="92" rx="8" fill="#fffef9" stroke="#26312c" stroke-width="3"/>
  <path d="M10 88h52" stroke="#d9ddd8" stroke-width="2"/>
  ${content}
</svg>
`;
}

function write(id, name, content) {
  const file = `${id}.svg`;
  fs.writeFileSync(path.join(outputDir, file), shell(content), "utf8");
  manifest[id] = { name, file };
}

for (let number = 1; number <= 9; number += 1) {
  const id = `${number}m`;
  const name = `${cnNumbers[number - 1]}万`;
  const numeralColor = number === 5 ? "#b52a2a" : "#17231e";
  write(id, name, `
  <text x="36" y="48" text-anchor="middle" font-family="Noto Serif CJK SC,SimSun,serif" font-size="35" font-weight="700" fill="${numeralColor}">${cnNumbers[number - 1]}</text>
  <text x="36" y="79" text-anchor="middle" font-family="Noto Serif CJK SC,SimSun,serif" font-size="26" font-weight="700" fill="#b52a2a">萬</text>`);
}

const pipLayouts = {
  1:[[36,48]],
  2:[[24,31],[48,65]],
  3:[[22,28],[36,48],[50,68]],
  4:[[23,29],[49,29],[23,67],[49,67]],
  5:[[22,27],[50,27],[36,48],[22,69],[50,69]],
  6:[[22,24],[50,24],[22,48],[50,48],[22,72],[50,72]],
  7:[[20,23],[36,23],[52,23],[27,46],[45,46],[27,70],[45,70]],
  8:[[22,20],[50,20],[22,38],[50,38],[22,58],[50,58],[22,76],[50,76]],
  9:[[20,21],[36,21],[52,21],[20,48],[36,48],[52,48],[20,75],[36,75],[52,75]]
};
const pipColors = ["#b52a2a","#14735c","#255fa7"];

for (let number = 1; number <= 9; number += 1) {
  const pips = pipLayouts[number].map(([x,y], index) => {
    const color = number === 1 ? "#b52a2a" : pipColors[index % pipColors.length];
    const radius = number === 1 ? 17 : number >= 7 ? 6.5 : 8;
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="${color}" stroke-width="${number === 1 ? 5 : 3}"/><circle cx="${x}" cy="${y}" r="${Math.max(2,radius/3)}" fill="${color}"/>`;
  }).join("\n  ");
  write(`${number}p`, `${cnNumbers[number - 1]}筒`, pips);
}

function bamboo(x, y, color, rotation = 0, scale = 1) {
  return `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">
    <rect x="-4" y="-13" width="8" height="26" rx="3" fill="${color}"/>
    <path d="M-5-4h10M-5 5h10" stroke="#fffef9" stroke-width="2"/>
    <path d="M0-13v26" stroke="#143f34" stroke-width="1" opacity=".35"/>
  </g>`;
}

const bambooLayouts = {
  2:[[-13,-17,0],[13,17,0]],
  3:[[-14,-20,-8],[14,-1,8],[0,22,0]],
  4:[[-13,-18,0],[13,-18,0],[-13,20,0],[13,20,0]],
  5:[[-15,-20,0],[15,-20,0],[0,0,0],[-15,20,0],[15,20,0]],
  6:[[-15,-23,0],[15,-23,0],[-15,0,0],[15,0,0],[-15,23,0],[15,23,0]],
  7:[[-16,-25,-8],[0,-25,0],[16,-25,8],[-12,0,0],[12,0,0],[-12,24,0],[12,24,0]],
  8:[[-14,-27,0],[14,-27,0],[-14,-9,0],[14,-9,0],[-14,11,0],[14,11,0],[-14,29,0],[14,29,0]],
  9:[[-16,-27,0],[0,-27,0],[16,-27,0],[-16,0,0],[0,0,0],[16,0,0],[-16,27,0],[0,27,0],[16,27,0]]
};

write("1s", "一索", `
  <g transform="translate(36 49)">
    <path d="M0-31C18-27 23-11 10 1C22 8 18 27 0 33C-18 27-22 8-10 1C-23-11-18-27 0-31Z" fill="#14735c"/>
    <path d="M0-22C9-18 10-9 3-4C10 1 8 12 0 17C-8 12-10 1-3-4C-10-9-9-18 0-22Z" fill="#255fa7"/>
    <circle cx="0" cy="-7" r="5" fill="#b52a2a"/>
    <path d="M-23 19L0 8L23 19M-18 29L0 17L18 29" fill="none" stroke="#14735c" stroke-width="5" stroke-linecap="round"/>
  </g>`);

for (let number = 2; number <= 9; number += 1) {
  const shapes = bambooLayouts[number].map(([dx,dy,rotation], index) => {
    const color = index % 3 === 0 ? "#b52a2a" : index % 2 === 0 ? "#255fa7" : "#14735c";
    return bamboo(36 + dx, 48 + dy, color, rotation, number >= 7 ? 0.78 : 0.9);
  }).join("\n  ");
  write(`${number}s`, `${cnNumbers[number - 1]}索`, shapes);
}

const honors = [
  ["1z","东","東","#17231e"],
  ["2z","南","南","#17231e"],
  ["3z","西","西","#17231e"],
  ["4z","北","北","#17231e"],
  ["5z","白","白","#255fa7"],
  ["6z","发","發","#14735c"],
  ["7z","中","中","#b52a2a"]
];

for (const [id,name,face,color] of honors) {
  const content = id === "5z"
    ? `<rect x="18" y="22" width="36" height="50" rx="3" fill="none" stroke="${color}" stroke-width="5"/>`
    : `<text x="36" y="67" text-anchor="middle" font-family="Noto Serif CJK SC,SimSun,serif" font-size="46" font-weight="800" fill="${color}">${face}</text>`;
  write(id, name, content);
}

fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`generated ${Object.keys(manifest).length} vector tiles`);
