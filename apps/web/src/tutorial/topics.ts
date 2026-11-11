// The Almanac's pages. Text is English source for t(); the Chinese lives in
// i18n/zh-Hans/ui-tutorial.json. Everything here is general rule knowledge a
// new player is told anyway: no page describes hidden content of a match.
import type { OverlayKey, PanelKey } from '../store';

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'defs'; items: [string, string][] }
  | { kind: 'note'; text: string }
  | { kind: 'keys'; items: [string[], string][] }
  | { kind: 'goods' }
  | { kind: 'states' }
  | { kind: 'seats' }
  | { kind: 'objective' }
  /** The seat's disclosed cards, each a link to its details and encyclopedia entry. */
  | { kind: 'encyclopedia'; tree: 'tech' | 'civics' };

export interface TopicAction { label: string; panel?: PanelKey; overlay?: OverlayKey }

export interface Topic {
  key: string;
  group: 'Basics' | 'Systems' | 'Reading the game' | 'Reference';
  icon: string;
  title: string;
  lede: string;
  /** Chronicle vignette used as the page illustration ("key:n"). */
  art?: string;
  blocks: Block[];
  actions?: TopicAction[];
  see?: string[];
}

const p = (text: string): Block => ({ kind: 'p', text });
const h = (text: string): Block => ({ kind: 'h', text });
const list = (...items: string[]): Block => ({ kind: 'list', items });
const steps = (...items: string[]): Block => ({ kind: 'steps', items });
const note = (text: string): Block => ({ kind: 'note', text });

export const GLOSSARY: [string, string][] = [
  ['Adoption', 'The share of your people who actually live by an enacted practice. It grows gradually.'],
  ['Blocker', 'The named reason a facility, project or programme is below full pace: staff, inputs, power, upkeep, storage or a missing requirement.'],
  ['Briefing', 'The round’s report: what changed and what needs a decision, with the receipts for your orders.'],
  ['Callable labour', 'The share of labour left after food work that custom lets the government direct to public projects.'],
  ['Capability', 'Understanding put to work: built, staffed and operating. The last state of a technology card.'],
  ['Chronicle', 'The illustrated timeline of what your civilization actually experienced. It grants nothing.'],
  ['Counterpart', 'Another civilization you chose to talk to this round. A channel opens only if it chose you too.'],
  ['Envelope', 'One message or proposal to one counterpart. One per counterpart in each window, ten per pair in a round.'],
  ['Estimate', 'A number inferred from partial evidence, shown in italics with ≈. It is not a promise.'],
  ['Facility', 'A place of work with levels, staff and recipes: fields, a workshop, a school, a mine.'],
  ['Faction', 'A group inside your society with weight, support and a demand of its own.'],
  ['Formation', 'A body of soldiers of one equipment tier, with a region, an order, supply and morale.'],
  ['Lead', 'A clue reported from practice or contact. A small study turns it into a question.'],
  ['Lineage', 'A people within your population, with tendencies that drift slowly with how they live.'],
  ['Moment', 'One entry of the chronicle. Major moments are announced across the map when they happen.'],
  ['Negotiation window', 'One of five simultaneous exchanges of envelopes between contact selection and planning.'],
  ['Practice', 'A way your people organize themselves. Recognized, then enacted by reform, then adopted.'],
  ['Programme', 'A running course in one region: learners, teachers, places and materials over real months.'],
  ['Qualification', 'What a person is trained to do. Many posts, courses and investigations need particular qualifications.'],
  ['Question', 'A technology card your people know how to investigate but do not yet understand.'],
  ['Receipt', 'The referee’s answer to one order: accepted, rejected with a reason, or applied later.'],
  ['Recipe', 'What a facility turns into what, each month, and what it needs to do so.'],
  ['Referee', 'The rules engine. It checks every order and resolves the months and years of each round.'],
  ['Reform', 'The project that enacts a recognized practice once its real requirements exist.'],
  ['Reported', 'A claim received from someone else. It may be false, and is marked as unverified.'],
  ['Research capacity', 'Researcher-months a month that staffed research posts can put into investigations. Unused capacity is lost.'],
  ['Round', 'A span of history, fifty years in antiquity down to two in the modern age: contact selection, five negotiation windows, planning, then resolution.'],
  ['Seat', 'One of the two to ten civilizations of a match, played by a person, a built-in AI or an LLM agent.'],
  ['Standing order', 'An instruction the referee carries out on its own, year by year inside a long round: build to a target, research or reform in a set order, keep research busy, or send settlers when a region is crowded.'],
  ['Stability', 'How far people accept being governed, from 0 to 100.'],
  ['Steward', 'A built-in helper that runs whole domains of your seat with only what your seat can see.'],
  ['Survey', 'A supplied party that records a region’s land, water and deposits.'],
  ['Treaty', 'A signed set of structured clauses. Only a treaty binds, and its performance is recorded.'],
  ['Understanding', 'Reproducible knowledge of a technology, reached by funded investigation.'],
  ['Verified', 'Established by your own records.'],
];

