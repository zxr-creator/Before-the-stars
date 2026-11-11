// Check the encyclopedia introductions in content/lore/ against the content graphs.
//
//   node scripts/lore-check.mjs                    the two lore files, complete
//   node scripts/lore-check.mjs --part a.json …    only the entries in these files (drafts)
//
// It fails when
//   - a technology or practice id has no entry, or an entry lacks English or Simplified
//     Chinese text (and, in the full check, the generated Traditional Chinese);
//   - an introduction or quotation names a LATER node: the cards are hidden until a seat
//     discovers them, so a passage may mention only the node itself and its ancestors.
//     Two tests, in both languages: the full names of every node that is not an ancestor
//     (in either graph), and a list of telltale words for nodes of the same graph (below).
//     A word that already appears on the node's own card (its name, requirements and
//     capability or behaviour) is not a spoiler there and is allowed;
//   - a length is out of range: English 60–120 words; Chinese 100–260 Han characters;
//   - a quotation lacks its text or source, or is given in one language only.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TECH } from './i18n-data-tech.mjs';
import { PRACTICE } from './i18n-data-practices.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const techs = json(join(repo, 'content', 'technologies.json'));
const pracs = json(join(repo, 'content', 'practices.json'));

export const EN_WORDS = [60, 120];
export const ZH_HAN = [100, 260];

