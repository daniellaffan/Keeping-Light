// Day vignettes. A line is either narration (a string), or [speaker, text]. Speaker 'keeper' is the
// Keeper's own thought, written in their hand. Keep them short: 30–90 seconds of reading.

export const PLACES = {
  lighthouse: { label: 'the lighthouse', sub: 'lamp room and shed' },
  cliff: { label: 'the cliff path', sub: 'along the headland' },
  village: { label: 'the village', sub: 'shop and pub' },
  harbour: { label: 'the harbour', sub: 'the slip and the wall' },
  cottages: { label: 'the cottages', sub: 'up the back road' },
  school: { label: 'the schoolhouse', sub: 'by the church wall' },
};

export const ARRIVAL = {
  place: 'arrival',
  title: 'Ceann Bán',
  lines: [
    'The road gives out a mile short of the headland. You walk the rest with the bag, the wind at your back.',
    'The station is whitewashed and tidy. The range is set. A clean cup sits upside down on the draining board.',
    'In the lamp room the brass has been polished, and the logbook lies open on the desk with a pencil laid across it.',
    ['keeper', 'As if they had only stepped out.'],
    'The sun is going down behind the stacks. It will be dusk soon.',
  ],
};

export const VIGNETTES = {
  // ---------------- Act One ----------------
  2: {
    village: {
      title: 'The shop',
      lines: [
        'Port na Rón is one street running down to the harbour. The shop has a bell over the door and smells of firelighters and oranges.',
        ['Nora', 'You\'ll be the new keeper. You\'re very welcome. The bread is fresh, the milk is yesterday\'s, but it\'s grand.'],
        'You ask her about the last keeper.',
        ['Nora', 'Ah, sure everyone knew everyone. Will you want paraffin? You\'ll want paraffin.'],
        'Tadhg is on the bench outside, mending a net that doesn\'t look torn.',
        ['Tadhg', 'The last keeper? Gone off drinking with Manannán, I\'d say. Where else would a keeper go.'],
        ['Tadhg', 'Manannán mac Lir. Lives out past the stacks. Owns the fog. Owes me a fiver.'],
        'He laughs at his own joke. Nora rings up the bread and talks about the weather.',
      ],
    },
    lighthouse: {
      title: 'The oil shed',
      lines: [
        'You count the paraffin drums in the shed. Twelve, all full.',
        'You write it on the inside of the door with a stub of pencil, under a long column of other people\'s numbers.',
        ['keeper', 'Twelve. Good.'],
      ],
    },
  },
  3: {
    cliff: {
      title: 'The cliff path',
      lines: [
        'The path runs along the top of the headland, between the wall and the drop.',
        'Fulmars hang in the updraught at eye level, not moving their wings at all.',
        'Sheep. One of them watches you the whole way along, with opinions.',
        'From the end of the path you can see the whole bay: the Sisters, the Black Rock, the harbour wall, the village smoke going straight up.',
        ['keeper', 'I could stay here years.'],
      ],
    },
    village: {
      title: 'The shop',
      lines: [
        ['Nora', 'Were you out on the cliff yet? Mind the edge. The grass goes right to it and then it doesn\'t.'],
        ['Nora', 'High water tonight. You\'ll know that, of course. It\'s in the book.'],
      ],
    },
  },
  4: {
    harbour: {
      title: 'The harbour wall',
      lines: [
        'Soft rain coming in off the sea. Tadhg\'s boat is pulled up on the slip.',
        ['Tadhg', 'Low water tonight. You\'ll see the Pan showing her back, and the Bar. Don\'t go trusting the middle.'],
        'A girl is drawing on the harbour wall in chalk, out of the rain under the lip of the wall. A lighthouse, a long beam, little boats.',
        ['Tadhg', 'That\'s Síle. She doesn\'t say much. She draws.'],
        'Síle adds one more boat at the end of the beam, looks up at you, then rubs it out with her sleeve.',
      ],
    },
    village: {
      title: 'The shop',
      lines: [
        ['Nora', 'Wet one. Here — take the umbrella, there\'s a dozen of them in the back that nobody ever came for.'],
      ],
    },
  },
  5: {
    village: {
      title: 'The shop',
      lines: [
        ['Nora', 'Five nights and not a boat lost. They\'re all talking about it.'],
        ['Nora', 'You\'re doing grand, you know. Honestly. Better than—'],
        'She stops, and folds the top of the paper bag over twice.',
        ['Nora', 'Better than grand. Go on, now. You\'ll miss your sunset.'],
      ],
    },
    cliff: {
      title: 'The cliff path',
      lines: [
        'The sky is turning gold already, hours early it seems. The sea under it is the colour of a church window.',
        'You stay longer than you meant to.',
      ],
    },
  },
  // ---------------- Act Two ----------------
  6: {
    harbour: {
      title: 'The harbour in the haar',
      lines: [
        'The haar came in at noon. The harbour wall walks out into it and doesn\'t come back.',
        ['Tadhg', 'That\'s himself pulling his cloak over. Manannán. He does that when he doesn\'t want to be looked at.'],
        ['Tadhg', 'Ah, I\'m only codding you. It\'s fog. Warm sea, cold air. Science.'],
        'Somewhere out in the white, a gull complains about it.',
      ],
    },
    cliff: {
      title: 'The cliff path',
      lines: [
        'You can\'t see the bottom of the cliff today. The sea is only a sound.',
        'A sheep comes out of the fog, looks at you, and goes back into it.',
      ],
    },
  },
  7: {
    village: {
      title: 'The pub',
      lines: [
        'The pub is two rooms and a turf fire. Tadhg is there, and two old men who nod and say nothing.',
        ['Tadhg', 'Will you have one? No? Keeper\'s rules. The last keeper had the same rules, and look where it got them. Out with Manannán every night.'],
        'One of the old men laughs. The other looks into the fire.',
        ['Tadhg', 'I\'m codding. I\'m codding you.'],
      ],
    },
    cliff: {
      title: 'The cliff path',
      lines: [
        'The fulmars are gone from the ledges. It\'s late in the year for them, you suppose.',
        'From the end of the path you count the boats moored in the harbour: none. They\'ll all be out.',
      ],
    },
  },
  8: {
    lighthouse: {
      title: 'The oil shed',
      lines: [
        'You count the paraffin drums. Nine.',
        'On the inside of the door, in your own hand: twelve.',
        ['keeper', 'I must have used more than I thought. It\'s been windy.'],
      ],
    },
    village: {
      title: 'The shop',
      lines: [
        ['Nora', 'Raining yet? It will. Fran—'],
        'She stops.',
        ['Nora', 'The last keeper. The last keeper used to say the rain came in on the third wave. I never knew what that meant.'],
        'She gives you your change twice, and doesn\'t notice.',
      ],
    },
  },
  9: {
    village: {
      title: 'The shop',
      lines: [
        'Síle is sitting on the floor of the shop with her paper and a stub of crayon.',
        'She is drawing boats. A long line of them, all the same size, all with one small light.',
        ['Nora', 'Don\'t mind her. She\'s always at it.'],
      ],
    },
    harbour: {
      title: 'The harbour',
      lines: [
        ['Tadhg', 'Haar again! Himself is in a mood. Did you leave him short?'],
        'He laughs quickly, before you\'ve answered.',
        ['Tadhg', 'Fra— the old keeper used to leave a drop out for him on the wall. Every night. Ha.'],
        'He looks at the wall. There\'s a small clean ring on the stone, as if a cup had stood there a long time.',
      ],
    },
  },
  10: {
    cliff: {
      title: 'The cliff path',
      lines: [
        'From the end of the path you check the rocks in the bay against the chart, one by one, the way the old keeper must have.',
        'There is one more than the chart has. Out past the Comb, black and wet.',
        ['keeper', 'It must always have been there. Low water. That\'s all.'],
      ],
    },
    village: {
      title: 'The shop',
      lines: [
        ['Nora', 'You\'re looking tired. Are you sleeping?'],
        ['Nora', 'Don\'t be up all night at the glass. They\'ll come in whether you watch them or not.'],
        'She says it as though she\'d said it before, to someone else.',
      ],
    },
  },
  11: {
    village: {
      title: 'The pub',
      lines: [
        ['Tadhg', 'Fog again. Manannán! Manannán and his cloak. Ha!'],
        'He laughs before he has finished saying it, and then he doesn\'t seem to know what to do with his hands.',
        ['Tadhg', 'You\'ll be sick of me and my old jokes.'],
        ['Nora', 'Don\'t mind him.'],
        'Walking home, you count the lit windows. There are fewer than last week.',
      ],
    },
    harbour: {
      title: 'The harbour',
      lines: [
        'Nobody on the slip today. Tadhg\'s net lies folded on the wall, dry.',
        'Out in the haar, very faintly, you think you hear him laughing.',
      ],
    },
  },
  // ---------------- Act Three ----------------
  12: {
    cottages: {
      title: 'The cottages',
      lines: [
        'The doors up the back road open now when you try them. None of them were ever locked.',
        'Furniture under dust sheets. A clock stopped at ten past four. Hearths swept, and cold.',
        'The dust lies very even on the sills, as if nobody had stood at these windows for a long time.',
        ['keeper', 'They\'ll have moved to the town. People do.'],
      ],
    },
    village: {
      title: 'The shop',
      lines: [
        'Nora is behind the counter, but she doesn\'t look up when the bell goes.',
        ['Nora', 'You were up at the cottages.'],
        ['Nora', 'Mind yourself up there.'],
      ],
    },
  },
  13: {
    cottages: {
      title: 'A cottage',
      lines: [
        'In the last cottage, a child\'s drawing is pinned to the dresser.',
        'The lighthouse, the beam drawn very long. And beside the tower, standing in the grey of the sea, a tall shape, with something around it like a cloak.',
        'In the corner, in careful letters: Síle, aged 9, September 1957.',
        'You put it in your coat pocket. It seems wrong to leave it.',
      ],
    },
    harbour: {
      title: 'The harbour',
      lines: [
        'Tadhg\'s boat is on the slip where it always is.',
        'There is grass growing up between the planks.',
      ],
    },
  },
  14: {
    school: {
      title: 'The schoolhouse',
      lines: [
        'Desks in rows, two to a bench. The inkwells are dry.',
        'On the blackboard, in a teacher\'s round hand: Friday 13th September 1957.',
        'Under it, smaller, a child has drawn the lamp in chalk, and a line of little boats going out.',
        'The chalk is still on the ledge. Nobody has touched it.',
      ],
    },
    cottages: {
      title: 'The cottages',
      lines: [
        'A pair of boots by a door, laced, as though someone had just stepped out of them.',
        'A calendar on the wall. September. The page has never been turned.',
      ],
    },
  },
  15: {
    village: {
      title: 'The shop',
      lines: [
        'The shop is empty. The shelves are bare, and the bell over the door doesn\'t ring.',
        'From the back room, quite clearly, Nora\'s voice:',
        ['Nora', 'You\'re doing grand.'],
        'There is nobody in the back room. There\'s a calendar, and a chair, and the dust.',
      ],
    },
    school: {
      title: 'The schoolhouse',
      lines: [
        'Síle\'s desk is by the window. Someone has scratched a lighthouse into the lid, a long time ago, and gone over it many times.',
      ],
    },
  },
  // ---------------- The final night ----------------
  16: {
    harbour: {
      title: 'The harbour',
      lines: [
        'The harbour is empty. No boats on the slip, no net on the wall, nobody on the bench.',
        'The water inside the wall is very still and very clear. It shows the sky a moment late.',
        ['keeper', 'Tonight, then.'],
      ],
    },
    lighthouse: {
      title: 'The lamp room',
      lines: [
        'You fill the lamp. You trim the wick. You wind the clock.',
        'The haar is pressed right up against the glass.',
      ],
    },
  },
  // ---------------- Epilogue ----------------
  17: {
    lighthouse: {
      title: 'The lamp room',
      lines: [
        'The stairs are colder than they were.',
        'You polish the brass, though there is nobody to see it.',
      ],
    },
  },
  18: {
    lighthouse: {
      title: 'The gallery',
      lines: [
        'You sit out on the gallery all afternoon and talk to the water.',
        'It answers the way it does: a little late.',
      ],
    },
  },
  19: {
    lighthouse: {
      title: 'The lamp room',
      lines: [
        'There is nothing to do but wait for dusk.',
        'You don\'t mind.',
      ],
    },
  },
};

