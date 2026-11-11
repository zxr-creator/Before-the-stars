// zh-Hans translations of the catalog defined in Rust (crates/bts-engine/src/content.rs,
// crates/bts-protocol/src/lib.rs, worldgen.rs, sim/culture.rs). Consumed by i18n-build.mjs,
// which cross-checks every entry against the Rust sources.

/** facility key → [name, description] */
export const FACILITY = {
  fields: ['农田', '开垦并照料的田块。每级需要十名耕作者；产量取决于种子、畜力、水以及实际到位的投入，库存中没有工具时减产三成。'],
  pasture: ['牧场', '在粗放草场上经营的畜群。掌握相应技术后，牲畜还能提供畜力。'],
  fishery: ['渔场', '在一段海岸或河道上作业的渔网、鱼梁和渔船。'],
  granary: ['粮仓', '有专人看管的干燥仓房。每级可存放 2,500 单位粮食，并减缓腐坏。'],
  irrigation: ['灌溉工程', '水渠与闸门。每级可灌溉五级农田。'],
  camp: ['伐木采石场', '伐木、采石、挖取黏土，提供建筑材料。'],
  mine_copper: ['铜矿', '在已勘明的铜矿体上开采。产出从矿藏储量中扣除。'],
  mine_iron: ['铁矿', '在已勘明的铁矿体上开采。产出从矿藏储量中扣除。'],
  mine_coal: ['煤矿', '采煤作业。产出从煤层储量中扣除。'],
  mine_minerals: ['稀有矿物矿场', '小规模的选择性开采，专采经分析证明确有用处的矿物。'],
  oilwell: ['油井', '在已知油田上钻凿的油井和集输管线。'],
  workshop: ['手工作坊', '制作工具的作坊。金属越好，同样的人手做出的工具越多、越精良。'],
  kiln: ['窑场', '烧制砖瓦和器皿：没有森林也能得到建筑材料。'],
  copper_smelter: ['炼铜炉', '用木炭炉还原铜矿石。'],
  bloomery: ['块炼铁炉', '把矿石炼成可锻铁料的小型炉子和锻炉。'],
  steelworks: ['钢铁厂', '焦炉配合受控炼钢，形成规模生产。'],
  machine_shop: ['机加工车间', '用标准化机床按量规切削部件。需要轴动力。'],
  parts_works: ['配件与修理厂', '为各类机器配套生产备件、润滑剂和滤芯。'],
  wire_works: ['铜精炼与线材厂', '把精炼铜拉制成品质可知的导线。'],
  chem_plant: ['化工厂', '以受控工艺生产试剂、酸、碱和养分。'],
  insulation_works: ['绝缘与密封件厂', '生产耐热和绝缘极限明确的陶瓷、橡胶与高分子部件。'],
  refinery: ['炼油厂', '带成分检验的分馏：产出品质可知的燃料和化工原料。'],
  synfuel: ['合成燃料厂', '在够不着油井的时候，用煤和电力制取燃料。'],
  purifier: ['高纯材料厂', '以电化学方法提纯，制成普通玻璃和金属无法替代的基材。'],
  fab: ['电子器件车间', '生产电子器件的洁净制造单元。'],
  computer_works: ['计算机厂', '计算硬件的组装与验收测试。'],
  datacenter: ['计算中心', '装机的硬件按月提供算力。算力无法储存。'],
  press: ['缮写室与印坊', '制作耐久的记录载体和教材，日后还能廉价印刷。'],
  instrument_shop: ['仪器作坊', '天平、量规、光学器件和钟表：让测量可以重复的设备。'],
  pharma: ['制药与生物制品厂', '生产药品；掌握受控生物体之后，还能生产更多种类的生物制品。'],
  waterwheel: ['水力与风力磨坊', '从真实的落差或稳定的风力中取得轴动力。每级提供 20。'],
  steam: ['蒸汽动力站', '锅炉和蒸汽机把煤变成轴功。'],
  diesel: ['柴油动力站', '燃烧精炼燃料的发动机：只要燃料送得到，就有紧凑的动力。'],
  generator: ['发电机房', '每级可把当地至多 60 的轴动力按九成效率转换为电力。'],
  hydro: ['水电站', '建在已勘明坝址上的大坝、水轮和发电机。不耗燃料；出力上限取决于河流。'],
  grid: ['电网与变电站', '把本地区接入全国电网，电力得以调剂共享，但有损耗。'],
  fission: ['裂变电站', '有保障措施的反应堆：用少量稀有矿物换来稳定的电力。'],
  fusion: ['聚变电站', '可维护的净功率聚变。出力极大，维护负担也极重。'],
  orbital_power: ['轨道电力接收站', '接收轨道采集电力的地面站。需要一座轨道船坞。'],
  roads: ['道路与驿站', '有人养护的道路、桥梁和分段接运，把本地区与其他地区连接起来。'],
  port: ['港口', '泊位、船台和仓库。开通海上联络和深水捕捞。'],
  rail: ['铁路', '在固定轨道上运送重载货物。'],
  depot: ['汽车运输站', '车辆、燃料和维修队伍，承担机械化货运。'],
  waterworks: ['水井与供水设施', '提水与配水。每级可供 1,200 名居民用水。'],
  sewers: ['排水沟与下水道', '把饮用水与污物分开。每级可服务 3,000 名居民。'],
  water_treatment: ['水处理厂', '为人口稠密的城市提供净化供水和卫生设施。每级可服务 12,000 名居民。'],
  clinic: ['医庐', '创伤救治与用药，每级可照护 800 名居民。'],
  hospital: ['医院', '临床记录、训练有素的医师，物资到位时还有药品。每级可照护 4,000 名居民。'],
  admin: ['行政官署', '预算记录和任命的官吏。每级可多管理三个地区。'],
  barracks: ['兵营与校场', '名册、仓储和操练场地，每级可同时训练 200 名士兵。'],
  holy_site: ['圣域', '地方信仰运动长期聚会、传授和施行救济的中心。'],
  lodge: ['传习所', '示范、带徒和小班教学。每级十六个名额。'],
  school: ['学校', '有课程和教材的长设校址。每级四十个名额。'],
  college: ['学院', '依靠资助的专门教学。每级三十个名额。'],
  tech_institute: ['技术学院', '配有真实机器和量具的实训车间。每级三十二个名额。'],
  makers_circle: ['匠人会', '让从业者有时间比较各自的做法、尝试改进。'],
  archive: ['档案馆与学馆', '妥善保存的记录，以及受雇阅读、比对和计算的人。'],
  laboratory: ['实验室', '仪器、对照比较和重复试验。'],
  institute: ['研究所', '有组织的研究计划，把科学家同作坊和工程师联结起来。'],
  advanced_lab: ['高级研究中心', '以计算为支撑、配备精密仪器的研究。'],
  auto_lab: ['自动化实验大厅', '经过验证的模型在人工监督下操作真实的实验站。'],
  high_energy: ['高能实验室', '加速器、等离子体装置，以及能操作它们的人。'],
  launch_complex: ['发射场', '发射台、测控和推进剂加注设施。只有补给不断，才能保持发射频次。'],
  orbital_station: ['轨道站', '有人驻守、定期补给的空间站。需要同一地区有一座运转中的发射场。'],
  orbital_yard: ['轨道船坞', '在轨道上进行规模化的建造与制造。需要同一地区有一座轨道站。'],
  interferometer: ['轨道干涉仪阵列', '在轨道上组装的长基线光学仪器。'],
  jump_testbed: ['跃迁试验台', '第一座能在负载下重现异常现象的装置。需要一座轨道船坞和巨量电力。'],
  jump_yard: ['跃迁装置总装线', '一条可独立运转的生产线，满负荷工作二十四个月可完成一台标准跃迁装置。'],
  jump_base: ['跃迁部署节点', '设在三个试验节点之一的运输、维护与回收能力。'],
};

