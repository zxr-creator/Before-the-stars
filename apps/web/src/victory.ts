// The standard victory contract (ruleset 3.1), as the client names it: the six steps of
// the jump programme and the ways a match can be decided. The referee sends the steps'
// own labels and details (`VictoryView.steps`); the tables here name them where only a
// key is at hand (the observer's count of steps, the result screens, the setup screen).
import type { OutcomeKind } from './protocol';

export const PROGRAMME_STEPS = ['orbit', 'station', 'shipyard', 'assembly', 'first_jump', 'second_jump'] as const;
export type ProgrammeStep = (typeof PROGRAMME_STEPS)[number];

// i18n-table
export const STEP_LABEL: Record<ProgrammeStep, string> = {
  orbit: 'Reach orbit',
  station: 'A space station in low Earth orbit',
  shipyard: 'An orbital shipyard',
  assembly: 'A jump assembly',
  first_jump: 'First loaded jump round trip',
  second_jump: 'Second jump round trip',
};

/** How a match was decided, as a heading. */
export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  jump: 'The jump programme',
  supremacy: 'The last sovereign power',
  standing: 'The highest standing',
  classic: 'The classic contract',
  none: 'No winner',
};

/** How a match was decided, as a sentence about the winner. */
export const OUTCOME_HOW: Record<OutcomeKind, string> = {
  jump: 'Won by completing the jump programme first',
  supremacy: 'Won as the only sovereign power left',
  standing: 'Won with the highest standing at the last round',
  classic: 'Won under the classic contract: world governance and sustained jump capability',
  none: 'The match ended without a winner',
};
// i18n-end

const KINDS = new Set<string>(['jump', 'supremacy', 'standing', 'classic', 'none']);
export function outcomeKind(kind: string | null | undefined): OutcomeKind | null {
  return kind && KINDS.has(kind) ? (kind as OutcomeKind) : null;
}

/** An icon name for the way a match was decided. */
export function outcomeIcon(kind: OutcomeKind | null): string {
  return kind === 'jump' ? 'rocket' : kind === 'supremacy' ? 'crown' : kind === 'standing' ? 'star' : 'flag';
}
