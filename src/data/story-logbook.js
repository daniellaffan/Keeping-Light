// The logbook's older pages: the routine on the inside cover, the old keeper's run, the other
// keepers' runs (revealed on night 14), and the oldest pages with the bargain (night 15).
// `shake` (0..1) drives how unsteady the hand is.

export const INSIDE_COVER = {
  hand: 'old',
  title: 'Ceann Bán Light — Station Routine',
  lines: [
    'Light the lamp at dusk.',
    'Write the night\'s plan.',
    'Watch for ships.',
    'Guide them home.',
    'Trim the wick at two. Wind the clock at four.',
    'The lamp is never to go out.',
  ],
};

// The old keeper's run, oldest first. The last one stops mid-sentence; it faces the new keeper's first page.
export const OLD_KEEPER = [
  { date: '1st March', shake: 0, text: 'Wind SW, fresh. Glass steady. The Mary Ellen in at half eight, the Kittiwake soon after. Both lanterns trimmed and bright — a credit to whoever keeps them.' },
  { date: '3rd March', shake: 0, text: 'Took the long way round the Sisters for the Two Sisters, which amused nobody but me. Home by nine.' },
  { date: '9th March', shake: 0, text: 'High water at ten. The Comb is under, and the Knuckles with it. On a night like this you may go straight across the middle and nobody will know you were lazy.' },
  { date: '17th March', shake: 0, text: 'Nora sent up a loaf and a half-pound of butter. Would not take money. I will mend her gate.' },
  { date: '2nd April', shake: 0, text: 'Low water. The Pan shows its back. Keep well south of the Black Rock and give the Bar a good berth — it is longer than it looks from up here.' },
  { date: '11th April', shake: 0.05, text: 'Rain all day. Wick trimmed at two, clock wound at four. Read the almanac twice. Heather Bell in, Honest Annie in. Quiet.' },
  { date: '30th April', shake: 0.05, text: 'First swallows on the wire by the shed.' },
  { date: '14th May', shake: 0.05, text: 'Tadhg says the mackerel are in early. Tadhg says a great many things.' },
  { date: '2nd June', shake: 0.08, text: 'A child left a drawing of the lamp on the wall by the gate. I have pinned it up in the lamp room. The beam is drawn very long.' },
  { date: '21st June', shake: 0.08, text: 'Longest day. Lit at half ten and it hardly seemed worth it. Réalt na Mara in, very late, very cheerful.' },
  { date: '8th July', shake: 0.1, text: 'Painted the gallery rail. Sheep on the cliff path again; one of them has opinions.' },
  { date: '19th August', shake: 0.12, text: 'Fog in the morning, burned off by noon. Glad of it.' },
  { date: '3rd Sept.', shake: 0.2, text: 'The Patience came in again. I have her in the book for Tuesday as well. Two boats of the one name, I suppose. It is a common enough word.' },
  { date: '10th Sept.', shake: 0.25, text: 'Haar. The beam would not reach the water. I stood at the glass and counted the lanterns as they came, and there was one more than I had written.' },
  { date: '14th Sept.', shake: 0.28, text: 'Paraffin low. I am sure I filled them.' },
  { date: '21st Sept.', shake: 0.3, text: 'Síle came up the hill with her drawings. She draws the lamp the same every time, and something standing beside it. I asked her who, and she said "himself", and went off laughing.' },
  { date: '22nd Sept.', shake: 0.32, text: 'Asked Nora about the Grá Mo Chroí. She said there hasn\'t been a boat of that name out of Port na Rón since her mother\'s time. She said it kindly.' },
  { date: '1st Oct.', shake: 0.4, text: 'The reflections are slow tonight. Wrote that, and crossed it out, and wrote it again.' },
  { date: '9th Oct.', shake: 0.45, text: 'Tadhg made his joke about himself and his cloak, and did not laugh at it.' },
  { date: 'Oct.', shake: 0.55, text: 'Lamp lit. Plan written. They came.' },
  { date: 'Oct.', shake: 0.6, text: 'I have stopped going down to the village. The lights are fewer. Or I am counting wrong.' },
  { date: '', shake: 0.68, text: 'Haar. The island again, past the stacks, just for a moment. Gold. It is not on any chart.' },
  { date: '', shake: 0.72, text: 'There is someone stands out on the water at the edge of the beam. He does not come nearer. I do not think he means harm. I do not think he means anything I would understand.' },
  { date: '', shake: 0.76, text: 'The book is for whoever comes. Keep the lamp lit. Write the plan. They only want to get home, and they do not know the way.' },
  { date: '', shake: 0.8, text: 'Haar again. The Patience came in late but she came in. I keep thinking that if I went down to the water when the beam comes round I would see where they go, and if I', last: true },
];

// Earlier keepers. Pages "stuck together in the damp" until night 14. Each run stops abruptly.
export const OTHER_KEEPERS = [
  {
    hand: 'otherC', years: '1874',
    entries: [
      { date: 'October the 2nd, 1874', text: 'Arrived by cart from the town. A wild place and a good light.' },
      { date: 'October the 9th', text: 'The people here are very kind and say very little.' },
      { date: 'October the 30th', text: 'Walked out at low water as far as the black rock. Found a lantern there among the weed, and it was still warm.' },
      { date: 'November', text: 'I have agreed to it. The lamp for the boats, for as long as', stop: true },
    ],
  },
  {
    hand: 'otherB', years: '1902',
    entries: [
      { date: 'May 1902', text: 'Fine. The new lens is a wonder. You could read the paper by it on the far side of the bay.' },
      { date: 'June 1902', text: 'Mackerel boats out and home. Wrote all their names, for the practice of it.' },
      { date: 'July 1902', text: 'The names in this book from before my time are the same names as tonight\'s. A family custom, I am told.' },
      { date: 'August 1902', text: 'I will go down tonight and ask them myself. The tide is', stop: true },
    ],
  },
  {
    hand: 'otherA', years: '1931',
    entries: [
      { date: '4 Nov. 1931', text: 'Took over the station. Book in good order. Lamp good. Wick a disgrace.' },
      { date: '9 Nov. 1931', text: 'Six boats in tonight. I did not know there were six boats in the parish.' },
      { date: '20 Nov. 1931', text: 'Fog. Kept the lamp burning till noon, for no reason I could give the Board.' },
      { date: '2 Dec. 1931', text: 'Asked in the village about the boats. They laughed, and told me about a man in a grey cloak. Nobody finished the story.' },
      { date: '11 Dec. 1931', text: 'There was a tall', stop: true },
    ],
  },
];

// The old keeper's oldest pages — the bargain. Revealed on night 15. Neat hand, but pressed hard.
export const BARGAIN = {
  hand: 'old',
  entries: [
    { date: '12th September 1957', text: 'The boats did not come in from the fishing. The whole village on the pier until the light went. Nothing.' },
    { date: '14th September 1957', text: 'Haar for two days. No word.' },
    { date: '16th September 1957', text: 'I went down to the water at the turn of the tide and I said it out loud, what I would give. I will write it here so that it is written. The lamp will burn every night. Every night. And they will be kept safe on their way, wherever their way is now. That is the bargain. Whoever keeps the light keeps it.' },
    { date: '17th September 1957', text: 'They came in tonight. All of them. I counted the lanterns. Nobody stepped ashore.' },
  ],
  signature: 'Fran',
};

// Marginalia that can sit on old pages.
export const MARGINALIA = {
  pressedFlower: 'thrift, from the cliff path',
  waterStain: true,
};
