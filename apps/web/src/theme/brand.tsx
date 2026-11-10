// The game's own mark: a horizon, a rising star and its trail. Original artwork.
export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <svg class="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="bm-sky" cx="50%" cy="78%" r="80%">
          <stop offset="0" stop-color="#3a4a72" /><stop offset=".55" stop-color="#1c2338" /><stop offset="1" stop-color="#10131f" />
        </radialGradient>
        <linearGradient id="bm-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f3dc9a" /><stop offset=".5" stop-color="#c9a24d" /><stop offset="1" stop-color="#8a6a26" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#bm-sky)" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="url(#bm-brass)" stroke-width="2.200" />
      <circle cx="32" cy="32" r="26.500" fill="none" stroke="#c9a24d" stroke-width=".6" stroke-dasharray="1 3.200" opacity=".8" />
      <path d="M8 43c7-5.500 15-8.300 24-8.300S49 37.500 56 43c-4.500 9.500-13.500 15.500-24 15.500S12.500 52.500 8 43z" fill="#b98958" opacity=".92" />
      <path d="M8 43c7-5.500 15-8.300 24-8.300S49 37.500 56 43" fill="none" stroke="#f3dc9a" stroke-width="1.300" />
      <path d="M14 47.500c5.500-3.300 11.500-5 18-5s12.500 1.700 18 5M20 52.500c3.800-1.800 7.800-2.700 12-2.700s8.200.9 12 2.700" fill="none" stroke="#7c5a34" stroke-width=".9" opacity=".7" />
      <path d="M32 34.500C30 27 31 20 38 12" fill="none" stroke="#f3dc9a" stroke-width="1.100" stroke-dasharray=".5 2.600" stroke-linecap="round" />
      <path d="m40 5.500 1.700 4.300 4.300 1.700-4.300 1.700L40 17.500l-1.700-4.300L34 11.500l4.300-1.700z" fill="#fff3c9" stroke="#c9a24d" stroke-width=".7" stroke-linejoin="round" />
      <circle cx="18" cy="16" r=".9" fill="#f3dc9a" /><circle cx="50" cy="24" r=".8" fill="#f3dc9a" /><circle cx="24" cy="26" r=".6" fill="#f3dc9a" /><circle cx="13" cy="28" r=".6" fill="#f3dc9a" />
    </svg>
  );
}