export const TOPICS: Topic[] = [
  {
    key: 'government', group: 'Basics', icon: 'politics', art: 'civic:2',
    title: 'What you are',
    lede: 'You are a government managing what a society commits to, not a hand that moves every person.',
    blocks: [
      p('You direct public projects, teaching programmes, standing policies, negotiations and armies. Families, workshops, villages and faiths have lives, property and choices of their own.'),
      p('An order produces a result only when the real teachers, ore, workplaces, transport and willing people exist. The game never invents them to match a number.'),
      h('The question to ask each round'),
      list(
        'What is holding the next step back?',
        'If I remove that, what is the next, costlier constraint?',
        'What takes years to prepare and should start now?',
      ),
      note('You may give as many orders as you like. What limits you is labour, stores and qualified people, not an action count.'),
    ],
    see: ['round', 'food', 'blocked'],
  },
  {
    key: 'round', group: 'Basics', icon: 'hourglass', art: 'measure:1',
    title: 'The round and its phases',
    lede: 'Each round is twelve simulated months for everybody; the top bar shows the date it has reached. You read, optionally negotiate, plan, and end the round.',
    blocks: [
      steps(
        'Contact selection. Privately pick up to three counterparts. A channel opens only where the choice is mutual.',
        'Negotiation. Five simultaneous windows; one envelope per counterpart in each window and ten per pair in a round.',
        'Planning. Projects, programmes, policies and orders. Planning never advances time.',
        'Resolution. Twelve monthly steps of deliveries, labour, production, projects, teaching, food and water, births and deaths, conflict, discovery and culture.',
      ),
      p('The ring around the end-of-round control shows the phase. “End round” passes every remaining phase at once; you are never required to negotiate.'),
      p('Standing arrangements continue by themselves. You do not re-order food, upkeep or teaching every year.'),
      note('In hot seat, each person finishes a phase separately and the device is handed over.'),
    ],
    actions: [{ label: 'Open the briefing', panel: 'briefing' }],
    see: ['diplomacy', 'government', 'keys'],
  },
  {
    key: 'food', group: 'Systems', icon: 'grain', art: 'fields:3',
    title: 'Food and labour',
    lede: 'People eat first. Whatever labour is left is divided between public projects and facilities.',
    blocks: [
      p('Every month people take food and water before anything else is served. Shortage costs lives and stability, and hungry regions lose people.'),
      h('Who works where'),
      list(
        'Food work comes first: fields, pasture, fishing and gathering.',
        'Of the labour left over, custom lets you call up only a share for public projects. Institutions raise that share.',
        'The rest staffs facilities in the order of your labour-category weights.',
        'One person works one job. Students do not work, and soldiers are out of the workforce.',
      ),
      p('The reserve policy says how many months of food are kept back before projects and trade may draw on the store.'),
      note('The top bar shows food with the months it will last. Under two months is an emergency.'),
    ],
    actions: [{ label: 'Open the economy', panel: 'economy' }],
    see: ['facilities', 'people', 'goods'],
  },
  {
    key: 'facilities', group: 'Systems', icon: 'hammer', art: 'workshop:2',
    title: 'Facilities and blockers',
    lede: 'Facilities turn labour and inputs into goods, services, teaching places and research. Each one reports what holds it back.',
    blocks: [
      p('A facility has levels, posts to staff and one or more production methods. One level is an establishment employing thousands of people: a level of fields is worked by 10,000 cultivators, a level of workshops by 4,000 workers and 2,000 artisans. Inputs are read from the store at the start of a month and outputs arrive the next month.'),
      h('What bounds output'),
      list(
        'Staff, and staff with the qualification a post requires.',
        'Inputs in store, power and upkeep.',
        'Room in the store for what is produced.',
        'The site: arable land, a deposit, a river, a coast.',
      ),
      p('Open a region to see its facilities. A facility below full output names its blocker; fix that before building more.'),
      note('A locked facility lists the requirements you know of. Further requirements may not have been identified yet.'),
    ],
    actions: [{ label: 'Open projects', panel: 'projects' }, { label: 'Open the economy', panel: 'economy' }],
    see: ['blocked', 'goods', 'food'],
  },
  {
    key: 'goods', group: 'Systems', icon: 'box', art: 'granary:4',
    title: 'Goods',
    lede: 'Twenty-two goods, from food to instruments. Each is something real that is produced, stored, consumed and traded.',
    blocks: [
      { kind: 'goods' },
      p('Every good is counted in a real unit. The economy panel shows, for every good, what was produced, consumed, lost and traded last round and how much the store can hold.'),
      list(
        'Food in rations: one person’s food for a month, 50 kg of grain-equivalent. Everyone eats one ration a month, so a people of 240,000 eats 240k rations.',
        'Bulk goods in tonnes, shown as kt (thousand tonnes) or Mt: timber and stone, ores, coal, metals, fuel, chemicals.',
        'Manufactures in standard lots: a set of tools for one worker-year (0.25 t), a device lot, a computing rack, a maintenance kit.',
        'Construction in worker-months: one called-up labourer for a month. Research in researcher-months.',
        'Shaft and electric power in MWh delivered within the month; it cannot be stored.',
      ),
      note('Later goods appear in the top bar once your civilization actually has them.'),
    ],
    actions: [{ label: 'Open the economy', panel: 'economy' }, { label: 'Open the economy ledger', overlay: 'ledger' }],
    see: ['facilities', 'food'],
  },
  {
    key: 'people', group: 'Systems', icon: 'graduate', art: 'school:1',
    title: 'People and teaching',
    lede: 'Skills belong to people. Courses turn real learners into qualified people over real months.',
    blocks: [
      p('Your population has children, people of working age and elders, living in regions and belonging to lineages. Only people of working age can work, study, teach or serve.'),
      h('A teaching programme needs'),
      list(
        'A venue with free places: a lodge, a school, a college or an institute.',
        'Learners who meet the course’s entry qualification.',
        'Teachers with the right qualification, and teaching materials.',
        'Time. Students do not work while they study.',
      ),
      p('Where no instructor exists yet, a first cohort can teach itself slowly. Announcing a course does not create graduates: plan years ahead.'),
    ],
    actions: [{ label: 'Open people and education', panel: 'people' }],
    see: ['knowledge', 'facilities'],
  },
  {
    key: 'knowledge', group: 'Systems', icon: 'knowledge', art: 'lab:3',
    title: 'Knowledge: from lead to capability',
    lede: 'Your people discover technology by running into it. You see only what they have found.',
    blocks: [
      steps(
        'Lead. Practice and contact produce clues: a problem current methods do not explain.',
        'Question. A small study turns a lead into a card that can be investigated.',
        'Understanding. Funded investigation by qualified people makes the knowledge reproducible.',
        'Capability. Building, teaching and operating what it enables puts it to ordinary use.',
      ),
      { kind: 'states' },
      p('Research capacity is work per month from qualified people in a makers’ circle or an institute. It is not a currency: what you do not use is lost.'),
      p('The technology tree lays out only the cards you have disclosed and the links you have learned. There are no placeholders for what is still unknown, and no totals.'),
      note('“Extrapolated” and “fictional” badges mark cards that go beyond established science.'),
      { kind: 'encyclopedia', tree: 'tech' },
    ],
    actions: [{ label: 'Open the technology tree', overlay: 'tech' }, { label: 'Open knowledge', panel: 'knowledge' }],
    see: ['card', 'people', 'culture'],
  },
  {
    key: 'culture', group: 'Systems', icon: 'civics', art: 'assembly_hall:2',
    title: 'Practices and reforms',
    lede: 'Practices are how your people organize: customs, institutions, laws. They cannot be bought, only grown.',
    blocks: [
      steps(
        'Recognized. People notice a practice by living with what it builds on.',
        'Reform under way. Once its real requirements exist, you may propose a reform, which is a project.',
        'Enacted. The practice is permitted and supported.',
        'Established. Enough people live by it; adoption grows gradually from there.',
      ),
      p('Lineages have tendencies that drift slowly with how people actually live. A religion may emerge, or not; a secular path is fully viable.'),
      p('The civics tree shows practices by group, with their requirement checklists and what each enables.'),
      { kind: 'encyclopedia', tree: 'civics' },
    ],
    actions: [{ label: 'Open the civics tree', overlay: 'civics' }, { label: 'Open culture', panel: 'culture' }],
    see: ['knowledge', 'politics'],
  },
  {
    key: 'expansion', group: 'Systems', icon: 'tent', art: 'camp:2',
    title: 'Surveying and settling',
    lede: 'Land is unknown until someone has walked it and written it down.',
    blocks: [
      steps(
        'Survey. A supplied party records a neighbouring region: arable land, pasture, water, forest and deposits.',
        'Settle. A settling party from a region next to it founds a camp there.',
        'Grow. The new region needs food, water, facilities and administration of its own.',
      ),
      p('Regions you govern are drawn in your colour. Observed regions are current; remembered ones show what you last saw, with the date.'),
      note('More regions raise the administrative load. Past your capacity, stability suffers.'),
    ],
    actions: [{ label: 'Open projects', panel: 'projects' }],
    see: ['map', 'politics'],
  },
  {
    key: 'diplomacy', group: 'Systems', icon: 'diplomacy', art: 'treaty:1',
    title: 'Diplomacy and its limits',
    lede: 'You can talk to few, say little each window, and bind yourself only in writing.',
    blocks: [
      list(
        'Up to three counterparts per round, and a channel opens only if both sides chose each other.',
        'Five windows. One envelope per counterpart in each window; ten per pair in a round, counting proposals and signatures.',
        'A message is a claim. It may be false, and it is filed as reported, not verified.',
        'Only a signed, structured treaty binds: goods, teaching, maps, non-aggression, defensive pacts, peace, subordination, cession.',
        'Performance of every treaty is recorded, and so is repudiation.',
      ),
      p('What you know about others is a range or a report: population, strength and intentions are estimates until your own people verify them.'),
    ],
    actions: [{ label: 'Open diplomacy', panel: 'diplomacy' }],
    see: ['round', 'military', 'card'],
  },
  {
    key: 'military', group: 'Systems', icon: 'military', art: 'war:0',
    title: 'Armies and war',
    lede: 'An army is people, equipment, training, supply and morale. There are no dice.',
    blocks: [
      list(
        'Recruits leave the workforce. Only as many will serve as would agree to.',
        'Three roles per equipment tier counter one another: assault, maneuver and denial.',
        'Strength comes from numbers, tier, proficiency, supply and morale together.',
        'Capturing a region takes five months of control, and sovereignty six more.',
        'Occupied people do not become loyal workers.',
      ),
      p('Orders are given per formation: hold, move, attack, merge or disband. Foreign formations appear as estimates with the month they were last seen.'),
    ],
    actions: [{ label: 'Open military', panel: 'military' }],
    see: ['diplomacy', 'politics'],
  },
  {
    key: 'politics', group: 'Systems', icon: 'balance', art: 'civic:5',
    title: 'Stability and factions',
    lede: 'Being obeyed is not automatic. Stability measures how far people accept being governed.',
    blocks: [
      p('Hunger, thirst, unmet demands, overstretched administration and occupation wear stability down. Food, order and kept promises restore it.'),
      p('Factions carry weight in your society and each asks for something. Their support makes plans easier or harder.'),
      p('Administrative capacity limits how much territory and activity you can run well.'),
    ],
    actions: [{ label: 'Open politics', panel: 'politics' }],
    see: ['stewards', 'culture', 'food'],
  },
  {
    key: 'stewards', group: 'Systems', icon: 'people', art: 'town:3',
    title: 'Stewards',
    lede: 'Hand whole domains to a steward if you would rather not run everything yourself.',
    blocks: [
      p('A steward can run economy, research, education, culture, expansion or military. It is the same policy the built-in opponents use, limited to those domains and to what your own seat can see.'),
      list(
        'It acts once a round, at the end of planning.',
        'Its orders appear among your receipts.',
        'You can take a domain back at any time.',
        'Diplomacy always stays with you.',
      ),
    ],
    actions: [{ label: 'Open politics', panel: 'politics' }],
    see: ['politics', 'observer'],
  },
  {
    key: 'chronicle', group: 'Systems', icon: 'chronicle', art: 'road:4',
    title: 'The chronicle',
    lede: 'An illustrated timeline of what your civilization actually lived through.',
    blocks: [
      p('Each moment has a year, a category, a short account and the evidence behind it. Major moments are announced by a banner across the map.'),
      p('The chronicle records only what your own people could know. A reported moment is a claim, drawn with a dashed frame.'),
      note('Chronicle cards grant nothing. They are a record, and can be exported from the menu.'),
    ],
    actions: [{ label: 'Open the chronicle', panel: 'chronicle' }],
    see: ['card', 'objective'],
  },
  {
    key: 'objective', group: 'Systems', icon: 'objectives', art: 'measure:5',
    title: 'The final objective',
    lede: 'One seat at most can win. What winning takes is something your civilization has to find out.',
    blocks: [
      p('With the objective set to discovery, the final objective is revealed only when your civilization discovers it. With a disclosed objective, every seat knows the victory contract from the first year.'),
      p('Until then, the Objectives panel shows your own agendas and the milestones you have reached.'),
      p('When it is revealed, you are given the exact tests and counters, not a riddle. Reaching the end of the match with no winner is a valid outcome.'),
      { kind: 'objective' },
    ],
    actions: [{ label: 'Open objectives', panel: 'objectives' }],
    see: ['chronicle', 'government'],
  },
  {
    key: 'map', group: 'Reading the game', icon: 'pin', art: 'road:1',
    title: 'Reading the map',
    lede: 'The map shows what your civilization knows, and how well it knows it.',
    blocks: [
      list(
        'Governed regions are filled with your colour; your capital carries a star.',
        'Observed regions are current. Remembered regions show what you last saw.',
        'Beyond the edge of knowledge the paper is blank. Nothing is hidden under it.',
        'Map modes switch between who governs, terrain, resources and population.',
        'Click a region for its inspector; drag to pan, scroll to zoom, F to fit.',
      ),
      p('Markers on a region show its settlement, facilities and any formations there. Foreign formations are estimates with the month they were seen.'),
    ],
    see: ['expansion', 'card'],
  },
  {
    key: 'card', group: 'Reading the game', icon: 'scroll', art: 'craft:2',
    title: 'Reading a card',
    lede: 'Every number has a source. The interface tells you whether it is a fact, a report or a guess.',
    blocks: [
      { kind: 'defs', items: [
        ['Verified', 'Established by your own records. Shown plainly.'],
        ['Reported', 'A claim from someone else, not verified. Dashed and marked.'],
        ['≈ Estimated', 'Inferred from partial evidence. Italic, often a range.'],
        ['Forecast', 'An expectation about the future, not an observation.'],
        ['Unknown', 'No evidence. Missing evidence stays missing.'],
      ] },
      h('On a technology or practice card'),
      list(
        'State: how far it has come, from discovered to adopted, or recognized to established.',
        'Requirements: a checklist of the ones you know. A question mark means more may exist.',
        'Work remaining, and an estimate of rounds at present capacity. It is an estimate.',
        'Enables: what it would let you build, teach or enact.',
      ),
      note('A disabled button always says why, beside it or on hover.'),
    ],
    see: ['knowledge', 'blocked'],
  },
  {
    key: 'blocked', group: 'Reading the game', icon: 'lock', art: 'mine:2',
    title: 'Why is this blocked?',
    lede: 'Nothing fails silently. Look for the reason in one of these places.',
    blocks: [
      list(
        'A disabled button: the reason is written beside it, and in its tooltip.',
        'A rejected order: a red notice appears, and the receipt in the briefing keeps the reason.',
        'A slow project: its card lists blockers, such as missing inputs or no callable labour.',
        'A facility below full output: the region inspector names what it is short of.',
        'A programme not teaching: no free places, no teachers, or no materials.',
        'A locked facility, course or unit: its known requirements are listed with ticks and crosses.',
      ),
      h('The usual causes'),
      list(
        'Food reserve: projects may not draw the store below your reserve.',
        'Labour: everyone callable is already on other projects.',
        'Qualified people: the post needs a qualification nobody free holds.',
        'Phase: messages and proposals are sent only during negotiation windows.',
        'Knowledge or practice: a requirement is not yet understood or enacted.',
      ),
    ],
    actions: [{ label: 'Open the briefing', panel: 'briefing' }, { label: 'Open projects', panel: 'projects' }],
    see: ['facilities', 'card', 'food'],
  },
  {
    key: 'observer', group: 'Reading the game', icon: 'eye', art: 'contact:3',
    title: 'Observer mode and AI agents',
    lede: 'Any seat can be played by a person, a built-in AI or a language model. With no human seat, you watch.',
    blocks: [
      { kind: 'seats' },
      h('LLM agents'),
      list(
        'An agent reads the same observation a player sees and writes its orders. It has no hidden information.',
        '“Consult every N rounds” sets how often the model is asked. In between, a built-in steward keeps its civilization running.',
        'An API key typed at setup stays in the local game server’s memory only.',
        'If an agent fails, its error is shown; a steward carries on in its place.',
      ),
      h('The observer console'),
      list(
        'The whole world map, with the true owner of every region.',
        'A scoreboard for every civilization, and the feed of world events.',
        'Playback: step one round, play at a chosen speed, or run ten rounds.',
        'An agent panel with each LLM seat’s notes, actions and errors.',
        '“View as” shows one civilization’s own interface, read-only: every order control says “You are observing”.',
      ),
    ],
    see: ['stewards', 'round'],
  },
  {
    key: 'keys', group: 'Reference', icon: 'key',
    title: 'Keys',
    lede: 'Everything can be reached with the mouse. These keys are shortcuts.',
    blocks: [
      { kind: 'keys', items: [
        [['1', '–', '9', '0'], 'Open a panel, in rail order'],
        [['T'], 'Technology tree'],
        [['C'], 'Civics tree'],
        [['L'], 'Economy ledger'],
        [['H'], 'Chronicle'],
        [['?'], 'Almanac'],
        [['Esc'], 'Close the top-most sheet, cancel a map pick, clear the selection'],
        [['F'], 'Fit the known world on the map'],
        [['+', '−'], 'Zoom the map'],
      ] },
      note('Keys do nothing while you are typing in a field.'),
    ],
    see: ['map', 'round'],
  },
  {
    key: 'glossary', group: 'Reference', icon: 'almanac',
    title: 'Glossary',
    lede: 'The words the game uses, in one place.',
    blocks: [{ kind: 'defs', items: GLOSSARY }],
  },
];