export const FAC_CATEGORY = {
  Food: '粮食', Extraction: '采掘', Industry: '工业', Power: '动力', Transport: '运输', Civic: '公共',
  Education: '教育', Research: '研究', Space: '航天', 'Jump engineering': '跃迁工程',
};

/** recipe English name → Chinese */
export const RECIPE = {
  'Timber, stone and clay': '木石与黏土',
  'Drained deep workings': '排水深部开采',
  'Shallow workings': '浅层开采',
  'Selective workings': '选择性开采',
  'Crude extraction': '原油开采',
  'Iron tools': '铁制工具',
  'Copper and bronze tools': '铜与青铜工具',
  'Stone, bone and wood tools': '石、骨、木工具',
  'Fired building material': '烧制建材',
  'Copper smelting': '炼铜',
  'Bloomery iron': '块炼铁',
  'Coke steel': '焦炭炼钢',
  'Precision machining': '精密机加工',
  'Maintenance inputs': '维护用品',
  'Electrolytic refining and drawing': '电解精炼与拉丝',
  'Fire-refined drawn wire': '火法精炼拉丝',
  'Industrial chemicals': '工业化学品',
  'Wood and mineral chemistry': '木材与矿物化工',
  'Polymer insulation': '高分子绝缘件',
  'Ceramic and natural insulation': '陶瓷与天然绝缘件',
  Fractionation: '分馏',
  'Synthetic hydrocarbons': '合成烃',
  'High-purity substrate': '高纯基材',
  'Integrated devices': '集成器件',
  'Vacuum devices': '真空器件',
  'Hardware assembly': '硬件组装',
  'Accelerator clusters': '加速器集群',
  'Programmable computers': '可编程计算机',
  'Scaled printing': '规模化印刷',
  'Teaching-text reproduction': '教材复制',
  'Written records': '书面记录',
  'Precision instruments': '精密仪器',
  'Measuring instruments': '测量仪器',
  'Copper measuring instruments': '铜制测量仪器',
  'Controlled biological manufacture': '受控生物制造',
  'Pharmaceutical manufacture': '制药',
  'Mill wheels': '磨坊水轮',
  'Steam turbines': '蒸汽轮机',
  'High-pressure compound engines': '高压复式蒸汽机',
  'Practical steam engines': '实用蒸汽机',
  'Heavy diesel': '重型柴油机',
  'Internal combustion': '内燃机',
  'Hydroelectric generation': '水力发电',
  'Fission generation': '裂变发电',
  'Fusion generation': '聚变发电',
  'Orbital collection': '轨道采集',
  'Craft inquiry': '工艺探究',
  'Scholarly study': '学术研究',
  'Experimental science': '实验科学',
  'Industrial research': '工业研究',
  'Computation-supported research': '计算辅助研究',
  'Instrumented research': '仪器化研究',
  'Automated experiments': '自动化实验',
  'Frontier experiments': '前沿实验',
  'Launch cadence': '发射频次',
  'Orbital research': '轨道研究',
  'Orbital operations': '轨道作业',
  'Baseline observations': '基线观测',
  'Jump-interface experiments': '跃迁界面实验',
  'Jump assembly manufacture': '跃迁装置制造',
  'Node operations': '节点运行',
};

