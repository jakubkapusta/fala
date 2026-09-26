// Boards (bought with shells) change the feel through BAL overrides, applied last; looks
// (wetsuit and trail colours) are cosmetic. The starting board is the all-rounder the owner
// tuned the ride on in M1.

type Over = Record<string, unknown>;
type RGB = [number, number, number];

export type BoardId = 'allround' | 'longboard' | 'fish' | 'shortboard' | 'gun';
export type Board = {
  id: BoardId;
  name: string;
  blurb: string;
  price: number;
  bal: Over;
  /** drawing: length ×, deck colour, rail colour */
  len: number;
  deck: RGB;
  /** 0..1 bars shown in the shop: stability (landing window), spin, speed on flat water */
  stats: [number, number, number];
};

export const BOARDS: Board[] = [
  { id: 'allround', name: 'Deska', blurb: 'Uniwersalna. Na każdą falę.', price: 0, bal: {}, len: 1, deck: [0.86, 0.74, 0.55], stats: [0.5, 0.5, 0.5] },
  {
    id: 'longboard', name: 'Longboard', blurb: 'Stabilny, wybacza krzywe lądowania, ale wolno się obraca.', price: 200,
    bal: { land: { perfect: 24, clean: 62 }, air: { spin: 500 }, surf: { turn: 185 } }, len: 1.35, deck: [0.95, 0.9, 0.78], stats: [0.9, 0.25, 0.55],
  },
  {
    id: 'fish', name: 'Fish', blurb: 'Szybki na płaskich, słabych sekcjach.', price: 300,
    bal: { wave: { flat: { power: 0.8 } }, surf: { push: 85, bottomDrag: 1.2 } }, len: 0.85, deck: [0.35, 0.75, 0.85], stats: [0.45, 0.55, 0.9],
  },
  {
    id: 'shortboard', name: 'Shortboard', blurb: 'Najszybsze obroty, ale wąskie okno lądowania.', price: 400,
    bal: { land: { perfect: 14, clean: 42 }, air: { spin: 820 }, surf: { turn: 240 } }, len: 0.9, deck: [0.95, 0.45, 0.3], stats: [0.25, 0.95, 0.5],
  },
  {
    id: 'gun', name: 'Gun', blurb: 'Długi i stabilny na wielkich falach. Mniej traci na wywrotce.', price: 600,
    bal: { land: { perfect: 20, clean: 56 }, wipe: { keep: 0.6 }, surf: { scrapeKeep: 0.85, g: 450 } }, len: 1.25, deck: [0.85, 0.85, 0.9], stats: [0.75, 0.4, 0.6],
  },
];

export type Suit = { id: string; name: string; price: number; col: RGB };
export const SUITS: Suit[] = [
  { id: 'black', name: 'Czarna', price: 0, col: [0.012, 0.014, 0.02] },
  { id: 'navy', name: 'Granatowa', price: 60, col: [0.02, 0.03, 0.09] },
  { id: 'red', name: 'Czerwona', price: 80, col: [0.12, 0.015, 0.012] },
  { id: 'teal', name: 'Morska', price: 80, col: [0.01, 0.07, 0.07] },
  { id: 'yellow', name: 'Żółta', price: 120, col: [0.2, 0.14, 0.01] },
];

export type Trail = { id: string; name: string; price: number; col: RGB | null };
export const TRAILS: Trail[] = [
  { id: 'foam', name: 'Piana', price: 0, col: null },
  { id: 'gold', name: 'Złoty', price: 100, col: [1.2, 0.85, 0.35] },
  { id: 'pink', name: 'Różowy', price: 100, col: [1.1, 0.4, 0.8] },
  { id: 'cyan', name: 'Błękitny', price: 100, col: [0.35, 0.95, 1.2] },
];

export const boardById = (id: string) => BOARDS.find((b) => b.id === id) ?? BOARDS[0];
export const suitById = (id: string) => SUITS.find((b) => b.id === id) ?? SUITS[0];
export const trailById = (id: string) => TRAILS.find((b) => b.id === id) ?? TRAILS[0];
