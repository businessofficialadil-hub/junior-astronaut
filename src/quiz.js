// Crew Debrief: 3 short questions at the end, picked from the facts this player actually met in the game.
// a[0] is always the right answer; the screen shuffles the order.
export const QUESTIONS = [
  { from: 'always', q: 'Earth says a big solar storm comes tomorrow. What is the best plan?',
    a: ['Give the radiation shield more power', 'Turn the shield off to save power', 'Go for a long walk outside'],
    why: 'Solar storms throw out fast particles. Shielding (and staying inside) keeps the crew\'s dose low.' },
  { from: 'always', q: 'You give 2 more ⚡ to the science lab. What happens?',
    a: ['Another job gets 2 ⚡ less', 'Nothing else changes, power is free', 'The solar panels make 2 ⚡ more'],
    why: 'The base only has so much power. Every ⚡ you give one job is a ⚡ another job can\'t use.' },
  { from: 'call', q: 'How long does a radio message take from Mars to Earth?',
    a: ['3 to 22 minutes', '1.3 seconds', 'One whole day'],
    why: 'Radio travels at the speed of light. From the Moon it takes 1.3 s, but Mars is much farther away.' },
  { from: 'crop', q: 'Which vegetable did astronauts eat first that was grown in space?',
    a: ['Lettuce', 'Potato', 'Carrot'],
    why: 'In 2015 the space station crew ate red romaine lettuce from NASA\'s Veggie experiment.' },
  { from: 'filter', q: 'What does the life support filter take out of the air?',
    a: ['Carbon dioxide, the gas we breathe out', 'Oxygen', 'Water'],
    why: 'Each astronaut breathes out about 1 kg of carbon dioxide a day. Too much of it makes people sick.' },
  { from: 'battery', q: 'Why does a Moon base need big batteries?',
    a: ['A night on the Moon lasts about 14 Earth days', 'The Moon has no air to burn', 'Batteries make oxygen'],
    why: 'Solar panels make nothing in the dark, so the base must save power for the long lunar night.' },
  { from: 'sample', q: 'Why is Moon dust so sharp?',
    a: ['No wind or water ever rounded the grains', 'It is made of broken glass bottles', 'It is frozen ice'],
    why: 'On Earth, wind and water smooth sand grains. The Moon has neither, so its dust stays jagged.' },
  { from: 'shelter', q: 'What can a crew use to build a radiation shelter in a spaceship?',
    a: ['Bags of water and supplies', 'Glass windows', 'Nothing, radiation can\'t be blocked'],
    why: 'Water and packed supplies absorb radiation. NASA\'s Orion crew stack them around themselves in a storm.' },
];

// questions about things this player met (done task ids, e.g. 'shelter@6' counts as 'shelter') + the always-on ones
export function pickQuestions(done, rand = Math.random, n = 3) {
  const seen = new Set(done.map((id) => id.split('@')[0]));
  const pool = QUESTIONS.filter((x) => x.from === 'always' || seen.has(x.from));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n).map((x) => {
    const order = x.a.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return { q: x.q, why: x.why, options: order.map((i) => x.a[i]), right: order.indexOf(0) };
  });
}
