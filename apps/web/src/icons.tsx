// Small hand-drawn inline SVG icons (20×20 grid, stroke = currentColor).
import type { JSX } from 'preact';

type P = { size?: number; class?: string; title?: string };

const PATHS: Record<string, JSX.Element> = {
  briefing: <><path d="M5 3.5h8.5a2 2 0 0 1 2 2V16a1.500 1.500 0 0 1-3 0V5.500" /><path d="M5 3.500a2 2 0 0 0-2 2V15a1.500 1.500 0 0 0 1.500 1.500H14" /><path d="M6 7.500h4M6 10.500h4M6 13.500h3" /></>,
  economy: <><path d="M10 3v14M5 17h10" /><path d="M4 6.500h12" /><path d="M4 6.500 2 11.500a2.300 2.300 0 0 0 4 0zM16 6.500l-2 5a2.300 2.300 0 0 0 4 0z" /></>,
  projects: <><path d="M3 17 10.500 9.500" /><path d="M9 5.500 12.500 2l2 2-1 1 3.500 3.500-2 2L11.500 7l-1 1z" /></>,
  people: <><circle cx="7" cy="6.500" r="2.500" /><path d="M2.500 16.500c0-2.800 2-4.500 4.500-4.500s4.500 1.700 4.500 4.500" /><circle cx="14" cy="7.500" r="2" /><path d="M13.500 12c2.300 0 4 1.500 4 4" /></>,
  knowledge: <><path d="M10 2.500a5 5 0 0 0-3 9c.6.500 1 1.200 1 2v.5h4v-.5c0-.8.400-1.500 1-2a5 5 0 0 0-3-9z" /><path d="M8 16.500h4M8.800 18.500h2.400" /></>,
  culture: <><path d="M6 4h8l-.8 3.500a5 5 0 0 1 .8 2.700c0 3-1.800 5.300-4 5.300s-4-2.300-4-5.300c0-1 .300-1.900.8-2.700z" /><path d="M5.500 9.500h9M7 17.500h6" /></>,
  politics: <><path d="M2.500 7.500 10 3l7.500 4.500z" /><path d="M4.500 8v7M8.200 8v7M11.800 8v7M15.500 8v7M2.500 17h15" /></>,
  diplomacy: <><path d="M3 5.500h14v9H3z" /><path d="m3 6 7 5.500L17 6" /><circle cx="14.500" cy="13.500" r="2.200" fill="currentColor" stroke="none" /></>,
  military: <><path d="M10 2.500 16 5v4.500c0 4-2.600 6.800-6 8-3.400-1.200-6-4-6-8V5z" /><path d="M10 6v7.500M7 9.500h6" /></>,
  objectives: <><circle cx="10" cy="10" r="7.200" /><path d="m12.800 7.200-1.600 4-4 1.600 1.600-4z" /></>,
  chronicle: <><path d="M5 3h10M5 17h10" /><path d="M6 3c0 4 4 4.500 4 7s-4 3-4 7M14 3c0 4-4 4.500-4 7s4 3 4 7" /></>,
  check: <path d="m4 10.500 4 4 8-9" />,
  cross: <path d="M5 5l10 10M15 5 5 15" />,
  warn: <><path d="M10 3 18 16.500H2z" /><path d="M10 8v4M10 14.200v.3" /></>,
  danger: <><path d="M6.500 2.500h7l4 4v7l-4 4h-7l-4-4v-7z" /><path d="M10 6v5M10 13.500v.3" /></>,
  info: <><circle cx="10" cy="10" r="7.300" /><path d="M10 9v5M10 6.200v.3" /></>,
  good: <><circle cx="10" cy="10" r="7.300" /><path d="m6.500 10.300 2.500 2.500 4.500-5" /></>,
  plus: <path d="M10 4v12M4 10h12" />,
  minus: <path d="M4 10h12" />,
  pause: <path d="M7 4.500v11M13 4.500v11" />,
  play: <path d="M6.500 4.500v11l9-5.500z" />,
  close: <path d="M5 5l10 10M15 5 5 15" />,
  left: <path d="m12 4-6 6 6 6" />,
  right: <path d="m8 4 6 6-6 6" />,
  down: <path d="m4 7.500 6 6 6-6" />,
  up: <path d="m4 12.500 6-6 6 6" />,
  menu: <path d="M3.500 5.500h13M3.500 10h13M3.500 14.500h13" />,
  pin: <><path d="M10 17.500s5-4.700 5-8.500a5 5 0 0 0-10 0c0 3.800 5 8.500 5 8.500z" /><circle cx="10" cy="9" r="1.800" /></>,
  clock: <><circle cx="10" cy="10" r="7.300" /><path d="M10 5.500V10l3 2" /></>,
  lock: <><rect x="4.500" y="9" width="11" height="8" rx="1.200" /><path d="M7 9V6.500a3 3 0 0 1 6 0V9" /></>,
  eye: <><path d="M2 10s3-5.500 8-5.500S18 10 18 10s-3 5.500-8 5.500S2 10 2 10z" /><circle cx="10" cy="10" r="2.300" /></>,
  save: <><path d="M4 3.500h9.500L16.500 6.500V16.500H4z" /><path d="M7 3.500v4h5.500v-4M6.500 16.500v-5h7v5" /></>,
  download: <><path d="M10 3v9.500M6 9l4 4 4-4" /><path d="M4 16.500h12" /></>,
  swap: <><path d="M4 7h11l-3-3M16 13H5l3 3" /></>,
  flag: <><path d="M5 17.500V3" /><path d="M5 4h9l-2 3 2 3H5" /></>,
  star: <path d="m10 2.800 2.200 4.600 5 .7-3.600 3.500.9 5-4.500-2.400-4.500 2.400.9-5L2.800 8.100l5-.7z" />,
  hourglass: <><path d="M5.500 3h9M5.500 17h9" /><path d="M6.500 3c0 4 3.500 4.500 3.500 7s-3.500 3-3.500 7M13.500 3c0 4-3.500 4.500-3.500 7s3.500 3 3.500 7" /></>,
  trash: <><path d="M4 6h12M8 6V4h4v2M6 6l.7 10.500h6.600L14 6" /></>,
  send: <path d="M3 10 17 3.500 13 17l-3-5.500z" />,
  seal: <><circle cx="10" cy="8" r="4.500" /><path d="m7.500 12-1.500 5.500 4-2 4 2-1.500-5.500" /></>,
  question: <><circle cx="10" cy="10" r="7.300" /><path d="M7.800 8a2.300 2.300 0 1 1 3.300 2c-.7.400-1.100.9-1.100 1.700M10 14.200v.3" /></>,
  link: <><path d="M8.500 11.500a3 3 0 0 0 4.200 0l3-3a3 3 0 0 0-4.200-4.200l-1 1" /><path d="M11.500 8.500a3 3 0 0 0-4.200 0l-3 3a3 3 0 0 0 4.200 4.200l1-1" /></>,
  grain: <><path d="M10 18V7" /><path d="M10 7c-2-1-2.500-3-2-4.500 1.500.5 2.500 2 2 4.500zM10 7c2-1 2.500-3 2-4.500-1.500.5-2.500 2-2 4.500zM10 11.500c-2.200-.5-3.200-2.200-3-4 1.700.2 3 1.500 3 4zM10 11.500c2.200-.5 3.200-2.200 3-4-1.700.2-3 1.500-3 4z" /></>,
  box: <><path d="M3 6.500 10 3l7 3.500v7L10 17l-7-3.500z" /><path d="M3 6.500 10 10l7-3.500M10 10v7" /></>,
  hammer: <><path d="M4 16.500 10.500 10" /><path d="M9 5l3-2.500 5 5L14.500 10z" /></>,
  heart: <path d="M10 16.500S3.500 12.500 3.500 8a3.500 3.500 0 0 1 6.500-1.700A3.500 3.500 0 0 1 16.500 8c0 4.500-6.500 8.500-6.500 8.500z" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, class: cls, title }: P & { name: string }) {
  const body = PATHS[name] ?? PATHS.info;
  return (
    <svg class={'icon' + (cls ? ' ' + cls : '')} width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" stroke-width="1.600" stroke-linecap="round" stroke-linejoin="round"
      role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'} focusable="false">
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}
