/**
 * 배치(Layout)를 화면에 그리고, 터치를 입력 상태로 바꾼다. 네트워크는 모른다.
 */
import { neutralInput } from '@digitus/protocol';

/**
 * @typedef {import('@digitus/protocol').Layout} Layout
 * @typedef {import('@digitus/protocol').InputState} InputState
 * @typedef {import('@digitus/protocol').StickControl} StickControl
 * @typedef {import('@digitus/protocol').ButtonControl} ButtonControl
 */

const DEFAULT_RADIUS = { stick: 0.3, button: 0.12 };

/** 메시지를 작게 — 입력 정밀도는 이 정도면 충분하다. @param {number} n */
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {HTMLElement} root
 * @param {Layout} layout
 * @param {(state: InputState) => void} onChange
 */
export function createPad(root, layout, onChange) {
  const state = neutralInput(layout);
  /** @type {(() => void)[]} */
  const resets = [];

  root.replaceChildren();
  for (const control of layout.controls) {
    const el = document.createElement('div');
    const r = control.r ?? DEFAULT_RADIUS[control.type];
    el.className = control.type;
    el.style.left = `${control.x * 100}%`;
    el.style.top = `${control.y * 100}%`;
    el.style.width = el.style.height = `${r * 200}vmin`;
    root.append(el);
    resets.push(control.type === 'stick' ? bindStick(el, control) : bindButton(el, control));
  }

  /** @param {HTMLElement} el @param {StickControl} control */
  function bindStick(el, control) {
    const knob = document.createElement('div');
    knob.className = 'knob';
    el.append(knob);
    /** @type {number | null} */
    let pointerId = null;

    /** @param {number} x @param {number} y */
    function set(x, y) {
      state.sticks[control.id] = [round(x), round(y)];
      // 손잡이 지름 = 스틱의 40%(style.css 의 inset 30%). 가장자리까지 스틱의 30% = 손잡이의 75%.
      knob.style.transform = `translate(${x * 75}%, ${y * 75}%)`;
      onChange(state);
    }

    /** @param {PointerEvent} e */
    function move(e) {
      const rect = el.getBoundingClientRect();
      const radius = rect.width / 2;
      let x = (e.clientX - (rect.left + radius)) / radius;
      let y = (e.clientY - (rect.top + radius)) / radius;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      set(x, y);
    }

    function release() {
      pointerId = null;
      el.classList.remove('active');
      set(0, 0);
    }

    el.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add('active');
      move(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointerId) move(e);
    });
    for (const type of /** @type {const} */ (['pointerup', 'pointercancel'])) {
      el.addEventListener(type, (e) => {
        if (e.pointerId === pointerId) release();
      });
    }
    return release;
  }

  /** @param {HTMLElement} el @param {ButtonControl} control */
  function bindButton(el, control) {
    el.textContent = control.label ?? control.id;
    /** @type {Set<number>} */
    const pointers = new Set();

    /** @param {boolean} down */
    function set(down) {
      if (state.buttons[control.id] === down) return;
      state.buttons[control.id] = down;
      el.classList.toggle('active', down);
      if (down) navigator.vibrate?.(10);
      onChange(state);
    }

    el.addEventListener('pointerdown', (e) => {
      // 터치는 누른 요소에 자동으로 붙잡혀 pointerleave 가 오지 않는다 — 풀어준다.
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      pointers.add(e.pointerId);
      set(true);
    });
    // 손가락이 버튼 밖으로 미끄러지면 뗀 것으로 본다.
    for (const type of /** @type {const} */ (['pointerup', 'pointercancel', 'pointerleave'])) {
      el.addEventListener(type, (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size === 0) set(false);
      });
    }
    return () => {
      pointers.clear();
      set(false);
    };
  }

  return {
    /** 모든 입력을 뗀다(앱 전환 등으로 pointerup 을 못 받을 때). */
    releaseAll() {
      for (const reset of resets) reset();
    },
    destroy() {
      root.replaceChildren();
    },
  };
}
