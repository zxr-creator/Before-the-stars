// Encyclopedia passages for one language, built by the `bts-lore` plugin in vite.config.ts
// from content/lore/*.json and keyed by the card's English name.
declare module 'virtual:lore/*' {
  interface Passage { intro: string; quote?: { text: string; source: string } }
  const pack: { tech: Record<string, Passage>; practice: Record<string, Passage> };
  export default pack;
}
