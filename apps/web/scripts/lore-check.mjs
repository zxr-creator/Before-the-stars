// Check the encyclopedia introductions in content/lore/ against the content graphs and the
// draft graph of designed-but-unmerged nodes (docs 37 and 39; see "the graphs" below).
//
//   node scripts/lore-check.mjs                    the two lore files, complete
//   node scripts/lore-check.mjs --part a.json …    only the entries in these files (drafts)
//
// It fails when
//   - a technology or practice id (of content/ or of the draft graph) has no entry, or an
//     entry lacks English or Simplified Chinese text (and, in the full check, the generated
//     Traditional Chinese);
//   - an introduction or quotation names a LATER node: the cards are hidden until a seat
//     discovers them, so a passage may mention only the node itself and its ancestors.
//     Two tests, in both languages: the full names of every node that is not an ancestor
//     (in either graph), and a list of telltale words for nodes of the same graph (below).
//     A word that already appears on the node's own card (its name, requirements and
//     capability or behaviour) is not a spoiler there and is allowed;
//   - a length is out of range: English 60–120 words; Chinese 100–260 Han characters;
//   - a quotation lacks its text or source, or is given in one language only.
import { existsSync, readFileSync } from 'node:fs';
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
  T036: [['\\bgunpowder', '\\bsaltpet', '\\bpropellant', '\\bexplosiv'], ['火药', '硝石', '炸药']],
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
  // ---- doc 37 §7.1 and §6.7 (not yet in content/: checked against the draft graph) ----
  T154: [['\\breusable (launch|rockets?|boosters?|vehicles?)', '\\bbooster recovery', '\\bflyback'], ['可复用发射', '可复用火箭', '助推器回收']],
  T155: [['\\bion (engines?|thrusters?|drives?)', '\\bhall(-effect)? thrusters?', '\\belectric propulsion'], ['离子推', '霍尔推力', '电推进']],
  T156: [['\\bmass drivers?', '\\bcoilguns?', '\\brailguns?', '\\belectromagnetic launch(es|ing)?\\b'], ['质量投射', '电磁发射', '电磁炮', '轨道炮']],
  T157: [['\\bnuclear thermal', '\\bnerva\\b'], ['核热推进', '核热火箭']],
  T158: [['\\bnuclear electric propulsion'], ['核电推进']],
  T159: [['\\bin-situ', '\\bin situ', '\\bisru\\b'], ['原位资源', '原位利用']],
  T170: [['\\boff-world habitats?', '\\bregolith shield'], ['地外栖居', '风化层屏蔽']],
  T171: [['\\blow-gravity medicine', '\\boff-world births?', '\\bborn off-world'], ['低重力医学', '地外出生', '地外生育']],
  T172: [['\\boff-world mining', '\\basteroid mining', '\\blunar mining'], ['地外采矿', '小行星采矿', '月球采矿']],
  T173: [['\\bfusion (propulsion|rockets?|drives?|ships?)'], ['聚变推进', '聚变火箭', '聚变飞船']],
  T174: [['\\blight ?sails?', '\\bsolar sails?', '\\bbeamed[- ]energy propulsion'], ['光帆', '太阳帆', '定向能推进']],
  T175: [['\\bdeep[- ]space (network|communication)'], ['深空通信', '深空网']],
  T176: [['\\bpropellant depots?', '\\borbital (fuel|propellant) (depots?|stores?)'], ['推进剂仓库', '推进剂库', '轨道燃料库']],
  T177: [['\\brotating habitats?', '\\bo\'neill', '\\bstanford torus', '\\borbital settlements?'], ['旋转栖居', '轨道定居', '奥尼尔']],
  T178: [['\\bheavy[- ]lift', '\\bsuper[- ]heavy'], ['重型运载', '重型助推']],
  T179: [['\\bgrown habitats?', '\\bbiological isru', '\\bmycelium (bricks?|habitats?)'], ['生长式栖居', '生物原位']],
  T180: [['\\btelepresence', '\\bteleoperat', '\\bremote operation'], ['遥在', '遥操作', '远程操作']],
  T181: [['\\bself-replicat', '\\bseed factor'], ['自我复制', '种子工厂']],
  T182: [['\\bnuclear pulse', '\\bproject orion', '\\bpusher plates?'], ['核脉冲', '推进板', '猎户座计划']],
  // ---- doc 39 §6.2: new technologies ----
  T183: [['\\bbrewing', '\\bferment(ation|ed|ing|s)?\\b', '\\bmalting', '\\bsourdough'], ['酿造', '发酵', '酒曲', '麦芽']],
  T184: [['\\bherbal', '\\bpharmacopoei', '\\bmateria medica', '\\bherbalists?'], ['草药', '本草', '方剂']],
  T185: [['\\bquicklime', '\\blime ?kilns?', '\\bslaked lime', '\\bplaster', '\\bwhitewash'], ['石灰', '灰泥', '白灰']],
  T186: [['\\bsalt ?(pans?|works|making|wells?|springs?)', '\\bsalt-making', '\\bsalters?\\b'], ['制盐', '盐井', '盐田', '晒盐', '煮盐']],
  T187: [['\\bobsidian', '\\bcowr(y|ie|ies)\\b', '\\bexchange tokens?', '\\blong-distance exchange'], ['黑曜石', '贝币', '远程交换', '信物']],
  T188: [['\\blogograph', '\\bideogra'], ['表意文字', '表意字']],
  T189: [['\\balphabet', '\\bphonetic', '\\bvowels?\\b', '\\bconsonants?\\b'], ['表音', '拼音文字', '字母表']],
  T190: [['\\bcoins?\\b', '\\bcoinage', '\\bmints?\\b', '\\bminted', '\\bdebase'], ['铸币', '钱币', '铜钱', '硬币']],
  T191: [['\\bcrucible steel', '\\bwootz', '\\bdamascus', '\\bpattern[- ]weld'], ['坩埚钢', '乌兹钢', '大马士革', '花纹钢']],
  T192: [['\\bpozzolan', '\\bhydraulic (concrete|lime|cement|mortar)', '\\broman concrete', '\\bvolcanic ash'], ['火山灰', '水硬性', '罗马混凝土']],
  T193: [['\\bantikythera', '\\bgear trains?', '\\bgeared (calculators?|mechanisms?)'], ['安提基特拉', '齿轮系', '齿轮计算']],
  T194: [['\\bfortification', '\\bsiege (works|engineering|mines?|towers?|ramps?)', '\\bsapp(ers?|ing)\\b', '\\bramparts?'], ['筑城', '攻城工程', '城防', '坑道']],
  T195: [['\\bpadd(y|ies)\\b', '\\brice terraces', '\\bterraced (fields|rice|paddies)', '\\bwet[- ]rice'], ['水田', '稻田', '水稻', '梯田']],
  T196: [['\\bcrop rotation', '\\bthree-field', '\\bfour-field', '\\bnorfolk (rotation|four-course)', '\\bclover'], ['轮作', '三圃', '四圃']],
  T197: [['\\bhumou?r(s|al)\\b', '\\bgalen', '\\bmedical schools?'], ['体液', '盖伦', '医学院']],
  T198: [['\\bplace[- ]value', '\\bpositional (notation|numerals?)', '\\bhindu-arabic', '\\balgorism', '\\bfibonacci', '\\bsign for (zero|nothing)'], ['位值', '阿拉伯数字', '斐波那契', '数字零', '零的符号']],
  T199: [['\\bheavy plou?gh', '\\bhorse collar', '\\bmou?ldboard', '\\bhorseshoe'], ['重犁', '挽具', '犁壁', '马轭', '马蹄铁']],
  T200: [['\\bwoodblock', '\\bblock[- ]print', '\\bcarved (wooden )?blocks?'], ['雕版', '刻版', '木版']],
  T201: [['\\bpaper money', '\\bbanknotes?', '\\bbills? of exchange', '\\bjiaozi', '\\bpaper currency'], ['纸币', '交子', '汇票', '钞']],
  T202: [['\\bcompass', '\\bpoints? north', '\\bnorth-pointing', '\\bsouth-pointing', '\\bmagnetic bearing'], ['指南针', '罗盘', '司南', '指南鱼', '指向北方', '指北']],
  T203: [['\\bblast furnace', '\\bcast iron', '\\bpig iron'], ['高炉', '铸铁', '生铁']],
  T204: [['\\balembic', '\\bspirits\\b', '\\bliquor', '\\bbrandy', '\\bwhiske?y', '\\baqua vitae'], ['烧酒', '蒸馏酒', '白兰地', '威士忌']],
  T205: [['\\bautomat(on|a)\\b', '\\bcams?\\b', '\\bcamshaft', '\\bjazari'], ['自动机', '凸轮', '机关人', '偃师']],
  T206: [['\\bgreek fire', '\\bnaphtha', '\\bsiphons? of fire'], ['希腊火', '猛火油', '石脑油']],
  T207: [['\\bfire arrows?', '\\bcongreve', '\\bpowder rockets?'], ['火药火箭', '火龙出水', '神火飞鸦']],
  T208: [['\\bdouble-entry', '\\bdebits?\\b', '\\bpacioli'], ['复式', '借方', '贷方', '帕乔利']],
  T209: [['\\bbastions?', '\\btrace italienne', '\\bstar forts?', '\\bvauban'], ['棱堡', '星形要塞', '沃邦']],
  T210: [['\\btelescop', '\\bsunspots?', '\\bgalilean moons', '\\bmoons of jupiter', '\\bphases of venus'], ['望远镜', '太阳黑子', '木星的卫星', '金星的相位']],
  T211: [['\\bpendulum clocks?', '\\bchronometers?', '\\blongitude', '\\bhuygens'], ['摆钟', '钟摆', '天文钟', '经度', '惠更斯']],
  T212: [['\\bmicroscop', '\\bleeuwenhoek', '\\banimalcules?'], ['显微', '列文虎克', '微小动物']],
  T213: [['\\bnewcomen', '\\batmospheric (engines?|pumping)', '\\bsavery'], ['纽科门', '大气压蒸汽机', '大气压抽水', '萨弗里']],
  T214: [['\\bvariolat', '\\bsmallpox scabs', '\\binsufflation', '\\bmontagu'], ['人痘', '种痘', '痘痂', '蒙塔古']],
  T215: [['\\bleyden jars?', '\\belectrostatic', '\\bfriction machines?', '\\bstatic electricity'], ['莱顿瓶', '静电机', '储电瓶', '摩擦起电']],
  T216: [['\\bballoon', '\\bmontgolfier', '\\bhot[- ]air (balloon|ascent)'], ['气球', '孟格菲']],
  T217: [['\\bcoal gas', '\\bgas ?light', '\\bgasworks', '\\btown gas', '\\bgas lamps?'], ['煤气', '煤气灯']],
  T218: [['\\bsemaphore', '\\bchappe', '\\boptical telegraph', '\\bsignal towers?'], ['信号塔', '旗语', '沙普', '臂板']],
  T219: [['\\bmorse code', '\\bundersea cables?', '\\bsubmarine cables?', '\\btelegraph (keys?|wires?|poles?|offices?|clerks?|operators?)', '\\btelegrams?'], ['莫尔斯电码', '电报局', '海底电缆', '发报员', '电报机']],
  T220: [['\\bsteamships?', '\\bsteamers?\\b', '\\bpaddle ?wheel', '\\bscrew propellers?', '\\biron hulls?', '\\bcoaling stations?'], ['轮船', '汽船', '蒸汽船', '明轮', '铁壳']],
  T221: [['\\banaesthe', '\\banesthe', '\\bantisep', '\\bchloroform', '\\blister\\b', '\\bcarbolic'], ['麻醉', '乙醚', '氯仿', '李斯特', '石炭酸', '无菌手术']],
  T222: [['\\bbessemer', '\\bpneumatic (process|steel|converters?)', '\\bthomas process', '\\bbasic converter'], ['转炉', '贝塞麦', '吹炼']],
  T223: [['\\bopen[- ]hearth', '\\bsiemens-martin', '\\bmartin process'], ['平炉', '西门子—马丁', '马丁炉']],
  T224: [['\\bportland cement', '\\breinforced concrete', '\\bferro-?concrete', '\\brebar', '\\bhennebique'], ['水泥', '钢筋混凝土', '波特兰']],
  T225: [['\\brefrigerat', '\\bfreezers?', '\\bcold stores?', '\\bcold storage', '\\bfridges?'], ['制冷', '冷藏', '冰箱', '冷库']],
  T226: [['\\bguano', '\\bchile saltpet', '\\bnitrate (beds|fields|mines)', '\\bcaliche'], ['鸟粪', '智利硝石', '硝石矿']],
  T227: [['\\bdirect-current (networks?|distribution|stations?|mains|supply)', '\\bdc (networks?|distribution|mains|supply)', '\\blocal (dc|direct-current)'], ['直流电网', '直流配电', '直流供电']],
  T228: [['\\balternating current', '\\balternating-current', '\\bpolyphase', '\\btransformers?\\b', '\\bwestinghouse'], ['交流电', '多相', '变压器']],
  T229: [['\\bbroadcast', '\\bradio stations?', '\\blisteners\\b'], ['广播', '电台', '听众']],
  T230: [['\\bairships?', '\\bzeppelin', '\\bdirigible', '\\bhindenburg'], ['飞艇', '齐柏林', '兴登堡']],
  T231: [['\\bantibiotic', '\\bpenicillin', '\\bfleming', '\\bstreptomycin', '\\bsulfa'], ['抗生素', '青霉素', '弗莱明', '磺胺']],
  T232: [['\\bradar', '\\bcavity magnetron', '\\bchain home'], ['雷达', '磁控管']],
  T233: [['\\bjet (engines?|propulsion|aircraft|airliners?|age|fighters?)', '\\bturbojets?', '\\bwhittle', '\\bvon ohain'], ['喷气', '涡喷']],
  T234: [['\\banalog(ue)? comput', '\\bdifferential analy[sz]er', '\\bfire control', '\\btide[- ]predict', '\\brangekeeper'], ['模拟计算机', '微分分析机', '火控', '潮汐预报机']],
  T235: [['\\bhydroelectric', '\\bhydropower', '\\bhoover dam', '\\bthree gorges', '\\bgrand coulee'], ['水电站', '水力发电', '三峡', '胡佛水坝']],
  T236: [['\\bgoddard', '\\bliquid[- ]fuel(led)? rockets?', '\\bliquid[- ]propellant', '\\brocket society'], ['戈达德', '液体火箭', '液体燃料火箭']],
  T237: [['\\bcontainer (ships?|ports?|terminals?)', '\\bshipping containers?', '\\bmclean', '\\bteu\\b', '\\bbox ships?', '\\bcontaineri[sz]ed (shipping|cargo|freight|trade)'], ['集装箱船', '集装箱航运', '集装箱码头', '货柜']],
  T238: [['\\bgreen revolution', '\\bborlaug', '\\bsemi-dwarf', '\\bhigh-yield(ing)? (varieties|crops|wheat|rice)', '\\bhybrid (rice|maize|corn)'], ['绿色革命', '高产品种', '矮秆', '杂交水稻', '袁隆平', '博洛格']],
  T239: [['\\bcellular (networks?|phones?|radio|telephony)', '\\bmobile phones?', '\\bcell ?phones?', '\\bsmartphones?', '\\bhandsets?'], ['手机', '移动电话', '蜂窝', '智能手机', '基站']],
  T240: [['\\bpublic[- ]key', '\\brsa\\b', '\\bdiffie', '\\bprivate keys?', '\\bkey exchange'], ['公钥', '私钥', '密钥交换']],
  T241: [['\\bgenome sequenc', '\\bhuman genome', '\\bsanger', '\\bsequencers?', '\\bsequenc(e|ed|ing) (the |a |whole )?genomes?'], ['基因组测序', '测序', '人类基因组', '桑格']],
  T242: [['\\bcarbon[- ]fib(re|er)', '\\bcomposite (materials?|wings?|structures?|blades?)', '\\bfib(re|er)glass', '\\bkevlar'], ['碳纤维', '复合材料', '玻璃钢']],
  T243: [['\\bexpert systems?', '\\brule bases?', '\\bknowledge engineer', '\\bmycin', '\\bsymbolic ai', '\\bif-then rules'], ['专家系统', '规则库', '知识工程']],
  T244: [['\\bfrack', '\\bhydraulic fracturing', '\\bshale (gas|oil)', '\\btight oil'], ['压裂', '页岩气', '页岩油']],
  T245: [['\\boptical fib(re|er)s?', '\\bfib(re|er)[- ]optic'], ['光纤', '光缆']],
  T246: [['\\bcommunications? satellites?', '\\bgeostationary', '\\btelstar', '\\bsyncom', '\\btransponders?'], ['通信卫星', '地球静止', '同步轨道', '转发器']],
  T247: [['\\bgps\\b', '\\bsatellite navigation', '\\bnavigation satellites?', '\\bearth[- ]observation', '\\blandsat', '\\bspy satellites?', '\\bglonass', '\\bbeidou'], ['卫星导航', '导航卫星', '对地观测', '北斗', '全球定位']],
  T248: [['\\bpressuri[sz]ed[- ]water', '\\blight[- ]water reactors?', '\\bpwrs?\\b', '\\benriched uranium', '\\buranium enrichment'], ['压水堆', '轻水堆', '浓缩铀', '铀浓缩']],
  T249: [['\\bheavy[- ]water', '\\bcandu', '\\bnatural uranium'], ['重水', '天然铀']],
  T250: [['\\bbreeder reactors?', '\\bfast breeders?', '\\bfast reactors?', '\\breprocessing', '\\bplutonium', '\\bsodium[- ]cooled'], ['增殖堆', '快堆', '后处理', '钚', '钠冷']],
  T251: [['\\bthorium', '\\bmolten[- ]salt reactors?'], ['钍', '熔盐堆']],
  T252: [['\\blaunch escape', '\\bescape towers?', '\\b(space|crew|crewed|return) capsules?', '\\bsplashdown', '\\breentry shields?', '\\bheat shields?'], ['逃逸塔', '逃逸系统', '返回舱', '溅落', '防热罩', '载人飞船']],
  T253: [['\\bin-orbit (servicing|refuel)', '\\bon-orbit servic', '\\bservicing missions?', '\\brefuel(l)?ing in orbit'], ['在轨服务', '在轨维修', '在轨加注']],
  T254: [['\\bkerolox', '\\brp-1', '\\bkerosene[- ](and[- ])?(liquid[- ])?oxygen', '\\bf-1 engines?'], ['煤油液氧', '液氧煤油']],
  T255: [['\\bhydrolox', '\\bhydrogen[- ](and[- ])?oxygen (engines?|rockets?|stages?)', '\\brs-25', '\\bj-2\\b'], ['氢氧发动机', '液氢液氧']],
  T256: [['\\bmethalox', '\\bliquid methane', '\\bmethane[- ](and[- ])?(liquid[- ])?oxygen', '\\braptor engines?'], ['甲烷液氧', '液氧甲烷', '液态甲烷']],
  T257: [['\\brotating tethers?', '\\bskyhooks?', '\\bmomentum[- ]exchange'], ['旋转系绳', '天钩', '动量交换']],
  T258: [['\\bnanotubes?', '\\bgraphene', '\\bfullerene', '\\bbuckyball'], ['纳米管', '石墨烯', '富勒烯']],
  T259: [['\\bspace elevators?', '\\bbeanstalk', '\\btsiolkovsky\'s tower'], ['太空电梯', '天梯', '爬升器']],
  T260: [['\\bquantum comput', '\\bqubits?', '\\bshor\'?s algorithm', '\\bquantum (computers?|processors?)'], ['量子计算', '量子比特', '量子计算机']],
  T261: [['\\bneuromorphic', '\\bspiking (neural|neurons?|networks?|chips?)', '\\bbrain-inspired chips?', '\\btruenorth', '\\bloihi'], ['类脑', '神经形态', '脉冲神经']],
  T262: [['\\bnanotech', '\\bmolecular (assembl|manufactur|machines?)', '\\bnanofabricat', '\\bplenty of room at the bottom', '\\bdrexler'], ['纳米制造', '分子组装', '分子机器', '纳米技术']],
  T263: [['\\bsynthetic biolog', '\\bbiobricks?', '\\bminimal (cells?|genomes?)', '\\bgene circuits?'], ['合成生物学', '生物积块', '最小基因组', '基因线路']],
  T264: [['\\bmagnetic[- ]confinement', '\\biter\\b', '\\bstellarators?'], ['磁约束', '仿星器']],
  T265: [['\\binertial[- ]confinement', '\\bnational ignition', '\\blaser fusion', '\\bhohlraum'], ['惯性约束', '国家点火装置', '激光聚变', '黑腔']],
  T266: [['\\basteroid (capture|redirect|retrieval)', '\\bcaptured asteroids?', '\\bredirect(ed|ing)? (an |the )?asteroids?'], ['小行星捕获', '捕获小行星', '小行星变轨']],
  T267: [['\\banomaly (cartograph|maps?|mapping|charts?)', '\\bmapp(ed|ing) the anomaly'], ['异常空间测绘', '异常测绘', '异常地图']],
  T268: [['\\bexotic[- ]field', '\\bfield shielding', '\\bjump shielding'], ['奇异场', '场屏蔽']],
  T269: [['\\bjump beacons?', '\\bnavigation beacons?', '\\bbeacon craft'], ['跃迁信标', '导航信标', '信标舰']],
  // ---- doc 39 §6.4: tradition branches ----
  T270: [['\\bsteam hammers?', '\\bnasmyth', '\\bdrop[- ]forg', '\\bheavy forg'], ['蒸汽锤', '汽锤', '重型锻造', '内史密斯']],
  T271: [['\\bdifference engines?', '\\bcalculating bureau', '\\bcomputing bureau'], ['差分机', '计算局']],
  T272: [['\\broad locomotives?', '\\bsteam carriages?', '\\btraction engines?', '\\bsteam wagons?', '\\bcugnot', '\\bred flag act'], ['公路机车', '蒸汽汽车', '蒸汽车', '牵引机车', '居纽', '红旗法']],
  T273: [['\\bironclads?', '\\barmou?red trains?'], ['铁甲舰', '装甲列车']],
  T274: [['\\bcoal[- ]tar', '\\bsynthetic dyes?', '\\baniline', '\\bmauve', '\\bperkin', '\\balizarin'], ['煤焦油', '合成染料', '苯胺', '珀金']],
  T275: [['\\bpneumatic (tubes?|post|dispatch|railway)', '\\btube post', '\\brohrpost'], ['气动管道', '气送管', '气动邮递']],
  T276: [['\\bultra-supercritical', '\\badvanced ultra'], ['超超临界']],
  T277: [['\\bsteam rockets?', '\\bsteam-thermal', '\\bwater-steam (tugs?|rockets?|thrusters?)', '\\bice rockets?'], ['蒸汽火箭', '冰蒸汽', '水蒸气推进', '水汽推进']],
  T278: [['\\bcatalytic cracking', '\\bthermal cracking', '\\boctane', '\\bhoudry', '\\bcracking (units?|plants?|towers?|stills?)'], ['裂化', '辛烷值']],
  T279: [['\\bdiesel-electric'], ['柴电', '柴油电力传动', '柴油—电力']],
  T280: [['\\btank (warfare|crews?|corps|divisions?|armou?r|battles?)', '\\barmou?red (vehicles?|cars?|divisions?|warfare)', '\\bblitzkrieg', '\\bcaterpillar tracks', '\\bpanzer'], ['坦克', '装甲车', '装甲师']],
  T281: [['\\bheavy bombers?', '\\bstrategic bomb', '\\bflying boats?', '\\bairlift', '\\bb-29', '\\bflying fortress'], ['重型轰炸机', '战略轰炸', '远程轰炸', '飞行堡垒']],
  T282: [['\\bpetrochemical', '\\bsteam crackers?', '\\bethylene'], ['石化', '乙烯']],
  T283: [['\\bsnorkel', '\\bschnorchel', '\\bu-boats?', '\\bdiesel(-electric)? submarines?', '\\bsubmarine (wolf ?packs?|warfare)'], ['通气管', '潜艇战', '柴电潜艇']],
  T284: [['\\bstainless[- ]steel (rockets?|stages?|boosters?)', '\\bsteel (rocket )?stages?', '\\bbig dumb boosters?', '\\bsea dragon'], ['不锈钢火箭', '钢制火箭', '钢制箭体']],
  T285: [['\\bfischer', '\\btropsch', '\\bsynthesis gas', '\\bsyngas', '\\bbergius', '\\bcoal liquef'], ['费托', '合成气', '煤制油', '煤液化']],
  T286: [['\\btrams?\\b', '\\btramways?', '\\bstreetcars?', '\\btrolley(bus)?s?\\b', '\\bmetros?\\b', '\\bsubways?', '\\bunderground railways?', '\\bthird rail', '\\boverhead wires?'], ['有轨电车', '地铁', '电车']],
  T287: [['\\belectric[- ]arc furnaces?', '\\barc furnaces?', '\\barc steel'], ['电弧炉', '电炉钢']],
  T288: [['\\bbirkeland', '\\beyde\\b', '\\belectric arc (nitrogen|process)', '\\bnorsk hydro', '\\barc process'], ['电弧固氮', '电弧法', '伯克兰']],
  T289: [['\\bwireless power', '\\bwardenclyffe', '\\bresonant (towers?|coils?)', '\\btesla coils?'], ['无线输电', '沃登克里弗', '特斯拉线圈']],
  T290: [['\\belectric (cars?|vehicles?|buses|trucks?|lorr)', '\\bbattery[- ]electric', '\\bevs?\\b', '\\bcharging (stations?|depots?|points?)'], ['电动车', '电动汽车', '充电站', '电动巴士']],
  T291: [['\\bsuperconducting (cables?|grids?|lines?|power)', '\\bhts cables?'], ['超导电网', '超导电缆', '超导输电']],
  T292: [['\\bmaglev', '\\bmagnetic levitation', '\\blaunch sleds?', '\\blaunch[- ]assist tracks?'], ['磁悬浮', '磁浮', '发射滑车', '助推轨道']],
  T293: [['\\bmagnesium', '\\bbauxite', '\\blight metals?'], ['镁', '铝土矿', '轻金属']],
  T294: [['\\bradioisotope', '\\brtgs?\\b', '\\bradioactive tracers?', '\\bcobalt-60', '\\btechnetium', '\\bmedical isotopes', '\\bnuclear medicine'], ['放射性同位素', '同位素电池', '核医学', '示踪剂', '钴-60']],
  T295: [['\\bsmall modular', '\\bsmrs?\\b', '\\bmodular reactors?', '\\bcompact reactors?', '\\bfactory-built (reactors?|cores?)'], ['小型模块化', '模块化反应堆', '紧凑型反应堆', '小堆']],
  T296: [['\\bprocess heat', '\\bhigh-temperature (gas-cooled )?reactors?', '\\bhtgr', '\\bpebble[- ]bed', '\\bnuclear (steelmaking|hydrogen)'], ['工艺热', '高温气冷堆', '球床', '核能制氢']],
  T297: [['\\bnuclear[- ]powered (ships?|submarines?|icebreakers?|aircraft carriers?|vessels?|trains?|merchant)', '\\bnautilus', '\\bnuclear (icebreakers?|submarines?)', '\\bland trains?', '\\batomic[- ]powered'], ['核动力舰', '核动力船', '核潜艇', '核动力破冰船', '鹦鹉螺号', '陆地列车']],
  T298: [['\\bfood irradiation', '\\birradiat(ed|ion|ing) (food|seeds?|grain|potatoes)', '\\bmutation breeding', '\\batomic gardens?', '\\bgamma gardens?', '\\bmutagen'], ['辐照保鲜', '辐照食品', '诱变', '伽马园', '原子花园']],
  T299: [['\\bnuclear excavation', '\\bpeaceful nuclear explosions?', '\\bplowshare', '\\bsedan crater', '\\bchagan'], ['核爆工程', '和平核爆', '犁头计划', '核爆炸挖掘', '核爆']],
  T300: [['\\bmass[- ]produc\\w* pulse units?', '\\bpulse[- ]unit (factor|lines?|plants?|production)'], ['脉冲单元批量', '脉冲单元生产线']],
  T301: [['\\bfusion[- ]fission', '\\bhybrid reactors?', '\\bfission blankets?'], ['聚变裂变', '聚变—裂变', '混合堆', '裂变包层']],
  T302: [['\\bsecurity operations cent', '\\bnetwork operations cent', '\\bsocs?\\b', '\\bnocs?\\b', '\\bthreat hunt'], ['安全运营中心', '网络运营中心', '威胁狩猎']],
  T303: [['\\bcybernetic (prosthe|limbs?|implants?)', '\\bimplant clinics?', '\\bcyberware'], ['赛博义体', '义体', '植入诊所']],
  T304: [['\\baugmented reality', '\\bar headsets?', '\\bsmart glasses', '\\bmixed reality', '\\bheads-up displays?'], ['增强现实', '混合现实', '智能眼镜', '头显']],
  T305: [['\\bdata havens?', '\\boffshore (servers?|data)', '\\bsealand', '\\bbulletproof hosting'], ['数据避风港', '数据天堂', '离岸服务器']],
  T306: [['\\baugmented[- ]soldiers?', '\\bcyber-augmented', '\\bsuper-?soldiers?', '\\bexoskeletons?'], ['增强士兵', '超级士兵', '外骨骼']],
  T307: [['\\bsmart cit', '\\bubiquitous (sensing|computing)', '\\bsensors everywhere', '\\binternet of things', '\\biot\\b'], ['智慧城市', '泛在感知', '物联网']],
  T308: [['\\btelepresence min', '\\bremote[- ]operated (mines?|rigs?|mining)', '\\bhaptic suits?'], ['遥在采矿', '远程采矿', '触觉服']],
  T309: [['\\bmind upload', '\\bmemory uploads?', '\\bskill uploads?', '\\bupload(ed|ing)? (skills?|memor)', '\\bwhole[- ]brain emulation'], ['上载', '记忆上传', '意识上传', '全脑仿真', '技能上传']],
  T310: [['\\bbiofoundr', '\\bprecision fermentation'], ['生物铸造', '精密发酵']],
  T311: [['\\bbio-?leach', '\\bbio-?mining', '\\bheap leach'], ['生物浸矿', '生物冶金', '细菌浸出', '堆浸']],
  T312: [['\\bnitrogen-fixing (cereals?|wheat|maize|rice|grains?)', '\\bengineered symbios'], ['固氮谷物', '固氮小麦', '固氮水稻', '固氮玉米']],
  T313: [['\\bliving (architecture|buildings?|walls?)', '\\bmycelium (panels?|bricks?)', '\\bgrown (buildings?|houses?|frames?)', '\\bliving root bridges?'], ['活体建筑', '菌丝砖', '菌丝板', '活树根桥']],
  T314: [['\\bmetabolic (enhancement|engineering)', '\\bgene dop', '\\bmyostatin'], ['代谢增强', '基因兴奋剂', '肌肉生长抑制素']],
  T315: [['\\bradiation[- ]toleran', '\\bradioprotect', '\\btardigrade', '\\bdamage suppressor'], ['抗辐射疗法', '辐射耐受', '水熊虫', '缓步动物']],
  T316: [['\\bbio-?isru', '\\bmicrobes? (on|at|for) (mars|titan)'], ['生物原位', '火星微生物']],
  T317: [['\\bterraform', '\\bplanetary (shaping|engineering)', '\\bparaterraform', '\\becopoiesis'], ['地球化', '地化改造', '改造行星', '行星改造']],
  T318: [['\\bself-driving (trucks?|lorr|vehicles?|cars?)', '\\bdriverless', '\\bautonomous (vehicles?|trucks?|freight|logistics|ships?|delivery)', '\\brobotaxi'], ['无人驾驶', '自动驾驶', '自主物流', '无人配送']],
  T319: [['\\blights-out', '\\bdark factor', '\\bunmanned factor', '\\bfactor(y|ies) without (workers|people)'], ['无人工厂', '黑灯工厂', '熄灯工厂']],
  T320: [['\\bmachine governance', '\\bgovernance cent(re|er)s?'], ['机器治理']],
  T321: [['\\bswarm(s|ing)?\\b', '\\bloitering munitions?'], ['集群无人机', '蜂群', '无人机群', '巡飞弹']],
  T322: [['\\bself-improving', '\\brecursive self-improvement', '\\bgenerative design', '\\bdesigns? (its|their) own successors?'], ['自我改进', '生成式设计']],
  T323: [['\\bvon neumann probes?', '\\bself-replicating (probes?|spacecraft)', '\\buniversal constructor'], ['冯·诺依曼探测器', '自复制探测器', '通用构造器']],
  T324: [['\\bsynthetic scientists?', '\\bai scientists?', '\\brobot scientists?', '\\bmachine scientists?', '\\bautomated discovery'], ['合成科学家', '机器科学家', '人工智能科学家']],
  T325: [['\\bvalue[- ]alignment', '\\balignment (research|problem|protocols?)', '\\binterpretability', '\\bred[- ]team'], ['价值对齐', '对齐问题', '可解释性', '红队']],

  C065: [['\\bthrift\\b'], ['节俭']],
  C066: [['\\blow-gravity craft'], ['低重力工艺', '低重力手艺']],
  C067: [['\\bfrontier assembl'], ['边疆议会']],
  C068: [['\\bcouncils? of elders', '\\belders\' councils?', '\\bgerousia'], ['长老议事', '长老会']],
  C069: [['\\bchieftain', '\\bchiefdoms?', '\\bhereditary (chiefs?|rule|rank)', '\\bparamount chief'], ['世袭酋长', '酋邦', '世袭首领']],
  C070: [['\\bbride-?wealth', '\\bbride ?price', '\\bmarriage alliances?', '\\blobola'], ['聘礼', '联姻', '彩礼', '聘金']],
  C071: [['\\bfeast', '\\bpotlatch', '\\bgift[- ](giving|exchange|obligations?)'], ['宴享', '宴请', '夸富宴', '馈赠', '筵席']],
  C072: [['\\brites? of passage', '\\binitiation', '\\bage[- ](sets?|grades?)', '\\bcoming[- ]of[- ]age'], ['成年礼', '年龄组', '成人礼', '冠礼', '入会仪式']],
  C073: [['\\bsacred (groves?|forests?|woods?)', '\\btaboos?'], ['圣林', '禁忌', '神林', '风水林']],
  C074: [['\\btwelve tables', '\\bcodified law', '\\bpublic tablets?', '\\bdraco', '\\bposted (laws?|codes?)'], ['十二铜表', '刑鼎', '铸刑书', '公示法典', '子产']],
  C075: [['\\bcitizen assembl', '\\becclesia', '\\bpopular assembl', '\\bpnyx'], ['公民大会', '民众大会']],
  C076: [['\\bdivine king', '\\bgod-?kings?', '\\bpharaoh', '\\btemple economy', '\\bmandate of heaven'], ['神圣王权', '神王', '法老', '神庙经济', '天命']],
  C077: [['\\btributary', '\\btribute (missions?|states?|system)', '\\bclient (kings?|rulers?|states?)', '\\bvassal states?'], ['朝贡', '附庸', '藩属', '纳贡体系']],
  C078: [['\\btax[- ]farm', '\\bpublicani', '\\bferme g[ée]n[ée]rale'], ['包税']],
  C079: [['\\bsalaried (officials?|collectors?|tax)', '\\brevenue officials?'], ['领薪税吏', '税吏', '领薪官员']],
  C080: [['\\bjubilee', '\\bdebt (cancell|remission|relief|forgiveness|slavery|bondage)', '\\bseisachtheia', '\\bmisharum'], ['免债', '债务豁免', '禧年', '债奴', '解负令']],
  C081: [['\\bschools? of philosophy', '\\bhundred schools', '\\blyceum', '\\bstoa\\b', '\\bjixia'], ['哲学学派', '百家争鸣', '诸子百家', '稷下', '吕克昂']],
  C082: [['\\bolympi', '\\bgladiator', '\\bchariot rac', '\\bamphitheat', '\\bhippodrome'], ['奥林匹亚', '奥运', '角斗', '竞技场', '赛车场']],
  C083: [['\\bmilitary colon', '\\bveterans?\\b', '\\btuntian', '\\bmilitary farms?', '\\bsoldier-farmers?'], ['军屯', '屯田', '老兵', '退伍']],
  C084: [['\\bcouriers?', '\\brelay (stations?|riders?|horses?)', '\\bpony express', '\\bpost[- ]horses?', '\\bcursus publicus'], ['驿站', '驿传', '信使', '邮驿', '驿马']],
  C085: [['\\bmarket inspectors?', '\\bagoranom', '\\bmuhtasib', '\\bhisba', '\\bstandard (weights|measures)'], ['市吏', '市令', '度量监察', '市场监察']],
  C086: [['\\bfeudal', '\\bvassal', '\\bfiefs?\\b', '\\bfealty', '\\bliege'], ['封建', '封臣', '封地', '采邑', '分封']],
  C087: [['\\bprefectur', '\\bmagistrates?', '\\bcommanderies', '\\bjunxian'], ['郡县', '流官', '县令', '知县', '郡守']],
  C088: [['\\bmonks?\\b', '\\bscriptori', '\\bmonastic orders?', '\\babbe(y|ys)\\b', '\\bbenedictine'], ['修道院', '缮写室', '修士', '修女', '僧团']],
  C089: [['\\bchartered towns?', '\\btown charters?', '\\bcommunes?\\b', '\\bburghers?', '\\bfree (cities|towns?)', '\\bmagdeburg law'], ['特许城镇', '自治公社', '城市特许状', '自由市', '市民阶层']],
  C090: [['\\bcivil (service )?exam', '\\bimperial exam', '\\bjinshi', '\\bkeju', '\\bpalace examination', '\\beight-legged'], ['科举考试', '进士', '殿试', '会试', '乡试', '八股']],
  C091: [['\\bbologna', '\\bbachelors?\\b', '\\bdoctorates?', '\\blicentia docendi', '\\bfaculties', '\\bdegrees? (in|of) (law|medicine|theology|arts)'], ['学位', '博洛尼亚', '学士', '博士学位', '巴黎大学']],
  C092: [['\\bcanon law', '\\bsharia', '\\bqadis?\\b', '\\bcustomary (law|courts?)', '\\bchurch courts?', '\\becclesiastical courts?', '\\brabbinical'], ['宗教法', '教会法', '习惯法', '伊斯兰教法', '卡迪']],
  C093: [['\\bhansa', '\\bhanseatic', '\\bmerchant leagues?', '\\bkontors?'], ['汉萨', '商人同盟', '商业同盟']],
  C094: [['\\bpilgrim', '\\bhajj', '\\bcamino', '\\bcompostela', '\\bshrines?'], ['朝圣', '香客', '朝觐', '进香']],
  C095: [['\\bmanor(s|ial)?\\b', '\\bdemesne', '\\bvillein', '\\blabou?r dues', '\\bweek-?work'], ['庄园', '劳役地租', '领主自营地']],
  C096: [['\\bhospitals?\\b', '\\binfirmar', '\\bbimaristan', '\\bh[ôo]tel-dieu'], ['医院', '病院', '养济院']],
  C097: [['\\bchivalr', '\\bbushido', '\\bsamurai', '\\bknights?\\b', '\\bwarrior codes?'], ['武士', '骑士', '武士道', '荣誉法则']],
  C098: [['\\bfish-scale (registers?|maps?|books?)', '\\bland surveys?'], ['鱼鳞图册', '鱼鳞册', '清丈', '田册']],
  C099: [['\\bjoint-stock compan', '\\btransferable shares', '\\bmuscovy company', '\\bshare certificates?'], ['股份公司', '股票', '莫斯科公司']],
  C100: [['\\bcentral bank', '\\bbank of england', '\\briksbank', '\\bpublic debt', '\\bgovernment bonds?', '\\bnational debt', '\\bconsols'], ['中央银行', '央行', '公债', '国债', '英格兰银行']],
  C101: [['\\babsolut(e|ist) (monarch|rule)', '\\babsolutism', '\\bversailles', '\\bsun king', '\\bdivine right'], ['君主专制', '专制君主', '绝对君主', '凡尔赛', '太阳王', '君权神授']],
  C102: [['\\bparliament', '\\bglorious revolution', '\\bhouse of commons'], ['议会', '光荣革命', '下议院']],
  C103: [['\\btoleration', '\\bedict of nantes', '\\bedict of milan', '\\breligious freedom', '\\bfreedom of (worship|conscience)', '\\bpeace of augsburg'], ['宗教宽容', '南特敕令', '米兰敕令', '信仰自由', '宗教自由']],
  C104: [['\\bstate church', '\\bestablished church', '\\btithes?\\b', '\\bconfessional', '\\bcuius regio', '\\binquisition', '\\bheres'], ['国教', '什一税', '宗教裁判', '异端', '信仰统一']],
  C105: [['\\blearned societ', '\\bacad[ée]mie des sciences', '\\bphilosophical transactions', '\\bacademy of sciences'], ['法兰西科学院', '哲学汇刊', '科学院']],
  C106: [['\\bstatute of monopolies', '\\bletters patent', '\\binventors\' privileges', '\\bpatent offices?'], ['专利局', '发明特权', '垄断法']],
  C107: [['\\bmercantil', '\\bnavigation acts?', '\\bbullion', '\\bcolbert', '\\bbalance of trade'], ['重商主义', '航海条例', '贸易顺差', '柯尔贝尔']],
  C108: [['\\bpostal', '\\bpost offices?', '\\bpostage stamps?', '\\bpenny (post|black)', '\\browland hill', '\\bmail coaches?'], ['邮政', '邮局', '邮票', '黑便士']],
  C109: [['\\bmarine insurance', '\\blloyd\'?s', '\\bgeneral average', '\\badmiralty', '\\bunderwrit', '\\bbottomry', '\\brhodian'], ['海上保险', '劳合社', '共同海损', '海事法庭', '海商法']],
  C110: [['\\bpoor laws?', '\\bworkhouses?', '\\bpoorhouses?', '\\bparish relief', '\\boverseers of the poor'], ['济贫法', '习艺所', '济贫院']],
  C111: [['\\bcolonial charters?', '\\bsettler compan', '\\bvirginia company', '\\bjamestown', '\\bmassachusetts bay'], ['殖民特许', '移民公司', '弗吉尼亚公司']],
  C112: [['\\bfree[- ]trade', '\\bcorn laws', '\\bcobden', '\\bcomparative advantage'], ['自由贸易', '谷物法', '比较优势']],
  C113: [['\\bbill of rights', '\\bwritten constitution', '\\bconstitutional convention'], ['成文宪法', '权利法案', '制宪会议']],
  C114: [['\\blev[ée]e en masse', '\\bmass conscription', '\\buniversal (military )?service', '\\bdraft boards?'], ['普遍征兵', '全民皆兵', '总动员']],
  C115: [['\\bvolunteer (army|force|soldiers?)', '\\bprofessional army', '\\ball-volunteer', '\\bmercenar'], ['志愿兵', '职业军队', '募兵', '雇佣兵']],
  C116: [['\\bfactory (inspect|acts?)', '\\bchild labou?r', '\\bfactory inspectors?'], ['工厂监察', '童工', '工厂法']],
  C117: [['\\bsick (funds?|clubs?|benefit)', '\\bburial (clubs?|societ)', '\\bmutual insurance', '\\boddfellows'], ['互助保险', '丧葬会', '疾病基金']],
  C118: [['\\bpublic health (boards?|acts?)', '\\bboards? of health', '\\bmedical officers? of health', '\\bchadwick', '\\bjohn snow', '\\bbroad street', '\\bcholera'], ['公共卫生委员会', '卫生局', '霍乱', '约翰·斯诺']],
  C119: [['\\bcensus', '\\bstatistical (bureau|office)', '\\benumerators?', '\\bhollerith', '\\bpunched cards?'], ['人口普查', '统计局', '普查员']],
  C120: [['\\binstitution of civil engineers', '\\bchartered engineers?', '\\bprofessional engineers?', '\\bengineering (societ|institut)', '\\bbuilding codes?'], ['工程师学会', '注册工程师', '特许工程师', '土木工程师学会']],
  C121: [['\\bstock exchanges?', '\\bbourse', '\\bstockbrok', '\\bbrokers?\\b', '\\bwall street', '\\bbuttonwood'], ['证券交易所', '交易所', '股市', '经纪人', '华尔街']],
  C122: [['\\bnational language', '\\bstandard language', '\\bmother tongue', '\\bnational identity', '\\bnationalism'], ['国语', '民族认同', '标准语', '普通话', '民族主义']],
  C123: [['\\babolition', '\\babolish(ed|ing)? (slavery|serfdom)', '\\bemancipation', '\\bmanumission', '\\bslave trade'], ['废奴', '废除奴隶', '解放农奴', '奴隶贸易', '废除农奴']],
  C124: [['\\bresearch universit', '\\bhumboldt', '\\bdoctoral', '\\bph\\.?d\\b', '\\bgraduate schools?', '\\bjohns hopkins'], ['研究型大学', '洪堡', '博士生', '研究生院']],
  C125: [['\\bsuffrag', '\\bsecret ballot', '\\bvotes for women', '\\bright to vote', '\\bvoting rights', '\\bfranchise\\b'], ['普选', '选举权', '投票权', '秘密投票', '妇女参政']],
  C126: [['\\bbismarck', '\\bold-age pensions?', '\\bsocial security', '\\bunemployment insurance', '\\bbeveridge'], ['养老保险', '社会保障', '失业保险', '俾斯麦', '贝弗里奇']],
  C127: [['\\bcentral(ly)? plann', '\\bfive-year plans?', '\\bgosplan', '\\bplanned economy', '\\bmaterial balances', '\\bcommand economy'], ['计划经济', '五年计划', '计委', '中央计划', '指令性']],
  C128: [['\\bantitrust', '\\bcompetition law', '\\bsherman act', '\\btrust-?bust', '\\bcartels?\\b'], ['反垄断', '竞争法', '谢尔曼法', '卡特尔']],
  C129: [['\\btripartite', '\\bsocial partners', '\\bcorporatis', '\\bsaltsj[öo]baden', '\\bwage councils?', '\\bpolder model'], ['三方协商', '劳资政', '社会伙伴', '萨尔特舍巴登']],
  C130: [['\\bindustrial research', '\\bcorporate (research )?lab', '\\bbell lab', '\\bmenlo park'], ['企业研究', '贝尔实验室', '门洛帕克', '工业实验室']],
  C131: [['\\bpublic (service )?broadcast', '\\bbbc\\b', '\\blicen[cs]e fee', '\\breith'], ['公共广播', '英国广播公司', '收视费', '执照费', '里思']],
  C132: [['\\bcommercial (radio|broadcast|television|stations?)', '\\badvertis', '\\bsponsors?(hip)?\\b', '\\bsoap operas?', '\\bratings\\b'], ['商业广播', '广告', '赞助商', '肥皂剧', '收视率']],
  C133: [['\\bfamily planning', '\\bcontracepti', '\\bbirth control', '\\bthe pill\\b'], ['计划生育', '避孕', '节育']],
  C134: [['\\bnational parks?', '\\byellowstone', '\\bpark rangers?', '\\bnature reserves?', '\\bwilderness (act|areas?)'], ['国家公园', '黄石', '护林员', '自然保护区']],
  C135: [['\\bpolitical police', '\\bsecret police', '\\bokhrana', '\\bcheka', '\\bgestapo', '\\bstasi', '\\binformers?\\b'], ['政治警察', '秘密警察', '告密', '线人', '特务']],
  C136: [['\\bnational science (foundation|council)', '\\bvannevar bush', '\\bendless frontier', '\\bpeer-reviewed grants?', '\\bgrant agenc', '\\bresearch councils?'], ['国家科学基金', '科学委员会', '资助机构', '无尽的前沿']],
  C137: [['\\benvironmental impact', '\\bimpact (statements?|assessments?)', '\\bnepa\\b'], ['环境影响', '环评']],
  C138: [['\\bfreedom of information', '\\bfoia\\b', '\\bsunshine laws?', '\\bright to information'], ['信息公开', '政府信息', '知情权']],
  C139: [['\\bprivacy', '\\bgdpr', '\\bdata protection (authorit|regulat)', '\\bright to be forgotten'], ['隐私', '个人信息保护', '被遗忘权']],
  C140: [['\\bmass surveillance', '\\bsurveillance (programmes?|state)', '\\bwiretap', '\\bintercepts?\\b', '\\bsnowden', '\\bdragnet', '\\bpanopticon'], ['大规模监控', '监控计划', '窃听', '斯诺登', '全景监狱']],
  C141: [['\\biso\\b', '\\binternational (standards|organi[sz]ation for standard)', '\\btelegraph union', '\\bstandards bod'], ['国际标准', '国际电信联盟', '标准化组织']],
  C142: [['\\bventure capital', '\\bstart-?ups?\\b', '\\bangel investors?', '\\bsilicon valley', '\\bunicorns?'], ['风险投资', '风投', '初创', '硅谷']],
  C143: [['\\bopen[- ]source', '\\bfree software', '\\bgnu\\b', '\\blinux', '\\bcopyleft', '\\bgpl\\b'], ['开源', '自由软件', '著佐权', '开放源代码']],
  C144: [['\\bspace agenc', '\\bnasa\\b', '\\besa\\b', '\\bjaxa', '\\bisro\\b'], ['航天局', '宇航局']],
  C145: [['\\bnuclear (safety|regulat)', '\\batomic energy commission', '\\bthree mile island', '\\bchernobyl', '\\bfukushima', '\\biaea'], ['核安全', '核监管', '三哩岛', '三里岛', '切尔诺贝利', '福岛', '国际原子能机构']],
  C146: [['\\buniversal (health|healthcare|coverage)', '\\bnational health service', '\\bnhs\\b', '\\bsingle-payer', '\\bmedicare'], ['全民医保', '全民医疗', '国民保健', '医保']],
  C147: [['\\bclimate (treat|change|accord)', '\\bcarbon (accounting|budgets?|emissions|credits?|tax)', '\\bkyoto', '\\bparis agreement', '\\bgreenhouse', '\\bmontreal protocol'], ['气候条约', '气候变化', '碳排放', '碳核算', '温室气体', '京都议定书', '巴黎协定']],
  C148: [['\\barms[- ]control', '\\bverification regime', '\\bon-site inspections?', '\\bnon-proliferation', '\\btrust,? but verify'], ['军控', '不扩散', '现场视察', '裁军']],
  C149: [['\\bouter space treaty', '\\bspace commons', '\\bprovince of all mankind', '\\bmoon agreement'], ['外层空间条约', '太空公域', '月球协定']],
  C150: [['\\bhomestead', '\\bclaim[- ]staking', '\\bstake (a|their|his|her) claims?'], ['宅地', '跑马圈地', '先占']],
  C151: [['\\blaunch ranges?', '\\brange safety', '\\bflight termination', '\\brange control', '\\bbaikonur', '\\bkourou', '\\bjiuquan'], ['发射场', '靶场', '自毁指令', '拜科努尔', '酒泉', '库鲁']],
  C152: [['\\bcrew articles?', '\\bstation crews?', '\\bships\' articles', '\\bmedical boards?', '\\brotation rules?'], ['乘员公约', '空间站乘员', '船员条款']],
  C153: [['\\borbital traffic', '\\bspace traffic', '\\bconjunction (warnings?|alerts?)', '\\bdebris', '\\bkessler', '\\bdeorbit'], ['轨道交通管理', '太空交通', '太空碎片', '空间碎片', '凯斯勒', '离轨']],
  C154: [['\\bplanetary protection', '\\bforward contamination', '\\bback contamination', '\\bsterili[sz]'], ['行星保护', '正向污染', '逆向污染', '灭菌']],
  C155: [['\\basteroid min', '\\bprospectors?\\b', '\\bore rights', '\\bmining (charters?|claims?|licen[cs]es?)'], ['小行星采矿', '探矿', '采矿权', '矿权']],
  C156: [['\\bindentur', '\\bredemptioners?', '\\bcoolie', '\\bcontract labou?r'], ['契约移民', '契约劳工', '契约奴', '苦力', '猪仔']],
  C157: [['\\bassisted (passage|migration|emigration)', '\\bsubsidi[sz]ed (passage|migration)', '\\bfree passage', '\\bten[- ]pound poms'], ['资助移民', '资助自由移民', '免费船票', '十镑移民']],
  C158: [['\\bspace guard', '\\bspace force', '\\borbital militia', '\\bboarding (parties|actions?|defen)'], ['太空警备', '太空军', '天军', '轨道民兵']],
  C159: [['\\balgorithmic audit', '\\baudit courts?', '\\bmodel audits?', '\\bauditing (algorithms|models)'], ['算法审计', '审计法庭']],
  C160: [['\\bbasic income', '\\bubi\\b', '\\bnegative income tax', '\\bmincome', '\\bsocial dividend', '\\bspeenhamland'], ['基本收入', '负所得税', '社会红利']],
  C161: [['\\bjob guarantee', '\\bemployer of last resort', '\\bworks progress', '\\bwpa\\b', '\\bnrega'], ['就业保障', '以工代赈', '最后雇主']],
  C162: [['\\bcompute (allocation|quotas?|rationing)', '\\ballocation boards?', '\\bpriority lists?'], ['算力分配', '算力配额', '分配委员会']],
  C163: [['\\bsynthetic persons?', '\\belectronic personhood', '\\bmachine personhood', '\\blegal personhood'], ['合成人', '电子人格', '机器人格', '法律人格']],
  C164: [['\\bmeaningful human control', '\\blethal autonomous', '\\bkiller robots?', '\\bautonomous weapons?'], ['人在回路', '致命性自主', '杀手机器人', '自主武器']],
  C165: [['\\bgenerational equity', '\\brights of the unborn', '\\bseventh generation', '\\bfuture generations commissioner'], ['代际公平', '未出生者', '第七代', '未来世代专员']],
  C166: [['\\bcompute (treaty|ceilings?|caps?)', '\\bglobal compute', '\\bchip (export )?controls'], ['算力条约', '算力上限', '全球算力']],
  C167: [['\\bmachine trustee', '\\btrusteeship', '\\bautomated stewards?'], ['机器托管', '受托管理']],
  C168: [['\\bengine[- ]house', '\\bbrotherhoods?', '\\bengine crews?', '\\bfootplate', '\\bamalgamated society of engineers'], ['机房兄弟会', '兄弟会', '机房', '司机工会']],
  C169: [['\\boil concessions?', '\\bconcession (agreements?|holders?)', '\\broyalt(y|ies)\\b', '\\bred line agreement', '\\baramco', '\\bseven sisters'], ['石油租让', '租让', '矿区使用费', '红线协定', '七姐妹']],
  C170: [['\\bpower co-?operatives?', '\\belectric co-?operatives?', '\\brural electrification', '\\btennessee valley', '\\btva\\b', '\\bmunicipal (utilit|power)'], ['电力合作社', '农村电气化', '田纳西河谷', '市政电力']],
  C171: [['\\batomic (priesthood|stewardship)', '\\bwaste (custodians?|isolation)', '\\bonkalo', '\\bnuclear semiotics', '\\bray cats?'], ['原子守护', '核废料', '核符号学', '昂卡洛']],
  C172: [['\\bcorporate citizens(hip)?', '\\bcompany (scrip|passports?)', '\\bemployer-issued (identity|citizenship)'], ['企业公民', '公司护照', '公司代币']],
  C173: [['\\bbioethic', '\\binstitutional review boards?', '\\birbs?\\b', '\\bethics (boards?|committees?|review)', '\\basilomar', '\\bnuremberg code', '\\bhelsinki declaration', '\\bbelmont report', '\\btuskegee'], ['生物伦理', '伦理审查', '伦理委员会', '纽伦堡守则', '赫尔辛基宣言', '阿西洛马', '塔斯基吉']],
  C174: [['\\bmachine[- ]labou?r dividends?', '\\brobot (tax|dividends?)', '\\bautomation dividends?', '\\bsovereign wealth fund', '\\bpermanent fund', '\\bcitizens\' dividend'], ['机器劳动红利', '机器人税', '自动化红利', '主权财富基金', '永久基金']],
};

