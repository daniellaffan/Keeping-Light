// What each pose's hands should be touching, and how closely: shared by the hands' contact solver and
// its tests (handcheck.js). Every tolerance is one constant here.
//
// A contact names parts of the hand (sets of skin vertices, picked out in handcheck.js: the fingertips'
// pads, the palm, the heel of the hand, its little-finger edge, the pads of each phalanx, the underside
// of the forearm), what they should touch (colliders by name; the nearest counts) and how many of the
// parts must be within the tolerance. `when` says when it holds:
//   steady   the keeper is settled in the pose (leaning, sitting...) and its blend ended 0.2 s ago
//   posed    the fingers are where the pose puts them (a tool held in the hand)
//   pressed  the point is pressed on the page, drawing
//   grasp    the moment a tool is taken from where it lies, or put down there
//   carry    the inkwell carried in beside the book
//   lever, ring, lid, lift   the hand on the lamp lever, the door's ring, the lifted cover, the corner
//                            of a turning page, for as long as it moves them
// Held for review (debug), a pose's contacts all hold.

export const THRESH = {
  penetrationMm: 2,     // the deepest any skin may be inside anything
  gripMm: 1,            // the fingertips and palm on what they grip
  restMm: 2,            // a hand resting on the table
  nibMm: 0.5,           // the pencil's or quill's point on the page while drawing (and on its line)
  stepDeg: 25,          // the most any joint may turn in one frame at 30 frames a second
  twistFloor: 0.7,      // the forearm's cross-section never narrower than this part of its rest width
  holdMm: 0.0005,       // a held hand moves less than this a frame (it prints as 0.000 mm)
};

const T = THRESH;
const TIPS = ['tip.index', 'tip.middle', 'tip.ring', 'tip.little'];
// a hand resting flat on the table (or the book's board beside the pages): the heel and the finger pads
const REST = [
  { id: 'heel on the table', parts: ['heel'], target: ['table', 'book'], tol: T.restMm, when: 'steady' },
  { id: 'fingertips on the table', parts: TIPS, need: 3, target: ['table', 'book'], tol: T.restMm, when: 'steady' },
];
// the tripod: the pencil (or quill) pinched by the thumb and index pads, lying on the middle finger's side
const TRIPOD = (when = 'posed') => [
  { id: 'thumb on the shaft', parts: ['tip.thumb'], target: ['tool'], tol: T.gripMm, when },
  { id: 'index on the shaft', parts: ['tip.index'], target: ['tool'], tol: T.gripMm, when },
  { id: 'middle finger under the shaft', parts: ['side.middle'], target: ['tool'], tol: T.gripMm, when },
];
const NIB = [
  { id: 'nib on the page', nib: true, target: ['book'], tol: T.nibMm, when: 'pressed' },
  { id: 'nib on its line', route: true, tol: T.nibMm, when: 'pressed' },
];
// round something held in the fist: the palm and the finger pads on it
const WRAP = (target, thumb, when = 'steady') => [
  { id: 'palm on the ' + target, parts: ['palm'], target: [target], tol: T.gripMm, when },
  { id: 'fingertips on the ' + target, parts: TIPS, need: 3, target: [target], tol: T.gripMm, when },
  ...(thumb ? [{ id: 'thumb on the ' + target, parts: ['tip.thumb'], target: [target], tol: T.gripMm, when }] : []),
];
const EDGE = (on) => ({ id: 'little-finger edge on the ' + on, parts: ['ulnar'], target: on === 'page' ? ['book', 'table'] : ['table', 'book'], tol: T.restMm, when: 'steady' });

// the keeper's states in which each pose is settled (the 'steady' contacts hold only there)
export const STEADY = {
  lean: ['lean', 'closing'], ready: ['lean'], write: ['lean'], pen: ['lean'], turn: ['lean'], close: ['closing'],
  'ink-tray': ['lean'], 'ink-well': ['lean'], 'ink-take': ['lean'], 'ink-lift': ['lean'],
  chair: ['chair', 'dawn-chair'], mug: ['chair'], lamp: ['light'], door: ['door'], rail: ['stairs'],
};

export const CONTACTS = {
  walk: { R: [], L: [] },
  door: {
    // the fingers hooked through the ring: their middle phalanges on its lower bar
    R: [{ id: 'fingers hooked on the ring', parts: ['pad.index.2', 'pad.middle.2', 'pad.ring.2'], need: 2, target: ['ring'], tol: T.gripMm, when: 'ring' }],
    L: [],
  },
  lean: { R: REST, L: REST },
  ready: { R: [...TRIPOD(), EDGE('table')], L: REST },
  write: { R: [...TRIPOD(), ...NIB, EDGE('page')], L: REST },
  pen: { R: [...TRIPOD(), ...NIB], L: REST },
  turn: { R: [{ id: 'fingertips under the corner', parts: ['tip.index', 'tip.middle'], need: 1, target: ['leaf'], tol: T.gripMm, when: 'lift' }], L: REST },
  close: {
    R: REST,
    L: [
      { id: 'thumb on the cover', parts: ['tip.thumb'], target: ['cover'], tol: T.gripMm, when: 'lid' },
      { id: 'fingertips under the cover', parts: ['tip.index', 'tip.middle'], need: 1, target: ['cover'], tol: T.gripMm, when: 'lid' },
    ],
  },
  chair: {
    R: [{ id: 'forearm on the chair arm', parts: ['forearm.volar'], target: ['chair'], tol: T.restMm, when: 'steady' }],
    L: [{ id: 'forearm on the chair arm', parts: ['forearm.volar'], target: ['chair'], tol: T.restMm, when: 'steady' }],
  },
  mug: { R: WRAP('mug', false), L: WRAP('mug', false) },
  lamp: { R: WRAP('lever', true, 'lever'), L: [] },
  rail: { R: WRAP('rail', false), L: [] },
  // inking: the pencil let go in the tray, the inkwell carried in, the quill taken out and put back
  'ink-tray': { R: TRIPOD('grasp'), L: REST },
  'ink-well': { R: WRAP('inkwell', true, 'carry'), L: REST },
  'ink-take': { R: TRIPOD('grasp'), L: REST },
  'ink-lift': { R: TRIPOD(), L: REST },
  show: { R: [], L: [] },
};
