// The guided tour, step by step. Text is English source for t(); the Chinese
// lives in i18n/zh-Hans/ui-tutorial.json. A step either explains something
// ("info": the rest of the screen is dimmed, nothing is blocked) or waits for
// the player to do the thing ("do": only a ring marks the place).
import type { AppState, PanelKey } from '../store';

export interface Baseline {
  /** Project ids that existed when the step began. */
  projects: number[];
  leads: number;
  round: number;
  /** The step's goal was already met when it began. */
  satisfied: boolean;
}

export type Side = 'right' | 'left' | 'top' | 'bottom' | 'inside';

export interface Step {
  key: string;
  icon: string;
  title: string;
  body: string[];
  /** For "do" steps: the instruction line. */
  hint?: string;
  mode: 'info' | 'do';
  /** CSS selectors tried in order; the first one on screen is the anchor. */
  anchors?: string[];
  /** Anchor on the player's capital on the map (falls back to no anchor). */
  capital?: boolean;
  side?: Side;
  /** Panel to open when the step begins. */
  panel?: PanelKey;
  /** Overlay the step needs open. */
  overlay?: 'tech';
  done?: (s: AppState, base: Baseline) => boolean;
}

const tid = (id: string) => `[data-testid="${id}"]`;
const newProject = (s: AppState, base: Baseline) => !!s.obs && s.obs.projects.some((p) => !base.projects.includes(p.id));