// ---- the graphs ------------------------------------------------------------------------
// Two graphs. The CONTENT graph is content/{technologies,practices}.json, what the game
// ships today. The DRAFT graph is the content graph merged with the nodes designed but not
// yet in content/: doc 37 §7.1 and §6.7 (DOC37 below: 19 technologies, 3 practices, two
// renames) and doc 39 (docs/design/39-draft-*.json: `add`, `rename`, `relink`). Lore entries
// for draft ids live in content/lore/ already; the client ignores them because it keys
// passages by the names in content/ (vite.config.ts), so they wait there until the merge.
// A content entry must pass both graphs; a draft entry the draft graph. Once a draft node
// is merged into content/, the content version wins and the draft one is skipped.
const DOC37 = {
  rename: [
    { id: 'T140', name: 'Chemical rocket propulsion', zh: '化学火箭推进' },
    { id: 'T142', name: 'Repeatable orbital transport and launch centres', zh: '可重复的轨道运输与发射中心' },
  ],
  // doc 37 §7.1 gives no Chinese names; these are the ones the passages use. C065-C067 have
  // no prerequisites in doc 37 (they are recognizable only where off-world people live);
  // the ones here are provisional, and their passages lean only on habitat contracts (C058).
  add: [
    ['T154', 'Reusable launch and recovery', '可复用发射与回收', 'T142 & T114 & T152'],
    ['T155', 'Electric propulsion: ion and Hall thrusters', '电推进：离子与霍尔推力器', 'T143 & T107 & T103'],
    ['T156', 'Electromagnetic launch and mass drivers', '电磁发射与质量投射器', 'T101 & T107 & T108'],
    ['T157', 'Nuclear thermal propulsion', '核热推进', 'T147 & T140 & T067'],
    ['T158', 'Nuclear electric propulsion', '核电推进', 'T147 & T155'],
    ['T159', 'In-situ resource utilisation', '原位资源利用', 'T143 & T064 & T042'],
    ['T170', 'Shielded off-world habitats', '屏蔽式地外栖居地', 'T144 & T143 & T050'],
    ['T171', 'Low-gravity medicine and off-world births', '低重力医学与地外生育', 'T144 & T046 & T134'],
    ['T172', 'Off-world mining and processing', '地外采矿与加工', 'T159 & T063 & T114'],
    ['T173', 'Fusion propulsion', '聚变推进', 'T149 & T158'],
    ['T174', 'Beamed-energy propulsion and light sails', '定向能推进与光帆', 'T109 & T150'],
    ['T175', 'Deep-space communication and autonomy', '深空通信与自主运行', 'T112 & T152 & T116'],
    ['T176', 'Cryogenic propellant depots', '低温推进剂仓库', 'T108 & T145 & T159'],
    ['T177', 'Rotating habitats and orbital settlements', '旋转栖居地与轨道定居点', 'T145 & T137 & T170'],
    ['T178', 'Heavy-lift booster mass production', '重型助推器量产', 'T142 & T092 & T071'],
    ['T179', 'Grown habitats and biological ISRU', '生长式栖居地与生物原位利用', 'T132 & T135 & T159'],
    ['T180', 'Neural telepresence and remote operation', '神经遥在与远程操作', 'T120 & T175'],
    ['T181', 'Self-replicating seed factories', '自我复制的种子工厂', 'T122 & T172 & T114'],
    ['T182', 'Nuclear pulse propulsion', '核脉冲推进', 'T147 & T067 & T145'],
    ['C065', 'Closed-loop thrift', '闭环节俭', 'C058 & C055'],
    ['C066', 'Low-gravity crafts', '低重力工艺', 'C058 & C018'],
    ['C067', 'Frontier assemblies', '边疆议会', 'C058 & C057'],
  ],
};
const draftFile = (n) => join(repo, 'docs', 'design', n);
const DRAFT_T = existsSync(draftFile('39-draft-technologies.json')) ? json(draftFile('39-draft-technologies.json')) : { add: [] };
const DRAFT_P = existsSync(draftFile('39-draft-practices.json')) ? json(draftFile('39-draft-practices.json')) : { add: [] };
// doc 39 renames technologies only by English name; the Chinese names follow
const ZH_RENAME = { T048: '活字与规模化印刷' };

