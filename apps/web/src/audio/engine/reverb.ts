// A hall impulse response generated in code: a few early reflections, then decorrelated
// noise for each ear whose level falls 60 dB over `t60` seconds and whose highs die
// away faster than its lows, as in a real room.
import { rng } from './theory';

export function makeImpulse(ctx: BaseAudioContext, t60: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (t60 + 0.1));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(0.018 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = rng(1009 + ch * 7);
    let lp = 0;
    let energy = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / t60);
      // the low-pass closes with time: bright at first, dark in the tail
      const a = 0.08 + 0.85 * Math.exp(-t * 2.2);
      lp += a * ((r() * 2 - 1) - lp);
      // a gentle fade-in so the first reflections do not click
      const onset = Math.min(1, t / 0.012);
      d[i] = lp * env * onset;
      energy += d[i] * d[i];
    }
    // early reflections
    for (const [ms, g] of [[11, 0.5], [19, -0.38], [27, 0.3], [41, -0.24], [53, 0.2], [67, -0.15]] as const) {
      const k = pre + Math.floor(((ms + ch * 3.1) / 1000) * sr);
      if (k < len) d[k] += g * 0.4;
    }
    // unit energy per channel: the send levels then mean the same for every length
    const norm = 1 / Math.sqrt(energy + 0.1);
    for (let i = 0; i < len; i++) d[i] *= norm * 0.9;
    // a short fade at the very end
    const fade = Math.floor(0.05 * sr);
    for (let i = len - fade; i < len; i++) d[i] *= (len - i) / fade;
  }
  return buf;
}