export const STEPS: Step[] = [
  {
    key: 'welcome', icon: 'compass', mode: 'info',
    title: 'You are a government, not a god',
    body: [
      'You direct what your society commits to: public projects, teaching, standing policies, treaties and armies. Families, workshops and villages go on living their own lives.',
      'Nothing happens because a number says so. A plan works only when real people, tools, food and time are there to carry it out.',
      'This tour takes a few minutes. You can leave it at any step and restart it from the menu.',
    ],
  },
  {
    key: 'yields', icon: 'grain', mode: 'info', anchors: ['[data-tut="yields"]'], side: 'bottom',
    title: 'What your people have',
    body: [
      'The ribbon shows the stores and capacities your own records can verify: food and how long it will last, materials and tools, then population, stability, research in use and callable labour.',
      'Hover any of them to see what was produced, consumed and traded last round, and what is at risk.',
      'Food comes first. People eat before any plan is served.',
    ],
  },
  {
    key: 'dock', icon: 'hourglass', mode: 'info', anchors: ['[data-tut="dock"]'], side: 'left',
    title: 'A round is years of lived time',
    body: [
      'Every round runs the same way for every civilization: contact selection, five negotiation windows, then planning. The referee then resolves the whole round at once — fifty years in antiquity, shortening to two in the modern age; the dock shows the years the round covers. Standing orders act year by year inside it.',
      'The ring shows where you are. “End round” passes every remaining phase; you are never required to negotiate.',
      'The number on the orb counts things worth a look before you end the round.',
    ],
  },
  {
    key: 'notify', icon: 'bell', mode: 'info', anchors: ['[data-tut="notifications"]', tid('rail-briefing')], side: 'left',
    title: 'What changed this round',
    body: [
      'Each medallion is one development from the round briefing. Red is urgent, amber needs a decision, green is good news.',
      'Click one to go to the place where it matters.',
    ],
  },
  {
    key: 'briefing', icon: 'briefing', mode: 'do', anchors: [tid('panel-briefing'), tid('rail-briefing')], side: 'right',
    title: 'Open the briefing',
    body: ['The briefing answers two questions: what changed, and what needs a decision.'],
    hint: 'Open the Briefing panel from the rail (key 1).',
    done: (s) => s.panel === 'briefing',
  },
  {
    key: 'capital', icon: 'pin', mode: 'do', capital: true, side: 'right',
    title: 'Find your capital',
    body: ['The map is your atlas. Regions you govern are drawn in your colour; everything else is only as well known as your surveys.'],
    hint: 'Click your capital on the map.',
    done: (s) => !!s.obs && s.selectedRegion === s.obs.civ.capital,
  },
  {
    key: 'inspector', icon: 'house', mode: 'info', anchors: [tid('inspector')], side: 'left',
    title: 'A region up close',
    body: [
      'The inspector lists who lives here, what the land offers, and every facility.',
      'A facility below full output says exactly what holds it back: staff, qualified staff, inputs, power, upkeep or storage. Fix the blocker it names; building more of the same rarely helps.',
    ],
  },
  {
    key: 'projects', icon: 'projects', mode: 'do', anchors: [tid('panel-projects'), tid('rail-projects')], side: 'right',
    title: 'Projects are how you change things',
    body: ['Building, surveying, settling, research and recruiting are all projects. They draw on callable labour and stores month by month.'],
    hint: 'Open the Projects panel (key 3).',
    done: (s) => s.panel === 'projects',
  },
  {
    key: 'order', icon: 'hammer', mode: 'do', anchors: [tid('build-submit'), tid('new-project'), tid('panel-projects'), tid('rail-projects')], side: 'right', panel: 'projects',
    title: 'Give your first order',
    body: [
      'Start with food or with knowledge of the land: a level of fields or a fishery, or a survey party to a neighbouring region.',
      'An order the referee cannot accept is never silently dropped: it tells you why.',
    ],
    hint: 'Press “New project”, choose what to build or where to survey, and confirm. Any accepted project completes this step.',
    done: newProject,
  },
  {
    key: 'labour', icon: 'labour', mode: 'info', anchors: [tid('yield-labour'), '[data-tut="yields"]'], side: 'bottom',
    title: 'Callable labour',
    body: [
      'After food work, custom lets you call up only a share of the remaining labour for public projects. The rest staffs facilities, in the order of your category weights.',
      'One person works one job. Students and soldiers do neither.',
    ],
  },
  {
    key: 'people', icon: 'graduate', mode: 'info', anchors: [tid('rail-people')], side: 'right',
    title: 'People and teaching',
    body: [
      'Qualified people run workshops, teach and investigate. Courses turn real learners into qualified people over real months, and need teachers, places and materials.',
      'Open a teaching programme once a lodge or school stands. A first cohort can teach itself, slowly.',
    ],
  },
  {
    key: 'endround', icon: 'hourglass', mode: 'do', anchors: [tid('end-round'), '[data-tut="dock"]'], side: 'left',
    title: 'End the round',
    body: ['Orders are settled when planning ends. Then twelve monthly steps run: deliveries, work, production, teaching, food and water, births and deaths, discovery.'],
    hint: 'Press the orb to end the round.',
    done: (s, base) => !!s.obs && s.obs.round > base.round,
  },
  {
    key: 'after', icon: 'briefing', mode: 'info', anchors: [tid('panel-briefing')], side: 'right', panel: 'briefing',
    title: 'Read what happened',
    body: [
      'A round has passed. Developments are listed by importance; the receipts below show what became of each order you gave.',
      'Reading this first, every round, is the habit that matters most.',
    ],
  },
  {
    key: 'lead', icon: 'knowledge', mode: 'do', anchors: [tid('follow-up'), tid('investigate'), tid('toggle-study'), tid('panel-knowledge'), tid('rail-knowledge')], side: 'right',
    title: 'Follow a lead',
    body: [
      'Practice and contact produce leads. A small study turns a lead into a question; funded investigation by qualified people turns a question into understanding; building and operating turns understanding into capability.',
    ],
    hint: 'Open Knowledge (key 5) and follow up a lead, investigate a question, or fund an exploratory study. If nothing is on offer yet, press Next: leads come with practice.',
    done: (s, base) => newProject(s, base) || (!!s.obs && s.obs.knowledge.leads.length < base.leads),
  },
  {
    key: 'tree', icon: 'techtree', mode: 'do', anchors: [tid('rail-techtree')], side: 'right',
    title: 'Open the technology tree',
    body: ['The tree draws what your people have discovered and how those cards connect.'],
    hint: 'Press T, or use Tech on the rail.',
    done: (s) => s.overlay === 'tech',
  },
  {
    key: 'treeinfo', icon: 'techtree', mode: 'info', anchors: [tid('overlay-tech')], side: 'inside', overlay: 'tech',
    title: 'Only what you know is drawn',
    body: [
      'There are no greyed-out future technologies and no totals. New cards appear as your people run into them.',
      'Each card shows its state, the work left, and an estimate of the rounds it needs at your present research capacity.',
    ],
  },
  {
    key: 'civics', icon: 'civics', mode: 'info', anchors: [tid('rail-civics')], side: 'right',
    title: 'Practices and reforms',
    body: [
      'Practices are how your people organize themselves. They are recognized by living with what they build on, enacted by reform once their real requirements exist, and then adopted gradually.',
      'The civics tree (C) shows them the same way as technologies.',
    ],
  },
  {
    key: 'expand', icon: 'tent', mode: 'info', anchors: [tid('rail-projects')], side: 'right',
    title: 'Surveying and settling',
    body: [
      'A supplied survey party records a neighbouring region: its land, water and deposits. A settling party can then found a camp there.',
      'A new region needs food, water and administration of its own.',
    ],
  },
  {
    key: 'diplomacy', icon: 'diplomacy', mode: 'info', anchors: [tid('rail-diplomacy')], side: 'right',
    title: 'Diplomacy has limits',
    body: [
      'Each round you may choose up to three counterparts, and a channel opens only where the choice is mutual. There are five windows: one envelope per counterpart in each, ten per pair in a round.',
      'Messages are claims and may be false. Only a signed, structured treaty binds, and its performance is recorded.',
    ],
  },
  {
    key: 'military', icon: 'military', mode: 'info', anchors: [tid('rail-military')], side: 'right',
    title: 'Armies, briefly',
    body: [
      'Soldiers are people taken out of work. A formation needs equipment, training, supply and morale; three roles counter one another, and there are no dice.',
      'Capturing a region takes months of control, and occupied people do not become loyal workers.',
    ],
  },
  {
    key: 'chronicle', icon: 'chronicle', mode: 'do', anchors: [tid('panel-chronicle'), tid('chronicle-tab'), tid('rail-chronicle')], side: 'top',
    title: 'Open the chronicle',
    body: ['The chronicle records what your civilization actually lived through, as an illustrated timeline with its evidence. Its cards grant nothing.'],
    hint: 'Open the chronicle from the tab at the bottom of the map (key H).',
    done: (s) => s.panel === 'chronicle',
  },
  {
    key: 'stewards', icon: 'politics', mode: 'info', anchors: [tid('rail-politics')], side: 'right',
    title: 'Stewards can help',
    body: [
      'If you would rather not run everything, hand economy, research, education, culture, expansion or military to a steward in the Politics panel. It acts once a round with only what your seat can see, and you can take a domain back at any time.',
      'Diplomacy always stays with you.',
    ],
  },
  {
    key: 'objective', icon: 'objectives', mode: 'info', anchors: [tid('rail-objectives')], side: 'right',
    title: 'The final objective',
    body: [
      'Unless you chose a disclosed objective at setup, the final objective is revealed only when your civilization discovers it. Until then the Objectives panel shows your own agendas and milestones.',
      'When it is revealed you are given the exact tests, not a riddle to guess.',
    ],
  },
  {
    key: 'finish', icon: 'star', mode: 'info',
    title: 'The atlas is yours',
    body: [
      'That is the whole loop: read the briefing, decide what holds you back next, give a few orders, end the round.',
      'The Almanac (key ?) keeps every topic from this tour, with a glossary.',
    ],
  },
];

/** Every English string of the tour (for dictionary coverage checks). */
export function stepStrings(): string[] {
  const out: string[] = [];
  for (const s of STEPS) {
    out.push(s.title, ...s.body);
    if (s.hint) out.push(s.hint);
  }
  return out;
}