function techNode(t) {
  const zh = TECH[t.id] ?? [];
  return { id: t.id, kind: 'tech', name: t.name, zhName: zh[0] ?? '', prereq: t.prereq, cardEn: [t.name, t.requirements, t.capability].join(' \n '), cardZh: zh.join(' \n ') };
}
function practiceNode(p) {
  const zh = PRACTICE[p.id] ?? [];
  return { id: p.id, kind: 'practice', name: p.name, zhName: zh[0] ?? '', prereq: p.prereq, cardEn: [p.name, p.requirements, p.behavior].join(' \n '), cardZh: zh.join(' \n ') };
}

function graph(list) {
  const nodes = new Map(list.map((n) => [n.id, n]));
  const ancestors = new Map();
  const anc = (id) => {
    if (ancestors.has(id)) return ancestors.get(id);
    const out = new Set();
    ancestors.set(id, out);
    for (const p of (nodes.get(id)?.prereq ?? '').match(/[TC]\d{3}/g) ?? []) {
      out.add(p);
      for (const q of anc(p)) out.add(q);
    }
    return out;
  };
  for (const id of nodes.keys()) anc(id);
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameRe = new Map([...nodes.values()].map((n) => [n.id, new RegExp('\\b' + escape(n.name) + '\\b', 'i')]));
  return { nodes, ancestors, nameRe };
}