// Used when a place has nothing particular to say that day.
export const QUIET = {
  lighthouse: {
    1: ['You clean the lamp glass, wind the clock, and sit a while on the step with the tea.', 'Gulls on the wall. The kettle ticking as it cools.'],
    2: ['You clean the lamp glass and wind the clock.', 'The fog leaves beads of water on the brass, however often you wipe it.'],
    3: ['The lamp room is quiet. You wind the clock.', 'The paraffin smell has got into everything — your coat, the pages, your hands.'],
  },
  cliff: {
    1: ['Wind on the cliff path, gorse in flower, the sea a long way down.'],
    2: ['The cliff path is wet and grey. You don\'t go as far as the end.'],
    3: ['The wall along the path has fallen in places. No sheep today.'],
  },
  village: {
    1: [['Nora', 'Grand day for it.'], 'You buy matches and a quarter of tea.'],
    2: [['Nora', 'Mind yourself going back up.'], 'She doesn\'t ask about the boats.'],
    3: ['The street is quiet. The shop door is open. Nobody comes.'],
  },
  harbour: {
    1: ['Tadhg is out in the boat. The slip smells of weed and tar.'],
    2: ['The harbour is quiet. The tide is going out.'],
    3: ['The harbour is empty. Weed on the slip, dry.'],
  },
  cottages: {
    3: ['Dust sheets. Cold hearths. A cup on a hook.'],
  },
  school: {
    3: ['Desks in rows. Dry inkwells. The date on the board.'],
  },
};

// The night's places marked as "something here" on the headland map get this pencil tick.
export const MAP_WORDS = {
  heading: 'Where to spend the afternoon',
  then: 'then dusk, and the lamp',
};
