# Junior Astronaut Mission Trainer (playable)

First-person browser game built with three.js from the Blender models in `../3D MODELS`.

## Play
```bash
npm install
npm run dev
```
Open http://localhost:5173 and click **Click to play**.

Controls: WASD move · mouse look · Shift run · Space jump (1/6 g) · E talk/interact · Tab mission tablet · Esc pause.

Rover (Perseverance, `src/rover.js`): walk up to it and press E. W/S drive, A/D steer (it turns on the spot), Shift boost,
mouse orbits the chase camera, V toggles the Mastcam view, E gets out. The map has an invisible edge 8 m inside the terrain.

Mission: Commander → Systems Engineer (Power Room) → reset power panel → Science Officer (Science Lab) → sample at the Monolith → Science Officer → Commander.

## The outpost game (NASA Space Apps challenge)
Kids (7-12) run the base for 7 sols. Press **Tab** for Mission Control: each sol the solar panels make a fixed
amount of power, and the player shares it between the **air & water machine**, the **greenhouse (food)**, the
**radiation shield**, the **science lab** and a **report to Earth** (which brings back tomorrow's storm forecast after
a real 2.6 s Moon-Earth light delay). Three things must stay healthy: **battery**, **supplies** (days of air, water and
food) and the crew's **radiation dose**. No choice is free: power for shielding or science is power not spent on air or
food. Going outside or driving the rover costs suit air and adds dose, a lot during a storm. Every sol ends with a
plain-language report of what happened and why, plus a real fact with its source.

Rules: `src/sim.js` (no DOM; self-test `node src/sim.test.mjs`). UI: `src/mission.js`.

### NASA data used
- **DONKI (Space Weather Database)**: every storm is a real Solar Energetic Particle event (35 storm days, 2012-2015,
  stored in `src/data/donki_sep.json`), drawn at random each game. Strength from the detecting instrument
  (GOES >100 MeV = strong, GOES/SOHO = medium, STEREO only = weak). The game also queries DONKI live
  (last 30 days, `DEMO_KEY`); a real storm in the past week starts the mission with one. If the API is unreachable
  the game says so and uses the archive; archived data is never shown as live.
- **Radiation**: lunar surface dose ~1.4 mSv/day (Chang'e-4 LND, Zhang et al. 2020); NASA-STD-3001 career limit 600 mSv.
- **Life support**: 0.84 kg O2 per astronaut per day (NASA BVAD); ISS ~98% water recovery (NASA 2023).
- **Food**: NASA Veggie (VEG-01) lettuce on the ISS, data in NASA OSDR.
- Power amounts, supply rates, shield strength, storm doses and the 150 mSv game limit are simplified game values
  (stated in the in-game "Science sources" page).

## Rebuild the models (Blender 4.2 LTS)
The GLBs in `public/models` come from the Blender scripts:
- `lunar_map (1).py` → `export_environment_glb()` gives `lunar_terrain/base/monolith.glb` + `sites.json`
- `perseverance.glb`: NASA's Perseverance model (NASA 3D Resources #25042), used as the drivable rover.
- `inventory_tablet.py` → `~/JUNIOR_ASTRONAUT_OUTPUT/INVENTORY_TABLET/`; copy the `.glb` here.

The moon base itself is built in code (`src/base.js`): same 9-room layout as the Blender habitat, with a regolith
shield, pocket doors, trims, lights and furnished rooms. The Blender habitat inside `lunar_base.glb` is removed at load;
the solar field, comms, rocks and landing zone from that file are kept. Textures in `public/textures/` are CC0 from
ambientCG (no attribution required). Lighting adds GTAO ambient occlusion; first-person arms are drawn after it.

The player is "Astronaut" by Jungle Jim (CC BY 4.0, `public/models/player_astronaut.glb`): its own arms are shown in first person and its body below (`src/player.js`). The crew NPCs are built in code (`src/astronaut.js`), and all textures are generated in
`src/textures.js`, because the exported models have flat colours and no UVs. `/viewer.html?m=rover.glb` previews one model.

Run the environment build headless with a small driver:
```python
import runpy, os, json
os.environ['LUNAR_ASSET_DIR'] = r"D:\NASA\3D MODELS"
g = runpy.run_path(r"D:\NASA\3D MODELS\lunar_map (1).py", run_name='lunar_map')
sites = g['build_lunar_environment']()
json.dump({k: {kk: vv for kk, vv in v.items() if isinstance(vv, (int, float))} for k, v in sites.items()},
          open(r"D:\NASA\game\public\models\sites.json", 'w'))
g['export_environment_glb'](r"D:\NASA\game\public\models")
```
`blender -b --factory-startup --python that_driver.py`

## Publish
`npm run build` → upload the `dist/` folder to any static host (Netlify, GitHub Pages).

Dev only: `?test` in the URL skips pointer lock and exposes `window.game` for automated checks.