const content = graph([...techs.map(techNode), ...pracs.map(practiceNode)]);
const draftIds = new Set();
const draft = (() => {
  const list = new Map([...content.nodes].map(([id, n]) => [id, { ...n }]));
  const add = (n) => { if (!list.has(n.id)) { list.set(n.id, n); draftIds.add(n.id); } };
  for (const [id, name, zhName, prereq] of DOC37.add) add({ id, kind: id[0] === 'T' ? 'tech' : 'practice', name, zhName, prereq, cardEn: name, cardZh: zhName });
  for (const t of DRAFT_T.add) add({ ...techNode(t), zhName: t.draft.name_zh, cardZh: t.draft.name_zh });
  for (const p of DRAFT_P.add) add({ ...practiceNode(p), zhName: p.draft.name_zh, cardZh: p.draft.name_zh });
  // renames and relinks apply only while the draft is unmerged (the node keeps its old name)
  const renames = [...DOC37.rename, ...(DRAFT_T.rename ?? []).filter((r) => r.name).map((r) => ({ id: r.id, name: r.name, zh: ZH_RENAME[r.id] }))];
  for (const r of renames) {
    const n = list.get(r.id);
    if (!n || n.name === r.name || !draftIds.size) continue;
    n.name = r.name;
    n.cardEn = [r.name, n.cardEn].join(' \n ');
    if (r.zh) { n.zhName = r.zh; n.cardZh = [r.zh, n.cardZh].join(' \n '); }
  }
  for (const r of DRAFT_T.relink ?? []) {
    const n = list.get(r.id);
    if (n && n.prereq === r.prereq_before) n.prereq = r.prereq_after;
  }
  return graph([...list.values()]);
})();