/** study domains: key → [name, description] (Tag in content.rs) */
export const TAG = {
  forage: ['野生食物与季节', '采集、狩猎、捕鱼，以及季节对它们的影响。'],
  farm: ['耕作与畜群', '田地、种子、土壤、牲畜，以及它们所需的劳力。'],
  craft: ['材料与手工', '加工石、木、纤维和黏土；工具为什么会坏。'],
  build: ['建筑与工程', '房屋、道路、桥梁，以及它们承受的荷载。'],
  water: ['水与水流', '水井、水渠、磨坊，以及流水的规律。'],
  sea: ['海岸与航行', '船只、洋流、地标和远方的海岸。'],
  mine: ['岩石与矿石', '地下有什么，又如何取得。'],
  metal: ['炉火与金属', '冶炼、锻造，以及成品的质量。'],
  record: ['记录与计算', '记号、账目、档案和行政。'],
  trade: ['交换与交往', '其他族群制造什么、需要什么、懂得什么。'],
  teach: ['教学与传承', '技艺如何在人与人、代与代之间传递。'],
  measure: ['测量与比较', '标准、仪器和可重复的试验。'],
  science: ['自然哲学', '模型、实验，以及它们与现实的出入。'],
  health: ['身体与医治', '伤病、照护，以及真正有效的办法。'],
  war: ['武备与防御', '兵器、操练、工事，以及威胁之下的补给。'],
  steam: ['热与蒸汽', '锅炉、压力、蒸汽机和白白散失的热量。'],
  fuel: ['燃料与发动机', '液体燃料、燃烧和机动机械。'],
  chem: ['物质与反应', '分离、纯度和工业化学。'],
  electric: ['电力', '发电、导体、控制和电子学。'],
  compute: ['计算与网络', '算法、执行算法的机器，以及它们需要的数据。'],
  bio: ['生命系统', '作为生产者、病患和栖息地的生物体。'],
  space: ['轨道与真空', '发射、轨道作业和大气层外的生活。'],
  highenergy: ['高能现象', '粒子、等离子体和极端场态。'],
  machine: ['机器与公差', '精度、互换性零件和可靠的产能。'],
};

