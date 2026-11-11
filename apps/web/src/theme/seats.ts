// Seats and map presets (design chapter 40, section 2): two to ten civilizations, each with
// its own colour, emblem shield and chart marker, and four map sizes that each take a range
// of seats. The referee sends each civilization's colour; these are its defaults (the
// engine's CIV_COLORS) for the setup screen and the almanac, before a match exists.

/** The referee's ten seat colours, in seat order. */
export const SEAT_COLORS = ['#c1503a', '#2f73a0', '#5c8a36', '#8a59a8', '#c08a2a', '#2a9a9a', '#a8507a', '#6a6a3a', '#4a5aa8', '#8a4a2a'];

export const MAX_SEATS = 10;
export const MIN_SEATS = 2;

export type MapPresetKey = 'small' | 'standard' | 'large' | 'huge' | 'test90';

export interface MapPreset {
  key: MapPresetKey;
  regions: 30 | 60 | 90 | 120 | 200;
  label: string;
  hint: string;
  minSeats: number;
  maxSeats: number;
  /** Seats a new setup starts with on this preset. */
  defaultSeats: number;
  /** Offered only as a test option. */
  test?: boolean;
}

// i18n-fields
export const MAP_PRESETS: MapPreset[] = [
  { key: 'small', regions: 30, label: 'Small', hint: 'Neighbours meet early; room for two or three.', minSeats: 2, maxSeats: 3, defaultSeats: 3 },
  { key: 'standard', regions: 60, label: 'Standard', hint: 'The calibrated world: about fifteen regions a civilization.', minSeats: 2, maxSeats: 5, defaultSeats: 4 },
  { key: 'large', regions: 120, label: 'Large', hint: 'Long isolation and long frontiers for four to eight.', minSeats: 4, maxSeats: 8, defaultSeats: 6 },
  { key: 'huge', regions: 200, label: 'Huge', hint: 'A crowded planet for six to ten; slower rounds.', minSeats: 6, maxSeats: 10, defaultSeats: 8 },
  { key: 'test90', regions: 90, label: 'Test (90)', hint: 'A test size between Standard and Large.', minSeats: 2, maxSeats: 10, defaultSeats: 4, test: true },
];
// i18n-end

export function presetOf(regions: number): MapPreset {
  return MAP_PRESETS.find((p) => p.regions === regions) ?? MAP_PRESETS[1];
}

/** Sample civilization names for previews (the almanac's emblem row). Matches name their own. */
export const SAMPLE_NAMES = ['Amberfen', 'Longstrand', 'Riverland', 'Clearbay', 'Ashvale', 'Coldbrook', 'Redcliff', 'Duskmoor', 'Saltmere', 'Highcairn'];

/**
 * The key that shows a seat's own view in observer mode: 1–9 for the first nine seats in the
 * listed order, 0 for the tenth; null past that.
 */
export function seatKey(index: number): string | null {
  return index < 9 ? String(index + 1) : index === 9 ? '0' : null;
}

/** The listed-seat index a key stands for (inverse of seatKey). */
export function keySeatIndex(key: string): number | null {
  if (!/^[0-9]$/.test(key)) return null;
  return key === '0' ? 9 : Number(key) - 1;
}
