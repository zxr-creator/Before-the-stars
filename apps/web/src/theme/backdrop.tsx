// The title backdrop: a procedural night scene in layers — sky and stars, far
// ranges, a lamplit settlement by a river, and a few people on a ridge looking
// up. Original artwork generated here; the layers drift with slow parallax
// (pointer and time), and hold still under prefers-reduced-motion.
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { rng } from '../format';

const W = 1600;
const H = 900;

function ridge(seed: number, base: number, amp: number, rough: number): string {
  const r = rng(seed);
  const p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
  let d = `M-40 ${H + 20}`;
  for (let x = -40; x <= W + 40; x += 20) {
    const t = x / W;
    const y = base
      - amp * (0.55 * Math.sin(t * 5.1 + p1) + 0.3 * Math.sin(t * 11.3 + p2) + 0.15 * Math.sin(t * 23.7 + p3))
      - rough * (r() - 0.5);
    d += `L${x} ${y.toFixed(1)}`;
  }
  return d + `L${W + 40} ${H + 20}Z`;
}

function Stars(): JSX.Element {
  const r = rng(20261);
  const out: JSX.Element[] = [];
  for (let i = 0; i < 230; i++) {
    const x = r() * W;
    const y = Math.pow(r(), 1.5) * 620;
    const s = 0.35 + Math.pow(r(), 3) * 1.5;
    const warm = r() < 0.3;
    out.push(<circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={s.toFixed(2)} fill={warm ? '#f6dfa4' : '#f4f6ff'} opacity={(0.35 + r() * 0.65).toFixed(2)} />);
  }
  return <>{out}</>;
}

function Twinkles(): JSX.Element {
  const r = rng(977);
  const out: JSX.Element[] = [];
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = Math.pow(r(), 1.3) * 520, s = 1 + r() * 1.1;
    out.push(
      <g class="bd-twinkle" style={{ animationDelay: (-r() * 7).toFixed(2) + 's', animationDuration: (3.5 + r() * 4).toFixed(2) + 's' }}>
        <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={s.toFixed(2)} fill="#fff8e0" />
        <path d={`M${(x - s * 3.2).toFixed(1)} ${y.toFixed(1)}h${(s * 6.4).toFixed(1)}M${x.toFixed(1)} ${(y - s * 3.2).toFixed(1)}v${(s * 6.4).toFixed(1)}`} stroke="#fff8e0" stroke-width=".5" opacity=".7" />
      </g>,
    );
  }
  return <>{out}</>;
}

function House({ x, y, w, h, lit }: { x: number; y: number; w: number; h: number; lit: boolean }): JSX.Element {
  return (
    <g>
      <path d={`M${x} ${y}v${-h}l${w / 2} ${-h * 0.62}l${w / 2} ${h * 0.62}v${h}z`} fill="#141a2c" />
      {lit ? <rect x={x + w * 0.36} y={y - h * 0.7} width={w * 0.28} height={h * 0.42} fill="#ffd68a" /> : null}
    </g>
  );
}

function Settlement(): JSX.Element {
  const r = rng(4411);
  const houses: JSX.Element[] = [];
  for (let i = 0; i < 17; i++) {
    const x = 980 + i * 15 + (r() - 0.5) * 10;
    const lift = Math.sin((i / 16) * Math.PI) * 26;
    const w = 11 + r() * 8, h = 8 + r() * 6;
    houses.push(<House x={x} y={642 - lift + r() * 4} w={w} h={h} lit={r() < 0.72} />);
  }
  return (
    <g>
      <ellipse cx="1110" cy="622" rx="190" ry="46" fill="url(#bd-lamp)" />
      {houses}
      {/* the hall and its watch-fire */}
      <path d="M1094 618v-24l17-14 17 14v24z" fill="#141a2c" />
      <rect x="1106" y="600" width="10" height="12" fill="#ffd68a" />
      <path d="M1111 580v-12" stroke="#141a2c" stroke-width="2" />
      <circle cx="1111" cy="566" r="2.600" fill="#ffe7ae" />
      <circle cx="1111" cy="566" r="9" fill="#ffcf7a" opacity=".28" />
      <path d="M1040 606c-3-12 5-18 1-30M1176 612c-3-10 4-17 0-27" stroke="#8d93ad" stroke-width="2.200" fill="none" opacity=".28" stroke-linecap="round" />
    </g>
  );
}

function Person({ x, y, h, arm, staff }: { x: number; y: number; h: number; arm?: boolean; staff?: boolean }): JSX.Element {
  const head = h * 0.13;
  return (
    <g fill="#05070d" stroke="#05070d" stroke-linecap="round">
      <circle cx={x} cy={y - h + head} r={head} stroke="none" />
      <path d={`M${x - h * 0.16} ${y}L${x - h * 0.1} ${y - h * 0.72}Q${x} ${y - h * 0.8} ${x + h * 0.1} ${y - h * 0.72}L${x + h * 0.17} ${y}Z`} stroke="none" />
      {arm ? <path d={`M${x + h * 0.06} ${y - h * 0.66}L${x + h * 0.36} ${y - h * 1.02}`} stroke-width={h * 0.07} fill="none" /> : null}
      {staff ? <path d={`M${x - h * 0.26} ${y}V${y - h * 1.05}`} stroke-width={h * 0.045} fill="none" /> : null}
    </g>
  );
}

