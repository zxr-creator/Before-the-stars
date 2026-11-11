// Interface sounds, synthesized: short, soft and pitched in the same world as the score.
import type { Synth } from './instruments';

export type SfxKind = 'round' | 'accept' | 'reject' | 'notify';

/** Play one interface sound into `out` at time `t`. */
export function playSfx(synth: Synth, kind: SfxKind, t: number, out: AudioNode): void {
  switch (kind) {
    case 'round':
      // a falling fifth on a soft bell, like a distant clock: the round is done
      synth.play('bell', 79, 0.38, t, 1, out);
      synth.play('bell', 72, 0.34, t + 0.16, 1.5, out);
      break;
    case 'accept':
      // a rising major third, plucked
      synth.play('harp', 72, 0.55, t, 0.4, out);
      synth.play('harp', 76, 0.6, t + 0.07, 0.6, out);
      break;
    case 'reject':
      // a low, muted falling semitone
      synth.play('bowed', 50, 0.42, t, 0.12, out, 1);
      synth.play('bowed', 49, 0.38, t + 0.11, 0.2, out, 1);
      break;
    case 'notify':
      synth.play('vibes', 84, 0.3, t, 0.5, out);
      break;
  }
}
