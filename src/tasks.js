// Crew tasks: one real decision per sol. Every choice changes the outpost sim (src/sim.js) and none is free.
// who = an NPC id or a target in the base (panel, monolith). apply(m, bonus) changes the mission state.
export const TASKS = [
  { id: 'welcome', sol: 1, who: 'commander', title: 'Meet the Commander in the Main Hub',
    say: ['Welcome to the Moon base, Junior Astronaut! You will run this outpost for 7 sols. A sol is one mission day.',
      'Every sol a crew member will ask you to decide something. No choice is free: each one costs power, supplies or safety.',
      'Press Tab to open Mission Control, share today\'s power, then end the sol there.'],
    fact: ['NASA\'s Artemis astronauts will land near the Moon\'s South Pole, where the Sun stays low and long shadows are everywhere.', 'NASA Artemis program'] },

  { id: 'battery', sol: 2, who: 'engineer', title: 'Help the Systems Engineer in the Power Room',
    say: ['Trouble! The cold night cracked one of our battery cells.',
      'I can repair it today, but the repair needs power. Or we skip it and live with a smaller battery.'],
    choices: [
      { label: 'Repair it now (−4 ⚡ today)', apply: (m) => { m.todayLoad += 4; },
        result: 'Repair done. It used 4 ⚡ today, but the battery still holds 20 ⚡ for dark days.' },
      { label: 'Skip it (battery holds only 15 ⚡)', apply: (m) => { m.batteryMax = 15; m.battery = Math.min(m.battery, 15); },
        result: 'No power spent today, but now the battery holds only 15 ⚡. Shadowy days will be harder.' }],
    fact: ['A night on the Moon lasts about 14 Earth days, so a Moon base needs big batteries or another power source to survive it.', 'NASA Moon facts (science.nasa.gov/moon)'] },

  { id: 'filter', sol: 3, who: 'panel', title: 'Check the Life Support panel in the Power Room',
    say: ['LIFE SUPPORT: carbon dioxide filter is worn out. Air cleaning is slower.',
      'A spare filter is in the emergency supply kit.'],
    choices: [
      { label: 'Fit the spare filter (−0.4 day of supplies)', apply: (m) => { m.supplies -= 0.4; },
        result: 'Fresh filter fitted. The air machine is back to full strength, but the emergency kit is smaller now.' },
      { label: 'Keep the old filter (air machine 15% weaker)', apply: (m) => { m.lifeEff = 0.85; },
        result: 'Supplies saved for now, but every sol the air machine will make 15% less.' }],
    fact: ['Each astronaut breathes out about 1 kg of carbon dioxide a day. On the space station a machine pulls it out of the air so nobody gets sick.', 'NASA ISS life support (ECLSS)'] },

  { id: 'crop', sol: 4, who: 'science', title: 'Plan the greenhouse with the Science Officer',
    say: ['Our greenhouse is ready for new seeds. What should we grow?',
      'Lettuce is fast. Potatoes are slow at first but give much more food later, if the greenhouse gets power.'],
    choices: [
      { label: 'Lettuce (+0.1 day of food now)', apply: (m) => { m.supplies += 0.1; m.greenPlan = 'lettuce'; },
        result: 'Crunchy lettuce is ready already! A small boost now, nothing extra later.' },
      { label: 'Potatoes (half food for 2 sols, then +80%)', apply: (m) => { m.greenPlan = 'potato'; m.greenSince = m.sol; },
        result: 'Potatoes planted. The greenhouse makes half the food for 2 sols, then 80% more. Keep giving it power!' }],
    fact: ['In 2015 astronauts on the space station ate the first lettuce grown in space, from NASA\'s Veggie experiment (VEG-01).', 'NASA Veggie · data in NASA OSDR'] },

  { id: 'sample', sol: 4, who: 'monolith', title: 'Collect a regolith sample at the Monolith (outside!)',
    say: ['Sample collected: fine grey dust with very sharp grains. +15 science points!',
      'Being outside used suit air. On a storm day it would also have meant a lot of radiation.'],
    apply: (m, bonus) => bonus(15, 'regolith sample'),
    fact: ['Moon dust is sharp like broken glass because there is no wind or water to round the grains. Apollo crews brought back 382 kg of Moon rock and soil.', 'NASA Apollo lunar samples'] },

  { id: 'call', sol: 5, who: 'commander', title: 'Live call with Earth: ask the Commander',
    say: ['Schools on Earth want a live video call with our base today!',
      'A video call needs the big antenna, and that needs power.'],
    choices: [
      { label: 'Yes, call Earth (−5 ⚡ today, +12 science)', apply: (m, bonus) => { m.todayLoad += 5; bonus(12, 'live call with Earth'); },
        result: 'Thousands of kids heard you! Every answer took 1.3 s to reach Earth, so the talk had little pauses.' },
      { label: 'No, save the power', apply: () => {},
        result: 'Power saved for air, food and the shield. The schools will have to wait.' }],
    fact: ['Radio travels at the speed of light: 1.3 s from the Moon to Earth, but 3 to 22 minutes from Mars, so a Mars crew can never have a live chat with Earth.', 'NASA Deep Space Network'] },
];

// when Earth's forecast says a storm hits today, the Commander asks where the crew should be
const shelter = (sol) => ({
  id: `shelter@${sol}`, sol, who: 'commander', title: 'Storm today! Talk to the Commander', storm: true,
  say: ['Earth warned us: a solar storm hits today.',
    'We can move into the storm shelter in the middle of the base, behind the water tanks. But nobody can work in the lab there.'],
  choices: [
    { label: 'Go to the shelter (+30% protection, half science)', apply: (m) => { m.shelter = true; },
      result: 'Everyone is in the shelter. Much safer, but the lab work waits.' },
    { label: 'Keep working (full science, only the shield protects)', apply: () => {},
      result: 'The crew keeps working. Make sure the shield has power in Mission Control!' }],
  fact: ['NASA\'s Orion spacecraft has no special storm room: in a solar storm the crew builds a shelter from bags of supplies and water, which block radiation.', 'NASA Orion / Artemis II'],
});

// tasks the player can do right now (earlier undone tasks stay open), and the whole list for the HUD
export function openTasks(m) {
  const list = TASKS.filter((t) => t.sol <= m.sol && !m.done.includes(t.id));
  if (m.sol > 1 && m.forecastKnown && m.storms[m.sol - 1] && !m.done.includes(`shelter@${m.sol}`)) list.unshift(shelter(m.sol));
  return list.sort((a, b) => !!b.choices - !!a.choices);   // decisions first: they block the end of the sol
}
export function allTasks(m) {
  const list = [...TASKS];
  if (m.sol > 1 && m.forecastKnown && m.storms[m.sol - 1]) list.push(shelter(m.sol));
  return list;
}