export const TOPIC_GROUPS: Topic['group'][] = ['Basics', 'Systems', 'Reading the game', 'Reference'];

/** Seat kinds shown on the observer page. */
export const SEAT_KINDS: { icon: string; name: string; text: string }[] = [
  { icon: 'people', name: 'Human', text: 'Played on this device. Several people share it in hot seat.' },
  { icon: 'military', name: 'Built-in AI: Easy, Medium, Hard', text: 'Fast, deterministic opponents that need no network.' },
  { icon: 'agent', name: 'Claude (API)', text: 'Calls the Anthropic API with a key.' },
  { icon: 'agent', name: 'Claude Code (subscription)', text: 'Uses the Claude Code CLI signed in on this machine.' },
  { icon: 'agent', name: 'Codex (CLI)', text: 'Uses the Codex CLI signed in on this machine.' },
  { icon: 'agent', name: 'OpenAI-compatible API', text: 'Any server that speaks the OpenAI chat API.' },
];

/** The plain text of a block, for search. */
export function blockStrings(b: Block): string[] {
  switch (b.kind) {
    case 'p': case 'h': case 'note': return [b.text];
    case 'list': case 'steps': return b.items;
    case 'defs': return b.items.flatMap(([a, c]) => [a, c]);
    case 'keys': return b.items.map(([, label]) => label);
    case 'seats': return SEAT_KINDS.flatMap((k) => [k.name, k.text]);
    default: return [];
  }
}

/** Every English string of the almanac's pages (for dictionary coverage checks). */
export function topicStrings(): string[] {
  const out: string[] = [...TOPIC_GROUPS];
  for (const topic of TOPICS) {
    out.push(topic.title, topic.lede);
    for (const b of topic.blocks) out.push(...blockStrings(b));
    for (const a of topic.actions ?? []) out.push(a.label);
  }
  return out;
}