// Telltale words of a node: if they appear in the passage of a node that does not
// descend from it, the passage hints at something the reader may not have discovered.
// English entries are regular expressions (case-insensitive); Chinese entries are substrings.
const TELL = {
  T005: [['\\bcultivat', '\\bfarm(ing|er|ers|s)?\\b', '\\bagricultur', '\\bplou?gh'], ['农耕', '耕种', '种植', '农业', '农民']],
  T006: [['\\bdomesticat', '\\bhusbandry', '\\bherders?\\b', '\\bpastoral'], ['驯化', '畜牧', '放牧', '饲养']],
  T008: [['\\bkilns?\\b', '\\bpotter', '\\bceramic'], ['陶', '窑']],
  T013: [['\\bboats?\\b', '\\bcanoes?\\b', '\\bhulls?\\b', '\\bships?\\b', '\\bseafar'], ['船', '舟']],
  T015: [['\\bsmelt'], ['冶炼', '炼铜']],
  T020: [['\\bplou?gh', '\\box-drawn', '\\byoke'], ['犁', '牛耕', '轭']],
  T022: [['\\bbronze', '\\balloy', '\\bcasting'], ['青铜', '合金', '铸造']],
  T023: [['\\biron\\b', '\\bblacksmith', '\\bforg(e|ed|es|ing)\\b'], ['铁', '锻造']],
  T024: [['\\bmasonry', '\\bmasons?\\b', '\\bmortar\\b', '\\bbricks?\\b', '\\barch(es|ed)?\\b', '\\bvault(s|ed)?\\b'], ['砌', '砖', '拱']],
  T025: [['\\bwriting', '\\bwritten\\b', '\\bscripts?\\b', '\\bscribes?\\b', '\\balphabet', '\\bliter(ate|acy)'], ['文字', '书写', '识字', '抄写员']],
  T026: [['\\baccount(ing|ant|ants)\\b', '\\barithmetic', '\\bledgers?\\b', '\\bbookkeep', '\\babacus'], ['算术', '记账', '账簿', '算盘', '会计']],
  T027: [['\\broads?\\b', '\\bhighways?\\b', '\\brelay stations?'], ['道路', '驿']],
  T028: [['\\bsail'], ['帆']],
  T029: [['\\bwater ?wheels?', '\\bwindmills?', '\\bwater ?mills?'], ['水车', '风车', '水磨', '水碓']],
  T030: [['\\bpaper\\b', '\\bparchment', '\\bpapyrus', '\\bcopyists?\\b'], ['纸', '羊皮']],
  T031: [['\\bglass', '\\bglaz'], ['玻璃', '釉']],
  T032: [['\\bmedic', '\\bsurge(on|ons|ry)\\b', '\\bphysicians?\\b'], ['医']],
  T033: [['\\bsewers?\\b', '\\bsanitation', '\\blatrines?\\b', '\\bdrain'], ['下水道', '厕', '卫生']],
  T034: [['\\bclock', '\\bescapement'], ['时钟', '钟表', '擒纵']],
  T035: [['\\bcatapult', '\\btrebuchet', '\\bcrossbow', '\\bballista', '\\bsiege engine'], ['投石', '弩', '抛石']],
  T036: [['\\bgunpowder', '\\bsaltpet', '\\bpropellant', '\\bexplosiv'], ['火药', '硝石', '炸药', '火箭']],
  T037: [['\\bfirearm', '\\bguns?\\b', '\\bmusket', '\\bcannon', '\\brifle'], ['火器', '枪', '炮', '火铳']],
  T038: [['\\baircraft', '\\bairplane', '\\baeroplane', '\\bpowered flight', '\\baviat'], ['飞机', '航空', '飞行器']],
  T040: [['\\bcalibrat'], ['校准']],
  T041: [['\\blens(es)?\\b', '\\btelescop', '\\bmicroscop', '\\bspectacles'], ['透镜', '望远镜', '显微镜', '眼镜']],
  T042: [['\\bvacuum', '\\bair pump', '\\bbarometer'], ['真空', '气泵', '气压计']],
  T043: [['\\bchemi', '\\bassay', '\\bdistil'], ['化学', '蒸馏', '化验']],
  T044: [['\\blathe', '\\bgauges?\\b'], ['车床', '量规']],
  T045: [['\\bcontrol group', '\\bcontrolled (trial|comparison)'], ['对照']],
  T046: [['\\banatom', '\\bdissect', '\\bphysiolog'], ['解剖', '生理']],
  T047: [['\\balgebra', '\\bgeometr', '\\bastronom', '\\bplanet'], ['代数', '几何', '天文', '行星']],
  T048: [['\\bprint', '\\bmovable type', '\\bwoodblock'], ['印刷', '活字', '雕版']],
  T049: [['\\bscien'], ['科学']],
  T050: [['\\bstrength of materials', '\\bfailure analysis', '\\bstress test'], ['材料强度', '失效分析']],
  T051: [['\\bcalculus', '\\bnewton', '\\bmechanics\\b', '\\binertia', '\\bgravit'], ['微积分', '力学', '牛顿', '引力', '惯性']],
  T052: [['\\bthermodynam', '\\bentropy', '\\bheat engines?'], ['热力学', '熵', '热机']],
  T053: [['\\bgerms?\\b', '\\bmicrob', '\\bbacteri', '\\bmicroorganism', '\\binfection'], ['细菌', '微生物', '病菌', '感染']],
  T054: [['\\belectric', '\\bmagnet'], ['电学', '电流', '电磁', '磁石', '磁针', '电荷', '静电']],
  T055: [['\\bprobabilit', '\\bstatistic'], ['概率', '统计']],
  T056: [['\\bsoil chemistry', '\\bnitrogen'], ['土壤化学', '氮']],
  T057: [['\\bquantum', '\\bphoton'], ['量子', '光子']],
  T058: [['\\bcondensed matter', '\\bphase transition', '\\bcrystal lattice'], ['凝聚态', '相变']],
  T060: [['\\bsteel', '\\bcoke\\b', '\\bblast furnace'], ['钢', '焦炭', '高炉']],
  T061: [['\\bmachine tools?'], ['机床']],
  T062: [['\\bpower loom', '\\bspinning (jenny|machine|mill)', '\\btextile mill', '\\bmechani[sz]ed loom'], ['纺织机', '织布机', '纺纱机']],
  T063: [['\\bmine pumps?', '\\bdeep mines?'], ['矿井排水', '深井']],
  T064: [['\\bindustrial chemistry', '\\bchemical plants?', '\\bsulph?uric', '\\bsoda ash', '\\balkali'], ['化工', '硫酸', '纯碱']],
  T065: [['\\bvocational'], ['职业教育', '职业培训']],
  T066: [['\\binterchangeab', '\\btolerances?\\b'], ['互换', '公差']],
  T067: [['\\bboilers?\\b', '\\bpressure vessels?'], ['锅炉', '压力容器']],
  T068: [['\\brailways?', '\\brailroads?', '\\blocomotive'], ['铁路', '铁轨', '火车', '机车']],
  T069: [['\\bwater treatment', '\\bchlorinat', '\\bfiltration plant'], ['水处理', '自来水', '氯']],
  T070: [['\\bvaccin', '\\binocul', '\\bvariolat', '\\bimmuni[sz]', '\\bpharmaceutical'], ['疫苗', '接种', '种痘', '免疫', '制药']],
  T071: [['\\bquality control', '\\breliability engineering'], ['质量控制', '质量管理', '可靠性工程']],
  T080: [['\\bsteam'], ['蒸汽']],
  T081: [['\\bcompound engines?', '\\bhigh-pressure steam'], ['复合蒸汽机', '高压蒸汽']],
  T082: [['\\bcentrifugal governor', '\\bflyball', '\\bfeedback'], ['调速器', '反馈']],
  T083: [['\\bturbine'], ['涡轮', '汽轮机']],
  T084: [['\\bdistrict heat'], ['区域供热', '集中供热']],
  T085: [['\\bwaste heat', '\\bheat recovery'], ['余热']],
  T086: [['\\bsupercritical'], ['超临界']],
  T087: [['\\b(thermal|heat) storage'], ['储热']],
  T090: [['\\bpetroleum', '\\boil refin', '\\brefiner(y|ies)', '\\bkerosene', '\\bgasoline', '\\bpetrol\\b'], ['石油', '炼油', '煤油', '汽油']],
  T091: [['\\binternal combustion', '\\bcombustion engine', '\\bspark plug', '\\bautomobile', '\\bmotor ?cars?\\b'], ['内燃', '汽车']],
  T092: [['\\bdiesel'], ['柴油']],
  T093: [['\\bpolymer', '\\bplastics?\\b'], ['聚合物', '塑料', '高分子']],
  T094: [['\\btrucks?\\b', '\\blorr(y|ies)', '\\btractors?\\b', '\\bbulldozer'], ['卡车', '拖拉机', '推土机']],
  T095: [['\\bfertili[sz]er', '\\bhaber'], ['化肥']],
  T096: [['\\bsynthetic fuels?', '\\bsynfuel'], ['合成燃料']],
  T097: [['\\b(mobile|modular) factor'], ['移动工厂', '模块化工厂']],
  T100: [['\\bgenerators?\\b', '\\bdynamo', '\\bpower (station|plant)'], ['发电']],
  T101: [['\\belectric motor'], ['电动机', '马达']],
  T102: [['\\bgrids?\\b', '\\btransmission lines?'], ['电网', '输电']],
  T103: [['\\belectroly', '\\belectroplat', '\\balumin'], ['电解', '电镀', '铝']],
  T104: [['\\bradio', '\\bwireless', '\\btelegraph', '\\bvacuum tubes?'], ['无线电', '电报', '真空管', '电子管']],
  T105: [['\\bbatter(y|ies)', '\\baccumulator'], ['电池']],
  T106: [['\\bsemiconduct', '\\btransistor', '\\bsilicon', '\\bmicrochip'], ['半导体', '晶体管', '芯片', '硅']],
  T107: [['\\bpower electronics'], ['电力电子']],
  T108: [['\\bsuperconduct', '\\bcryogen', '\\bliquid (helium|nitrogen)'], ['超导', '液氦', '液氮']],
  T109: [['\\blasers?\\b', '\\bmasers?\\b'], ['激光']],
  T110: [['\\balgorithm'], ['算法']],
  T111: [['\\bcomputers?\\b', '\\bcomputing machine'], ['计算机', '电脑']],
  T112: [['\\binternet', '\\bpackets?\\b'], ['互联网', '因特网', '数据包']],
  T113: [['\\bdatabase'], ['数据库']],
  T114: [['\\brobot', '\\bnumerical control', '\\bcnc\\b'], ['机器人', '数控']],
  T115: [['\\bsoftware'], ['软件']],
  T116: [['\\bmachine learning', '\\bneural net', '\\bartificial intelligence', '\\bai\\b'], ['机器学习', '神经网络', '人工智能']],
  T117: [['\\bsupercomputer', '\\bdata cent', '\\bclusters?\\b'], ['超级计算机', '数据中心', '集群']],
  T118: [['\\bself-driving lab', '\\bautomated laborator'], ['自动化实验']],
  T119: [['\\bimplant', '\\bprosthe', '\\bpacemaker', '\\bcochlear'], ['植入', '假肢', '起搏器', '人工耳蜗']],
  T120: [['\\bneural interface', '\\bbrain-computer'], ['脑机', '神经接口']],
  T121: [['\\bdigital twin'], ['数字孪生']],
  T122: [['\\b(general|autonomous) agents?'], ['通用智能体', '自主智能体']],
  T123: [['\\bcyber', '\\bhackers?\\b', '\\bmalware'], ['网络安全', '黑客', '恶意软件']],
  T124: [['\\be-government'], ['电子政务']],
  T125: [['\\bautonomous governance'], ['自主治理']],
  T130: [['\\becology\\b', '\\becosystem', '\\becologist'], ['生态学', '生态系统']],
  T131: [['\\bdna\\b', '\\bgenes?\\b', '\\bgenetic', '\\bmolecular biolog'], ['基因', '分子生物', 'DNA']],
  T132: [['\\bbioreactor', '\\bbiomanufactur'], ['生物反应器', '生物制造']],
  T133: [['\\brestoration ecology', '\\brewild'], ['生态修复']],
  T134: [['\\bsynthetic biology', '\\bprotein design'], ['合成生物', '蛋白质设计']],
  T135: [['\\bclosed ecolog', '\\bbiosphere'], ['闭合生态', '生物圈']],
  T136: [['\\bregenerative medicine', '\\bstem cell'], ['再生医学', '干细胞']],
  T137: [['\\bclosed habitat'], ['封闭栖居', '封闭居住']],
  T140: [['\\brocket'], ['火箭']],
  T141: [['\\borbital', '\\bspacecraft navigation'], ['轨道计算', '航天器']],
  T142: [['\\blaunch vehicle', '\\bspace ?flight', '\\bspace launch'], ['运载火箭', '航天']],
  T143: [['\\bspace environment', '\\bradiation-hardened'], ['空间环境', '抗辐射']],
  T144: [['\\bastronaut', '\\bcosmonaut', '\\bcrewed spaceflight'], ['航天员', '宇航员']],
  T145: [['\\borbital (factor|construction)', '\\bspace station'], ['空间站', '太空工厂']],
  T146: [['\\bnuclear', '\\bradioactiv', '\\batomic nucle', '\\bparticle detector'], ['核物理', '原子核', '放射性', '核反应']],
  T147: [['\\bfission', '\\bnuclear reactor', '\\buranium'], ['裂变', '核反应堆', '铀']],
  T148: [['\\bplasma', '\\btokamak'], ['等离子体', '托卡马克']],
  T149: [['\\bfusion'], ['聚变']],
  T150: [['\\bspace solar', '\\bpower beaming', '\\bsolar power satellite'], ['太空太阳能', '空间太阳能', '无线输能']],
  T151: [['\\binterferomet'], ['干涉']],
  T152: [['\\bfault[- ]toleran', '\\btriple redundan'], ['容错']],
  T153: [['\\bcrew rotation'], ['轮换乘组']],
  T160: [['\\brelativity', '\\bspace-?time', '\\beinstein'], ['相对论', '时空']],
  T161: [['\\bfield-state', '\\bextreme vacuum'], ['极端真空', '场态']],
  T162: [['\\banomal'], ['异常']],
  T163: [['\\bjump', '\\bfaster[- ]than[- ]light', '\\bftl\\b', '\\bwarp\\b', '\\bhyperspace'], ['跃迁', '超光速', '曲速']],
  T167: [['\\bfleet-wide', '\\bstarships?'], ['舰队标准', '星舰']],

  C005: [['\\bapprentic'], ['学徒']],
  C007: [['\\bcommons\\b', '\\bcommon land'], ['公地', '共有地']],
  C009: [['\\binherit', '\\bheirs?\\b'], ['继承']],
  C010: [['\\b(mutual-aid|charity|ever-normal) granar'], ['义仓', '社仓', '常平仓']],
  C011: [['\\bwitness', '\\bmediat'], ['见证', '调解']],
  C012: [['\\bguests?\\b', '\\bhospitalit'], ['待客', '宾客']],
  C013: [['\\barchiv', '\\brecord office', '\\brecordkeep', '\\bregistr'], ['档案', '记录官']],
  C014: [['\\btemples?\\b', '\\bmonaster', '\\bchurch', '\\breligio', '\\bpriest', '\\balms\\b'], ['寺', '庙', '教会', '宗教', '布施']],
  C015: [['\\b(mutual-aid|benefit|friendly) societ'], ['互助会', '互助社']],
  C016: [['\\bmilitia', '\\bconscript', '\\blev(y|ies)\\b', '\\bmuster'], ['民兵', '兵役', '征兵']],
  C017: [['\\bleas(e|es|ed|ing)\\b', '\\btenan', '\\brent(s|ed|al)?\\b'], ['租佃', '租约', '佃']],
  C018: [['\\bguild'], ['行会', '公会']],
  C019: [['\\bmunicipal', '\\bcity council'], ['市政']],
  C020: [['\\bcourts?\\b', '\\bjudges?\\b', '\\blaw codes?', '\\blegal codes?', '\\bstatute'], ['法庭', '法官', '法典', '判决']],
  C021: [['\\barbitrat', '\\bescrow'], ['仲裁', '托管']],
  C022: [['\\bjoint ventures?', '\\bpartnership', '\\bshareholder', '\\bcommenda', '\\bjoint-stock'], ['合伙', '股东', '合股']],
  C023: [['\\bschool', '\\bcurricul'], ['学校', '学堂', '课程']],
  C024: [['\\btranslat'], ['翻译', '译']],
  C025: [['\\bexam(s|ination|inations|iner|iners)?\\b', '\\bdiploma', '\\bcertific'], ['考试', '科举', '资格证']],
  C026: [['\\bbudget', '\\bbureaucra'], ['预算', '官僚']],
  C027: [['\\bpatron', '\\bcolleges?\\b', '\\bacadem', '\\buniversit'], ['赞助', '学院', '书院', '大学']],
  C028: [['\\bdebat', '\\bpeer (criticism|review)'], ['辩论', '同行']],
  C029: [['\\breplicat', '\\breproducib'], ['重复验证', '可复现']],
  C031: [['\\bpatent', '\\blicen'], ['专利', '许可']],
  C032: [['\\bpublic education', '\\bcompulsory', '\\buniversal schooling', '\\bliteracy campaign'], ['义务教育', '普及教育']],
  C033: [['\\bwage labou?r', '\\bfactor(y|ies)', '\\bemploy(er|ers|ee|ees|ment)\\b'], ['雇佣', '工厂', '工资']],
  C034: [['\\bunions?\\b', '\\bstrikes?\\b', '\\bcollective bargaining'], ['工会', '罢工']],
  C035: [['\\bcorporat', '\\bmanagers?\\b', '\\bboard of directors'], ['公司', '董事']],
  C036: [['\\bpublic services?'], ['公共服务']],
  C037: [['\\bofficer corps', '\\bgeneral staff', '\\bwar crimes?'], ['参谋', '军官']],
  C038: [['\\bland regist', '\\bcadastr', '\\bbankrupt', '\\bcollateral', '\\bmortgage'], ['登记', '破产', '抵押']],
  C039: [['\\bwelfare', '\\bpensions?\\b', '\\bsocial insurance'], ['福利', '养老金', '社会保险']],
  C040: [['\\bconstitution', '\\bseparation of powers', '\\bjudicial review', '\\brule of law'], ['宪法', '分权', '司法审查', '法治']],
  C041: [['\\bcensor', '\\binspectors?\\b'], ['监察', '巡视']],
  C042: [['\\bfedera', '\\bconfedera'], ['联邦', '邦联']],
  C043: [['\\btreat(y|ies)', '\\binternational court', '\\btribunal'], ['条约', '国际法庭', '仲裁庭']],
  C044: [['\\bresearch networks?', '\\bopen science'], ['科研网络', '开放科学']],
  C045: [['\\bsafety review', '\\bstop-work', '\\binspectorate'], ['安全审查', '停工']],
  C046: [['\\bretrain', '\\blifelong'], ['再培训', '终身']],
  C047: [['\\bdata\\b'], ['数据']],
  C048: [['\\bcompany towns?', '\\bcorporate jurisdiction'], ['公司城', '企业辖区']],
  C049: [['\\balgorithm', '\\bartificial intelligence'], ['算法', '人工智能']],
  C051: [['\\bhuman-in-the-loop', '\\bhuman oversight'], ['人工复核']],
  C052: [['\\bnetwork infrastructure', '\\bcooperative networks?'], ['网络基础设施']],
  C054: [['\\baugment', '\\bcyborg', '\\bimplant'], ['增强人', '改造人', '植入']],
  C055: [['\\becolog', '\\brecycl'], ['生态', '循环利用']],
  C056: [['\\bintergenerational', '\\bfuture generations'], ['代际', '子孙后代']],
  C057: [['\\b(communication|signal) delay', '\\blight-lag', '\\blost contact'], ['通信延迟', '失联']],
  C058: [['\\bhabitats?\\b', '\\blife[- ]support'], ['栖居地', '生命保障']],
  C059: [['\\bnon-?biological', '\\bmachine persons?', '\\baliens?\\b'], ['非生物', '外星']],
  C060: [['\\bcivili[sz]ation archive', '\\brecoverable archive', '\\bseed vault'], ['文明档案', '种子库']],
  C061: [['\\bworld government', '\\bglobal community', '\\bworld federation'], ['全球共同体', '世界政府']],
  C062: [['\\bglobal institution'], ['全球机构']],
  C063: [['\\bunified command', '\\bworld empire'], ['统一指挥', '世界帝国']],
  C064: [['\\binterstellar', '\\boff-world'], ['星际', '地外']],
};

