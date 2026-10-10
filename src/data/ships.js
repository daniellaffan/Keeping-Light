// Every boat that comes in to Port na Rón. All names are invented.
// size: small (currach, punt, half-decker) | medium (fishing boat, small lugger) | large (trading ketch, steamer)

export const SHIPS = {
  'Patience': { size: 'small', kind: 'half-decker' },
  'An Faoileán': { size: 'small', kind: 'currach', gloss: 'the gull' },
  'Kittiwake': { size: 'small', kind: 'punt' },
  'Grá Mo Chroí': { size: 'small', kind: 'currach', gloss: 'love of my heart' },
  'Mary Ellen': { size: 'medium', kind: 'lugger' },
  'Nóinín': { size: 'small', kind: 'currach', gloss: 'daisy' },
  'Honest Annie': { size: 'medium', kind: 'fishing boat' },
  'An Rón Beag': { size: 'small', kind: 'currach', gloss: 'the little seal' },
  'Réalt na Mara': { size: 'medium', kind: 'fishing boat', gloss: 'star of the sea' },
  'Heather Bell': { size: 'small', kind: 'half-decker' },
  'Two Sisters': { size: 'medium', kind: 'lugger' },
  'The Curlew': { size: 'small', kind: 'punt' },
  'Fáinne Óir': { size: 'medium', kind: 'fishing boat', gloss: 'ring of gold' },
  'Morning Lark': { size: 'small', kind: 'half-decker' },
  'Sea Swallow': { size: 'small', kind: 'half-decker' },
  'Constant Star': { size: 'large', kind: 'trading ketch' },
  'Brídín': { size: 'small', kind: 'currach', gloss: 'little Bríd' },
  'Faithful': { size: 'medium', kind: 'lugger' },
  'Caoimhe': { size: 'small', kind: 'currach' },
  'Shearwater': { size: 'small', kind: 'punt' },
  'Áine': { size: 'medium', kind: 'fishing boat' },
  'Little Grace': { size: 'small', kind: 'half-decker' },
  'Willing Hand': { size: 'medium', kind: 'lugger' },
  'Éan Mara': { size: 'small', kind: 'currach', gloss: 'seabird' },
  'Fair Weather': { size: 'medium', kind: 'fishing boat' },
  'Tonn Ghorm': { size: 'medium', kind: 'fishing boat', gloss: 'blue wave' },
  'Muirín': { size: 'small', kind: 'currach' },
  'Second Wind': { size: 'medium', kind: 'lugger' },
  'The Gannet': { size: 'medium', kind: 'fishing boat' },
  'Homeward': { size: 'large', kind: 'coasting steamer' },
  'Neasa': { size: 'small', kind: 'currach' },
  'Mo Stór': { size: 'small', kind: 'currach', gloss: 'my treasure' },
  'Bláth Bán': { size: 'small', kind: 'half-decker', gloss: 'white blossom' },
  'An Bradán': { size: 'medium', kind: 'fishing boat', gloss: 'the salmon' },
  'Margaret Anne': { size: 'large', kind: 'trading ketch' },
  'Glór na Farraige': { size: 'medium', kind: 'lugger', gloss: 'voice of the sea' },
  'Lantern': { size: 'small', kind: 'punt' },
  'Whin Blossom': { size: 'small', kind: 'half-decker' },
  'Brightwater': { size: 'large', kind: 'coasting steamer' },
  'Bríd Óg': { size: 'small', kind: 'currach', gloss: 'young Bríd' },
  'Solas Beag': { size: 'small', kind: 'currach', gloss: 'little light' },
};

export function ship(name) {
  const s = SHIPS[name];
  if (!s) throw new Error('Unknown ship ' + name);
  return { name, ...s };
}