// the content graph, as before (other scripts may import these)
const { nodes, ancestors } = content;
export { nodes, ancestors, draft, draftIds };

const tellRe = new Map(Object.entries(TELL).map(([id, [en, zh]]) => [id, { en: en.map((s) => new RegExp(s, 'i')), zh }]));

// Fixed phrases whose words are not about the node they resemble (Mencius's compass draws
// circles; it does not point north; the Event Horizon Telescope is an interferometer).
const ALLOW = [/royal road/gi, /compass and the carpenter's square/gi, /Event Horizon Telescope/g, /事件视界望远镜/g];

/** Spoilers in one text of node `id`: [{ by, what }], against graph `g` (default: content). */
export function spoilers(id, raw, lang, g = content) {
  const text = ALLOW.reduce((s, re) => s.replace(re, ' '), raw);
  const self = g.nodes.get(id);
  const ok = g.ancestors.get(id);
  const found = [];
  for (const other of g.nodes.values()) {
    if (other.id === id || ok.has(other.id)) continue;
    if (lang === 'en') {
      const re = g.nameRe.get(other.id);
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
    const inContent = !!e && content.nodes.has(e.id);
    if (!e || (!inContent && !draftIds.has(e.id))) { err(e?.id ?? '?', `unknown id in ${f}`); continue; }
    if (seen.has(e.id)) err(e.id, 'duplicate entry');
    seen.set(e.id, e);
    const tag = inContent ? '' : ' (draft)';
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
        const text = [x.intro, x.quote?.text ?? '', x.quote?.source ?? ''].join(' \n ');
        const l = lang === 'en' ? 'en' : 'zh';
        // content entries against the shipped graph, then everything against the draft graph
        const msgs = new Set();
        if (inContent) for (const s of spoilers(e.id, text, l, content)) msgs.add(`${s.what} [${s.by}]`);
        for (const s of spoilers(e.id, text, l, draft)) {
          const m = `${s.what} [${s.by}]`;
          if (!msgs.has(m)) msgs.add(m + (inContent ? ' (draft graph)' : ''));
        }
        for (const m of msgs) err(e.id, `${lang} names a node that may not be discovered yet${tag}: ${m}`);
      }
    }
    const q = ['en', 'zh-Hans', ...(partial ? [] : ['zh-Hant'])].map((l) => !!e[l]?.quote);
    if (q.some(Boolean) && !q.every(Boolean)) err(e.id, 'a quote is given in some languages only');
    if (q[0]) quotes += 1;
  }
}
if (!partial) {
  for (const id of content.nodes.keys()) if (!seen.has(id)) err(id, 'no lore entry');
  for (const id of draftIds) if (!seen.has(id)) err(id, 'no lore entry (draft node)');
}
const counted = [...seen.keys()];
const nd = counted.filter((x) => draftIds.has(x)).length;
console.log(`${counted.filter((x) => x[0] === 'T').length} technology and ${counted.filter((x) => x[0] === 'C').length} practice entries checked (${nd} for draft nodes of docs 37 and 39), ${quotes} with quotations`);
if (errors.length) {
  console.log(errors.join('\n'));
  console.log(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('lore: no problems');
}
