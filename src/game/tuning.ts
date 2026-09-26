// Feel presets the owner picks from the menu while M1 is being tuned. Each option overrides a
// few BAL knobs; every option of a group sets the same knobs, so applying all groups in order
// always gives a consistent BAL. Balance (ride length) is tuned for the defaults only.

import { tuneBal } from './balance';

export type TestKey = 'tempo' | 'turn' | 'angle' | 'air' | 'perfect';
export type TestSel = Record<TestKey, string>;
type Option = { id: string; label: string; bal: Record<string, unknown> };

export const TEST_GROUPS: { key: TestKey; label: string; def: string; options: Option[] }[] = [
  {
    key: 'tempo', label: 'Tempo', def: '1.2',
    options: [
      { id: '1', label: '1', bal: { tempo: 1 } },
      { id: '1.1', label: '1,1', bal: { tempo: 1.1 } },
      { id: '1.2', label: '1,2', bal: { tempo: 1.2 } },
      { id: '1.3', label: '1,3', bal: { tempo: 1.3 } },
      { id: '1.4', label: '1,4', bal: { tempo: 1.4 } },
    ],
  },
  {
    key: 'turn', label: 'Skręt', def: 'mid',
    options: [
      { id: 'slow', label: 'wolny', bal: { surf: { turn: 160 } } },
      { id: 'mid', label: 'średni', bal: { surf: { turn: 210 } } },
      { id: 'fast', label: 'szybki', bal: { surf: { turn: 260 } } },
      { id: 'vfast', label: 'b. szybki', bal: { surf: { turn: 320 } } },
    ],
  },
  {
    key: 'angle', label: 'Kąt', def: 'steep',
    options: [
      { id: 'soft', label: 'łagodny', bal: { surf: { headDown: -36, headUp: 30 } } },
      { id: 'mid', label: 'średni', bal: { surf: { headDown: -40, headUp: 34 } } },
      { id: 'steep', label: 'stromy', bal: { surf: { headDown: -46, headUp: 42 } } },
      { id: 'vsteep', label: 'b. stromy', bal: { surf: { headDown: -52, headUp: 48 } } },
    ],
  },
  {
    key: 'air', label: 'Wyskoki', def: 'high',
    options: [
      { id: 'low', label: 'niskie', bal: { surf: { lift: 0.75 }, air: { pop: 200, g: 600 } } },
      { id: 'high', label: 'wysokie', bal: { surf: { lift: 0.85 }, air: { pop: 320, g: 600 } } },
      { id: 'vhigh', label: 'b. wysokie', bal: { surf: { lift: 0.85 }, air: { pop: 450, g: 520 } } },
    ],
  },
  {
    // windows in game s; at tempo 1.2 that's ≈ 0.25 / 0.15 / 0.08 real s before touchdown
    key: 'perfect', label: 'Idealne', def: 'mid',
    options: [
      { id: 'easy', label: 'łatwe', bal: { land: { perfectWindow: 0.3 } } },
      { id: 'mid', label: 'średnie', bal: { land: { perfectWindow: 0.18 } } },
      { id: 'hard', label: 'trudne', bal: { land: { perfectWindow: 0.1 } } },
    ],
  },
];

export function defaultTest(): TestSel {
  return Object.fromEntries(TEST_GROUPS.map((g) => [g.key, g.def])) as TestSel;
}

/** Fill in missing / unknown choices with defaults. */
export function cleanTest(sel: Partial<TestSel> | null | undefined): TestSel {
  const out = defaultTest();
  for (const g of TEST_GROUPS) {
    const v = sel?.[g.key];
    if (v && g.options.some((o) => o.id === v)) out[g.key] = v;
  }
  return out;
}

export function applyTest(sel: TestSel) {
  for (const g of TEST_GROUPS) {
    const o = g.options.find((x) => x.id === sel[g.key]) ?? g.options.find((x) => x.id === g.def)!;
    tuneBal(o.bal);
  }
}

/** Short label for logs / the debug line, e.g. "t1 skręt:średni kąt:stromy wyskoki:wysokie". */
export function testLabel(sel: TestSel) {
  return TEST_GROUPS.map((g) => `${g.label.toLowerCase()}:${g.options.find((o) => o.id === sel[g.key])?.label ?? '?'}`).join(' ');
}
