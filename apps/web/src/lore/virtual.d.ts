// Encyclopedia passages for one language, built by the `bts-lore` plugin in vite.config.ts
// from content/lore/*.json and keyed by the card's English name.
declare module 'virtual:lore/*' {
  interface Passage { intro: string; quote?: { text: string; source: string } }
  const pack: { tech: Record<string, Passage>; practice: Record<string, Passage> };
  export default pack;
}
// Public catalogue facts for arranging disclosed tree cards (vite.config.ts `bts-tree-tables`).
declare module 'virtual:tree-tables' {
  const tables: {
    /** Technology English name -> era band 0-9. */
    band: Record<string, number>;
    /** Technology field title -> catalogue letter (A-S) and tradition key for branches. */
    fields: Record<string, { letter: string; tradition: string | null }>;
    /** Rival family name -> kind ('standard' | 'approach' | 'doctrine') and refuting technology names. */
    families: Record<string, { kind: string; refuted_by: string[] }>;
    /** Practice English name -> exclusive group name. */
    exclusive: Record<string, string>;
  };
  export default tables;
}