// ---- the graphs ------------------------------------------------------------------------
const nodes = new Map();
for (const t of techs) {
  const zh = TECH[t.id] ?? [];
  nodes.set(t.id, { id: t.id, kind: 'tech', name: t.name, zhName: zh[0] ?? '', prereq: t.prereq, cardEn: [t.name, t.requirements, t.capability].join(' \n '), cardZh: zh.join(' \n ') });
}
for (const p of pracs) {
  const zh = PRACTICE[p.id] ?? [];
  nodes.set(p.id, { id: p.id, kind: 'practice', name: p.name, zhName: zh[0] ?? '', prereq: p.prereq, cardEn: [p.name, p.requirements, p.behavior].join(' \n '), cardZh: zh.join(' \n ') });
}
const ancestors = new Map();
function anc(id) {
  if (ancestors.has(id)) return ancestors.get(id);
  const out = new Set();
  ancestors.set(id, out);
  for (const p of (nodes.get(id)?.prereq ?? '').match(/[TC]\d{3}/g) ?? []) {
    out.add(p);
    for (const q of anc(p)) out.add(q);
  }
  return out;
}
for (const id of nodes.keys()) anc(id);
export { nodes, ancestors };

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = new Map([...nodes.values()].map((n) => [n.id, new RegExp('\\b' + escape(n.name) + '\\b', 'i')]));
const tellRe = new Map(Object.entries(TELL).map(([id, [en, zh]]) => [id, { en: en.map((s) => new RegExp(s, 'i')), zh }]));

