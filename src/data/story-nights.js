// The Keeper's own notes, night by night, plus the old keeper's pencilled teaching notes and the
// dawn-record templates. Short lines; they get shorter and stranger in the epilogue.

export const KEEPER_NOTES = {
  1: {
    dusk: 'First night. Lamp lit at twenty to eight. One boat expected. The book says follow the line, so I\'ll follow the line.',
    dawn: 'The Patience home safe. Slept in the chair by the lamp.',
  },
  2: {
    dusk: 'Bread, tea and a new wick from the shop. Two boats tonight.',
    dawn: 'Both home. A person could get used to this.',
  },
  3: {
    dusk: 'High water. The book says the Comb and the Knuckles go under at high water. Straight across, then.',
    dawn: 'All in. A still night — the water like glass.',
  },
  4: {
    dusk: 'Soft rain. Low water, so the Pan, the Bar and the Flats will be showing. Three boats.',
    dawn: 'Nóinín, Honest Annie, An Rón Beag. Writing the names out again because I like them.',
  },
  5: {
    dusk: 'The sky tonight. I stood at the gallery rail and let the tea go cold.',
    dawn: 'Three home. Best night yet.',
  },
  6: {
    dusk: 'Haar came in off the sea at four, thick as wool. The beam barely reaches the water. The Rakes are showing across the north channel — the long way round tonight.',
    dawn: 'All in, in spite of it. Fog is only weather.',
  },
  7: {
    dusk: 'One bigger boat tonight. Give her room.',
    dawn: 'There\'s a line in the record I didn\'t write. Must be a mistake in the book. I\'ll ask Nora.',
  },
  8: {
    dusk: 'Rain on the glass. Wound the clock. Trimmed the wick.',
    dawn: 'Paraffin down three drums. I\'m nearly sure I filled them on Monday.',
  },
  9: {
    dusk: 'There\'s a line on tonight\'s chart I didn\'t draw. The old keeper\'s hand. Tidier than mine.',
    dawn: 'Their line was right. Of course it was.',
  },
  10: {
    dusk: 'Last night\'s turn is further in than I drew it. I must have smudged it with my sleeve.',
    dawn: 'A rock off the Comb I had never seen. I\'ve marked it in. There was a boat in the water under the beam that wasn\'t on the water.',
  },
  11: {
    dusk: 'Tadhg says himself has the cloak out again. Ha. He\'s not wrong, the state of it.',
    dawn: 'Three windows dark in the village tonight. Early to bed, the lot of them. Ha.',
  },
  12: {
    dusk: 'Grey all day. The cottages are open now. Nobody seems to mind.',
    dawn: 'Home. All of them home.',
  },
  13: {
    dusk: 'Síle\'s drawing is in my coat pocket. 1957. She must have copied the date off something.',
    dawn: 'There was land out past the stacks. Gold, for a moment. Then the haar closed over it.',
  },
  14: {
    dusk: 'The front pages have come unstuck in the damp. Other hands in them. Other names.',
    dawn: 'The reflections were late again. All of them, tonight.',
  },
  15: {
    dusk: 'The table says high water. The sea says low. I\'ll believe the sea.',
    dawn: 'I read the oldest pages again. I think I knew.',
  },
  16: {
    dusk: 'No harbour on the chart tonight. Only the island at the edge, where they drew it.',
    dawn: 'It was never a joke.',
  },
  17: {
    dusk: 'Lamp lit. Plan written.',
    dawn: 'You were slow again tonight. I waited.',
  },
  18: {
    dusk: 'Calm. You\'re calm tonight.',
    dawn: 'One light left in the village.',
  },
  19: {
    dusk: 'Lit. You know the way.',
    dawn: 'no lights now     only this one',
  },
};

// Pencilled teaching notes in the old keeper's hand, in the chart margin.
export const TEACH = {
  tutorial: [
    'Mark the turns on the water —',
    'the line runs from the open sea to the harbour mouth.',
    'When it is clear of the rocks, ink it.',
  ],
  oldPlan: 'or follow my line. It is always right.',
  teachUndo: 'A mark in the wrong place? Drag it, or take it back. Ink is dear — mind the well.',
  teachTide: 'High water: the dashed rocks are covered. Sail over them.',
  teachLow: 'Low water: the dotted ground shows. Go round.',
  teachSize: 'A big boat tonight. She wants a wider berth.',
  teachCurrent: 'The set runs north off the Comb. Allow for it.',
  ghostPlan: 'this way tonight',
  finalNight: 'out past the stacks',
};

// What a careful keeper notes the evening after a boat touched a rock.
export const STRUCK_FOLLOWUP = {
  early: (name) => `Tadhg towed the ${name} off at first light. No harm done but pride.`,
  mid: (name) => `The ${name} was gone off the rock by morning. Nobody saw her towed.`,
  late: (name) => `The ${name} is still out there. Her lantern is still lit.`,
};

// Dawn record lines for each ship.
export const RECORD = {
  home: (s, i) => `${s.name} — home, ${['ten to nine', 'quarter past nine', 'twenty to ten', 'ten past ten', 'half ten'][i % 5]}`,
  struck: (s, reef) => `${s.name} — touched ${reef || 'a rock'}. Waiting on the tide.`,
  gone: (s) => `${s.name} — gone on, into the mist`,
  overdue: (s) => `${s.name} — overdue. Expected 12th Sept. 1957.`,
};

// Which night carries which special record (in the old keeper's hand).
export const SPECIAL_RECORDS = {
  7: { ship: 1, kind: 'overdue' },
};

// Headings of the record page.
export const PAGE_WORDS = {
  ships: 'Expected tonight',
  tide: 'Tide',
  weather: 'Weather',
  record: 'Night\'s record',
  plan: 'Plan',
  sizes: { small: 'small', medium: 'middling', large: 'large' },
  tides: { high: 'high water', mid: 'half tide', low: 'low water' },
  weathers: { clear: 'clear', rain: 'soft rain', haar: 'haar', grey: 'grey, still', still: 'still' },
};

// The dawn watch line under the chart: lamp hours (sunset to sunrise, early-mid September, summer time),
// and the oil. It thins out with the acts.
export function watchLines(n) {
  if (!n.date) return n.epilogue === 3 ? ['lit.'] : ['Lit at dusk. Out at light.'];
  const day = parseInt(n.date, 10) - 2;
  const lit = 20 * 60 + 21 - Math.round(day * 2.5), out = 6 * 60 + 50 + Math.round(day * 1.6);
  const hm = (m) => `${Math.floor(m / 60) % 12 || 12}.${String(m % 60).padStart(2, '0')}`;
  const first = `Lit ${hm(lit)} pm. Out ${hm(out)} am.`;
  const oil = n.act === 1 ? 'Oil, two gallons. Wick trimmed at midnight.' : n.act === 2 ? 'Oil, two gallons.' : n.act === 3 ? 'Oil.' : '';
  return oil ? [first, oil] : [first];
}
