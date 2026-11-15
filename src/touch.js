// Phone / tablet controls. Left half: a floating joystick that presses W/A/S/D. Right half: drag to look.
// Buttons send the same key codes the keyboard does, so the game logic stays in one place (main.js).
export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;

export function makeTouch({ keys, look, press, canPlay }) {
  document.body.classList.add('touch');
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="t-joy"><div id="t-knob"></div></div>
    <div class="t-btns">
      <button data-k="KeyE" class="big">E<small>Use</small></button>
      <button data-run>🏃<small>Run</small></button>
      <button data-k="KeyV" class="drv">🎥<small>View</small></button>
    </div>
    <div class="t-top">
      <button data-k="Tab">🛰️<small>Mission</small></button>
      <button data-k="KeyJ">📋<small>Tasks</small></button>
      <button data-pause>⏸</button>
    </div>`;
  document.body.appendChild(root);
  const joy = root.querySelector('#t-joy'), knob = root.querySelector('#t-knob');
  const R = 55;                                   // joystick radius in px
  let stick = null, lookId = null, lx = 0, ly = 0;

  const setMove = (x, y) => {                     // x,y in -1..1 -> the walk/drive keys
    keys.KeyW = y < -0.35; keys.KeyS = y > 0.35; keys.KeyA = x < -0.35; keys.KeyD = x > 0.35;
  };
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !canPlay() || e.target.closest('button, .mc-panel, #dialogue, #start, .mc-coach, .in-skip')) return;
    if (e.clientX < innerWidth / 2 && !stick) {
      stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      joy.style.left = `${e.clientX}px`; joy.style.top = `${e.clientY}px`; joy.classList.add('on');
      knob.style.transform = 'translate(-50%,-50%)';
    } else if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
  });
  addEventListener('pointermove', (e) => {
    if (stick && e.pointerId === stick.id) {
      let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
      const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      setMove(dx / R, dy / R);
    } else if (e.pointerId === lookId) {
      look(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
    }
  });
  const up = (e) => {
    if (stick && e.pointerId === stick.id) { stick = null; joy.classList.remove('on'); setMove(0, 0); }
    if (e.pointerId === lookId) lookId = null;
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) press(b.dataset.k);
    else if (b.dataset.run) { keys.ShiftLeft = !keys.ShiftLeft; b.classList.toggle('on', keys.ShiftLeft); }
    else if (b.dataset.pause) press('pause');
  });
  return {
    show(on) { root.style.display = on ? 'block' : 'none'; if (!on) { stick = null; lookId = null; joy.classList.remove('on'); setMove(0, 0); } },
    driving(on) { root.classList.toggle('driving', on); },
  };
}