/** formation tiers and their three role names */
export const UNIT = {
  'Subsistence warbands': '部落战团',
  'Urban-craft levies': '城邦征召军',
  'Bronze and iron levies': '青铜铁器征召军',
  'Powder and drill': '火器操典军',
  'Mechanized formations': '机械化兵团',
  'Industrial formations': '工业化兵团',
  'Networked forces': '网络化部队',
  'Autonomous systems': '自主系统',
  'Melee bands': '近战队',
  'Light hunters': '轻装猎手',
  'Spear lines': '长矛阵',
  'Heavy infantry': '重步兵',
  Cavalry: '骑兵',
  'Pike formations': '长枪方阵',
  'Assault infantry': '突击步兵',
  'Rapid columns': '快速纵队',
  'Field artillery': '野战炮兵',
  'Armoured assault groups': '装甲突击群',
  'Motorized raiders': '摩托化袭击队',
  'Anti-armour positions': '反装甲阵地',
  'Combined-arms forces': '合成部队',
  'Mobile strike groups': '机动打击群',
  'Air-defence networks': '防空网',
  'Unmanned breakthrough groups': '无人突破群',
  'Distributed swarms': '分布式蜂群',
  'Area-denial systems': '区域拒止系统',
};

/** belief key → [name, description]; slots below */
export const BELIEF = {
  grain_oath: ['谷誓', '圣域设有什一粮仓：在信众居住的地方，粮食储量增加，腐坏减缓。'],
  teaching_order: ['传教会', '圣域提供十六个教学名额。'],
  healers_order: ['疗愈会', '圣域可照护八百名居民。'],
  shared_days: ['共劳日', '信众更乐于响应公共劳作的征调。'],
  remembrance: ['追思礼', '信众的社群在艰难的年头更为安稳。'],
  watchfulness: ['长守', '信众更乐于承担防卫义务。'],
  open_courts: ['敞庭', '圣域兼作议事之所；纠纷了结得更快。'],
  copy_houses: ['抄经舍', '圣域抄录文本：每月提供少量记录载体。'],
  sky_terraces: ['观天台', '圣域坚持观测记录；测量方面的问题更早浮现。'],
  wayfarers: ['行脚师', '信仰向邻近地区传播得更快。'],
  hearth_rites: ['炉边礼', '信仰在定居社群内部传播得更快。'],
  caravan_rites: ['商旅礼', '信仰沿着贸易与条约往来传播。'],
};
export const BELIEF_SLOT = {
  'Founding obligation': '立教誓约',
  'Follower practice': '信众修持',
  'Worship facility': '礼拜场所',
  Propagation: '传播方式',
};

export const TRAIT = {
  'Outward-looking': ['外向', '长期乐于接纳外来者和陌生的做法。'],
  Questioning: ['好问', '公开检验成规，有错就报。'],
  Venturesome: ['敢闯', '人们乐于参加勘察、试验和前途未卜的远行。'],
  'Land-keeping': ['守土', '悉心照看田地、水源和时令的延续。'],
  'Workshop-oriented': ['重工', '精湛的手艺和可靠的产出受人敬重。'],
  Civic: ['乐群', '公共服务和稠密聚居得到广泛支持。'],
  Mercantile: ['重商', '贸易、议价和专业分工是寻常营生。'],
  Martial: ['尚武', '训练和共同防卫的义务被广泛接受。'],
};
export const TENDENCY = {
  Openness: '开放', Revisability: '可修正', Exploration: '探索', 'Agricultural stewardship': '农事经营',
  'Industrial workmanship': '工业技艺', 'Urban organization': '城市组织', 'Exchange orientation': '交换取向',
  'Martial obligation': '尚武义务',
};

/** generated religion names: "The {A} {B}" → A + 之 + B */
export const REL_A = {
  Ember: '余烬', Tide: '潮汐', Lantern: '灯火', Reed: '苇荡', Quiet: '静默', Bright: '明光', Ash: '灰烬',
  Hollow: '幽谷', Clear: '澄明', Grain: '谷穗', Stone: '磐石', Swift: '疾风', Winter: '凛冬', Open: '敞野',
};
export const REL_B = {
  Covenant: '之约', Path: '之路', Measure: '之度', Hearth: '之炉', Return: '归返', Watch: '守望',
  Fellowship: '同契', Chorus: '合颂', Circle: '之环', Accord: '之盟', Vigil: '守夜', Radiance: '之辉',
};

/** civilization names and adjectives (worldgen CIV_ROOTS) */
export const CIV = {
  Riverland: '河原', Riverlander: '河原', Clearbay: '澄湾', Greenreach: '青陲', Farcape: '远岬', Farcaper: '远岬',
  Highmere: '岚湖', Stonewold: '磐丘', Stonewolder: '磐丘', Amberfen: '珀泽', Longstrand: '长汀', Longstrander: '长汀',
};