// Fixed phrases whose words are not about the node they resemble.
const ALLOW = [/royal road/gi];

/** Spoilers in one text of node `id`: [{ by, what }]. */
export function spoilers(id, raw, lang) {
  const text = ALLOW.reduce((s, re) => s.replace(re, ' '), raw);
  const self = nodes.get(id);
  const ok = ancestors.get(id);
  const found = [];
  for (const other of nodes.values()) {
    if (other.id === id || ok.has(other.id)) continue;
    if (lang === 'en') {
      const re = nameRe.get(other.id);
      if (re.test(text) && !re.test(self.cardEn)) found.push({ by: other.id, what: `name “${other.name}”` });
    } else if (other.zhName && text.includes(other.zhName) && !self.cardZh.includes(other.zhName)) {
      found.push({ by: other.id, what: `name “${other.zhName}”` });
    }
    if (other.kind !== self.kind) continue;
    const tell = tellRe.get(other.id);
    if (!tell) continue;
    if (lang === 'en') {
      for (const re of tell.en) {
        const m = text.match(re);
        if (m && !re.test(self.cardEn)) found.push({ by: other.id, what: `word “${m[0]}” (${other.name})` });
      }
    } else {
      for (const w of tell.zh) if (text.includes(w) && !self.cardZh.includes(w)) found.push({ by: other.id, what: `word “${w}” (${other.zhName})` });
    }
  }
  return found;
}

