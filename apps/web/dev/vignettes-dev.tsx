// Dev-only gallery: every vignette key × 7 palettes. Not part of the product build.
import { render } from 'preact';
import { Vignette, VIGNETTE_KEYS } from '../src/art/vignette';

const params = new URLSearchParams(location.search);
const only = params.get('keys')?.split(',');
const mode = params.get('mode') ?? 'all';
const keys = [...VIGNETTE_KEYS, 'unknown_key'].filter((k) => !only || only.includes(k));
const ns = [0, 1, 2, 3, 4, 5, 6];

function Gallery() {
  if (mode === 'small') {
    // One small card per key (cycling palettes) — recognisability check, with a greyscale copy.
    return (
      <div>
        <h2>All keys, small (168×105)</h2>
        <div class="grid">{keys.map((k, i) => <div class="card small" title={k}><Vignette art={`${k}:${i % 7}`} title={k} /></div>)}</div>
        <h2>Greyscale</h2>
        <div class="grid grey">{keys.map((k, i) => <div class="card small"><Vignette art={`${k}:${i % 7}`} /></div>)}</div>
      </div>
    );
  }
  return (
    <div>
      {keys.map((k) => (
        <div>
          <h2>{k}</h2>
          <div class="row">
            {ns.map((n) => <div class={`card ${mode === 'big' ? 'big' : n < 2 ? 'big' : 'small'}`}><Vignette art={`${k}:${n}`} /></div>)}
          </div>
        </div>
      ))}
    </div>
  );
}

render(<Gallery />, document.getElementById('app')!);