// ---- enum labels (bts-protocol public_enum! and src/format.ts label maps) ----
export const GOOD = {
  Food: '粮食', 'Timber, stone and clay': '木石与黏土', Tools: '工具', 'Copper ore': '铜矿石', 'Iron ore': '铁矿石',
  Coal: '煤', 'Crude oil': '原油', 'Rare minerals': '稀有矿物', Copper: '铜', 'Structural metal': '结构金属',
  'Mechanical components': '机械部件', Conductors: '导体', 'Insulation and seals': '绝缘与密封件',
  'Refined fuel': '精炼燃料', Chemicals: '化学品', 'High-purity substrate': '高纯基材',
  'Electronic devices': '电子器件', 'Computing hardware': '计算硬件', 'Spare parts': '备件',
  'Record media': '记录载体', Instruments: '仪器', 'Medicine and bioproducts': '药品与生物制品',
};
export const GOOD_SHORT = {
  Materials: '建材', Crude: '原油', Minerals: '稀矿', Metal: '金属', Components: '部件', Insulation: '绝缘件',
  Fuel: '燃料', Substrate: '基材', Electronics: '电子器件', Hardware: '硬件', Spares: '备件', Media: '载体',
  Medicine: '药品',
};
export const QUAL = {
  Lorekeepers: '传承者', Artisans: '工匠', Agronomists: '农艺师', Talliers: '计数员', Smiths: '冶匠',
  Builders: '营造匠', Navigators: '领航员', 'Literate adults': '识字成人', Scribes: '书吏', Teachers: '教师',
  Scholars: '学者', Researchers: '研究员', Scientists: '科学家', Mechanics: '机械师', Technicians: '技术员',
  Electricians: '电工', Programmers: '程序员', Physicians: '医师', 'Model engineers': '模型工程师',
  'Orbital crews': '轨道乘组', 'Jump engineers': '跃迁工程师',
};
export const ENUMS = {
  // terrain
  Plains: '平原', Hills: '丘陵', Mountains: '山地', Forest: '森林', Wetland: '湿地', Steppe: '草原', Desert: '荒漠', Tundra: '苔原',
  // roles
  Assault: '突击', Maneuver: '机动', Denial: '拒止',
  // research classes
  'Craft inquiry': '工艺探究', 'Scholarly study': '学术研究', 'Experimental science': '实验科学',
  'Industrial research': '工业研究', 'Advanced research': '高级研究', 'Frontier science': '前沿科学',
  // knowledge states
  Hinted: '初现端倪', Discovered: '已发现', Investigating: '研究中', Understood: '已掌握', Prototyped: '已试制', Adopted: '已推广',
  // practice states
  Recognized: '已萌生', 'Reform under way': '改革中', Enacted: '已颁行', Established: '已确立',
  // labour categories
  Extraction: '采掘', Industry: '工业', 'Services and care': '服务与照护', 'Research and teaching': '研究与教学',
  'Construction and projects': '建设与项目',
  // phases
  'Contact selection': '选择交往对象', Negotiation: '谈判', Planning: '规划', 'Match finished': '对局结束',
  // seat status
  Active: '在局', Eliminated: '已出局', Forfeited: '已弃权',
  // controllers
  Human: '人类玩家', 'External agent': '外部智能体', 'Native AI (Easy)': '内置 AI（简单）',
  'Native AI (Medium)': '内置 AI（中等）', 'Native AI (Hard)': '内置 AI（困难）',
  // visibility
  Governed: '治下', Observed: '观察中', Remembered: '旧录',
  // settlements
  Wilderness: '荒野', Camp: '营地', Village: '村落', Town: '城镇', City: '城市', Metropolis: '大都会',
  // message intents
  Inquiry: '询问', Quotation: '报价', Counteroffer: '还价', Claim: '主张', Need: '需求', Warning: '警告',
  'Alliance proposal': '结盟提议',
  // epistemic labels
  Verified: '已核实', Reported: '据报', Estimated: '估计', Forecast: '预测', Unknown: '未知',
  // moment categories
  Settlement: '聚落', Subsistence: '生计', Knowledge: '知识', Culture: '文化', Religion: '宗教', Education: '教育',
  Diplomacy: '外交', War: '战争', Crisis: '危机', Governance: '治理', Space: '航天', Endgame: '终局',
  // venues
  'Teaching lodge': '传习所', School: '学校', College: '学院', 'Technical institute': '技术学院',
};