export function TitleBackdrop({ dim }: { dim?: boolean }): JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const far = useMemo(() => [ridge(11, 560, 70, 10), ridge(23, 610, 52, 8), ridge(37, 660, 40, 6)], []);
  const near = useMemo(() => ridge(53, 800, 34, 5), []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        el.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);

  const svg = { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': true } as const;
  return (
    <div class={'backdrop' + (dim ? ' is-dim' : '')} ref={root} aria-hidden="true">
      <svg class="bd-layer bd-sky" {...svg}>
        <defs>
          <linearGradient id="bd-skyg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#05070f" /><stop offset=".34" stop-color="#0d1326" /><stop offset=".6" stop-color="#1c2748" />
            <stop offset=".74" stop-color="#3b3f63" /><stop offset=".82" stop-color="#8a6258" /><stop offset=".88" stop-color="#d59a62" /><stop offset="1" stop-color="#3a2a2c" />
          </linearGradient>
          <radialGradient id="bd-band" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="#b9c4f2" stop-opacity=".2" /><stop offset=".5" stop-color="#8f9bd6" stop-opacity=".08" /><stop offset="1" stop-color="#8f9bd6" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="bd-star" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="#fff9e2" stop-opacity=".95" /><stop offset=".18" stop-color="#ffe9ae" stop-opacity=".5" /><stop offset="1" stop-color="#ffe9ae" stop-opacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#bd-skyg)" />
        <ellipse cx="760" cy="250" rx="980" ry="150" fill="url(#bd-band)" transform="rotate(-21 760 250)" />
        <Stars />
      </svg>
      <svg class="bd-layer bd-stars" {...svg}>
        <Twinkles />
        {/* the star the people are looking at, and the road toward it */}
        <circle cx="1132" cy="150" r="84" fill="url(#bd-star)" />
        <path d="M1132 96v108M1078 150h108" stroke="#fff6d6" stroke-width="1.100" opacity=".85" />
        <path d="m1132 132 5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="#fffbea" />
        <path d="M1111 566C1060 420 1066 280 1126 168" fill="none" stroke="#ffe9ae" stroke-width="1.300" stroke-dasharray="1 9" stroke-linecap="round" opacity=".55" />
        <g class="bd-meteor"><path d="M420 96l-118 44" stroke="#fff6d6" stroke-width="1.600" stroke-linecap="round" /></g>
      </svg>
      <div class="bd-cloud bd-cloud-1" /><div class="bd-cloud bd-cloud-2" /><div class="bd-cloud bd-cloud-3" />
      <svg class="bd-layer bd-far" {...svg}>
        <path d={far[0]} fill="#2c3760" />
        <path d={far[1]} fill="#222b4d" />
      </svg>
      <div class="bd-mist" />
      <svg class="bd-layer bd-mid" {...svg}>
        <defs>
          <radialGradient id="bd-lamp" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="#ffc86a" stop-opacity=".5" /><stop offset=".5" stop-color="#ff9a4a" stop-opacity=".16" /><stop offset="1" stop-color="#ff9a4a" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="bd-river" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#d9a06a" stop-opacity=".0" /><stop offset=".45" stop-color="#e2ad78" stop-opacity=".75" /><stop offset="1" stop-color="#8e86a8" stop-opacity=".35" />
          </linearGradient>
        </defs>
        <path d={far[2]} fill="#171e36" />
        <path d="M560 706c120-16 190-34 300-30 92 3 150 22 262 16 120-6 220-30 478-36v22c-240 8-360 34-476 40-118 6-176-12-266-14-104-2-182 14-298 30z" fill="url(#bd-river)" />
        <Settlement />
      </svg>
      <svg class="bd-layer bd-near" {...svg}>
        <path d={near} fill="#070a13" />
        <path d={near} fill="none" stroke="#3a3550" stroke-width="1.500" opacity=".7" />
        <path d="M250 800c-6-40 2-74-4-112M246 716c-18-22-40-26-58-22M247 730c16-26 40-36 62-32M246 700c-4-22 6-40 22-52M246 706c-12-18-30-26-46-24" stroke="#05070d" stroke-width="7" fill="none" stroke-linecap="round" />
        {/* a hillock on the near ridge, and the people on it */}
        <path d="M610 812c40-34 96-50 160-50s132 18 176 50z" fill="#070a13" />
        <Person x={722} y={768} h={78} arm />
        <Person x={758} y={766} h={46} />
        <Person x={792} y={765} h={72} staff />
        <Person x={838} y={768} h={66} />
        <Person x={868} y={771} h={40} arm />
      </svg>
      <div class="bd-vignette" />
    </div>
  );
}