export const words = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
export const han = (s) => (s.match(/\p{Script=Han}/gu) ?? []).length;

// ---- check -------------------------------------------------------------------------------
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main();

function main() {
const args = process.argv.slice(2);
const partial = args[0] === '--part';
const files = partial ? args.slice(1).map((f) => resolve(f)) : ['technologies', 'practices'].map((f) => join(repo, 'content', 'lore', f + '.json'));
const errors = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const seen = new Map();
let quotes = 0;
for (const f of files) {
  const list = json(f);
  if (!Array.isArray(list)) { errors.push(`${f}: not an array`); continue; }
  for (const e of list) {
    if (!e || !nodes.has(e.id)) { err(e?.id ?? '?', `unknown id in ${f}`); continue; }
    if (seen.has(e.id)) err(e.id, 'duplicate entry');
    seen.set(e.id, e);
    const langs = partial ? ['en', 'zh-Hans'] : ['en', 'zh-Hans', 'zh-Hant'];
    for (const lang of langs) {
      const x = e[lang];
      if (!x || typeof x.intro !== 'string' || !x.intro.trim()) { err(e.id, `no ${lang} introduction`); continue; }
      if (lang === 'en') {
        const n = words(x.intro);
        if (n < EN_WORDS[0] || n > EN_WORDS[1]) err(e.id, `English introduction has ${n} words (${EN_WORDS[0]}–${EN_WORDS[1]})`);
        if (/\p{Script=Han}/u.test(x.intro)) err(e.id, 'Chinese characters in the English introduction');
      } else {
        const n = han(x.intro);
        if (n < ZH_HAN[0] || n > ZH_HAN[1]) err(e.id, `${lang} introduction has ${n} Han characters (${ZH_HAN[0]}–${ZH_HAN[1]})`);
        if (/[A-Za-z]{4,}/.test(x.intro.replace(/DNA/g, ''))) err(e.id, `Latin words in the ${lang} introduction`);
      }
      if (x.quote !== undefined) {
        if (!x.quote || typeof x.quote.text !== 'string' || !x.quote.text.trim() || typeof x.quote.source !== 'string' || !x.quote.source.trim()) err(e.id, `${lang} quote needs text and source`);
      }
      if (lang !== 'zh-Hant') {
        const texts = [x.intro, x.quote?.text ?? '', x.quote?.source ?? ''];
        for (const s of spoilers(e.id, texts.join(' \n '), lang === 'en' ? 'en' : 'zh')) err(e.id, `${lang} names a node that may not be discovered yet: ${s.what} [${s.by}]`);
      }
    }
    const q = ['en', 'zh-Hans', ...(partial ? [] : ['zh-Hant'])].map((l) => !!e[l]?.quote);
    if (q.some(Boolean) && !q.every(Boolean)) err(e.id, 'a quote is given in some languages only');
    if (q[0]) quotes += 1;
  }
}
if (!partial) {
  for (const id of nodes.keys()) if (!seen.has(id)) err(id, 'no lore entry');
}
const counted = [...seen.keys()];
console.log(`${counted.filter((x) => x[0] === 'T').length} technology and ${counted.filter((x) => x[0] === 'C').length} practice entries checked, ${quotes} with quotations`);
if (errors.length) {
  console.log(errors.join('\n'));
  console.log(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('lore: no problems');
}
