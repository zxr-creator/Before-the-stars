// Generate Traditional Chinese dictionaries from the Simplified ones.
//   node scripts/make-zh-hant.mjs
// Uses OpenCC (Simplified -> Traditional with Taiwan phrasing). OpenCC's Taiwan phrase table is
// tuned for software text and rewrites ordinary words of this game into computing jargon
// (交往对象 → 交往物件, 生态循环 → 生態迴圈, 通过验收 → 透過驗收, 谈判窗口 → 談判視窗 …), so the
// PHRASES table below pins those words before conversion. Hand corrections of whole entries go
// in src/i18n/zh-Hant/overrides.json, which this script never touches.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OpenCC from 'opencc-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');
const phrased = OpenCC.Converter({ from: 'cn', to: 'twp' });
const plain = OpenCC.Converter({ from: 'cn', to: 'tw' });

// [Simplified phrase, Traditional form]. `null` keeps the word and converts only its characters.
// Longer and more specific phrases come first; the first match at a position wins.
const PHRASES = [
  // --- wrong word segmentation ---
  ['意图标签', '意圖標籤'],
  // --- specific terms where Taiwan usage differs from a character-by-character conversion ---
  ['程序员', '程式設計師'], ['游戏程序', '遊戲程式'], ['程序与算法', '程式與演算法'],
  ['可编程计算机', '可程式化電腦'], ['计算机', '電腦'],
  ['集成器件', '積體元件'], ['集成制造', '積體製造'], ['器件', '元件'],
  ['激光', '雷射'],
  ['此窗口', '此視窗'],
  ['谷穗', '穀穗'], ['谷誓', '穀誓'], ['协作历', '協作曆'],
  ['观天台', '觀天臺'], ['克制', '克制'], ['征调', '徵調'], ['计划', '計畫'],
  ['等离子体', '電漿'], ['裂变', '核分裂'], ['聚变', '核融合'], ['电站', '電廠'], ['质量', '品質'],
  ['航天', '航太'], ['空间站', '太空站'], ['空间电源', '太空電源'], ['空间材料', '太空材料'],
  ['记录载体', '記錄媒介'], ['载体', '媒介'], ['备件', '備品'],
  ['变电站', '變電所'], ['计算中心', '運算中心'], ['计算硬件', '運算硬體'], ['计算集群', '運算叢集'], ['计算与网络', '運算與網路'],
  // --- ordinary words OpenCC would turn into computing jargon ---
  ['加载设备', '加載設備'], ['授权文件', '授權文件'], ['储藏与保存', '儲藏與保存'], ['妥善保存', '妥善保存'],
  ['保存知识', '保存知識'], ['连接起', '連接起'],
  ['好消息', null], ['对象', null], ['循环', null], ['运行', null], ['通过', null], ['窗口', null], ['类型', null],
  ['重载', null], ['调度', null], ['参数', null], ['支持', null], ['扩展', null], ['局部', null], ['权限', null],
  ['设备', null], ['批量', null], ['程序', null], ['社区', null], ['审核', null], ['分区', null],
];
const OPEN = '';
const CLOSE = '';
const rx = new RegExp(PHRASES.map(([p]) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const fixed = new Map(PHRASES.map(([p, t], i) => [p, { i, out: t ?? plain(p) }]));

function convert(text) {
  // pin the protected phrases behind private-use markers, convert the rest, then restore
  const pinned = text.replace(rx, (m) => OPEN + String.fromCharCode(0xe100 + fixed.get(m).i) + CLOSE);
  const out = phrased(pinned).replace(/([-])/g, (_, c) => PHRASES[c.charCodeAt(0) - 0xe100][1] ?? plain(PHRASES[c.charCodeAt(0) - 0xe100][0]));
  // Taiwan typography: corner brackets instead of curly quotation marks
  return out.replace(/“/g, '「').replace(/”/g, '」').replace(/‘/g, '『').replace(/’/g, '』');
}

const walk = (v) => (typeof v === 'string' ? convert(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'en' ? x : walk(x)])) : v);

mkdirSync(join(root, 'zh-Hant'), { recursive: true });
let n = 0;
for (const name of readdirSync(join(root, 'zh-Hans')).filter((f) => f.endsWith('.json'))) {
  if (name === 'overrides.json') continue;
  const data = JSON.parse(readFileSync(join(root, 'zh-Hans', name), 'utf8'));
  // object dictionaries keep their English keys; only values are converted
  const out = Array.isArray(data) ? data.map(walk) : Object.fromEntries(Object.entries(data).map(([k, v]) => [k, walk(v)]));
  writeFileSync(join(root, 'zh-Hant', name), JSON.stringify(out, null, 1) + '\n');
  n += 1;
}
console.log(`converted ${n} dictionaries to zh-Hant`);
