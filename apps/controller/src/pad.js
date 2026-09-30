/**
 * 화면 터치를 입력으로 바꾼다. 네트워크는 모른다.
 *
 * 플레이어는 폰을 보지 않고 조작한다 — 그래서 아무것도 그리지 않고, 정해진 자리도 없다.
 * 화면을 반으로 나눠, 손가락이 **처음 닿은 쪽**이 그 손가락의 역할을 정한다.
 * - 왼쪽: 스틱. 닿은 곳이 중심, 끌면 그 방향·거리. 반지름 밖으로 끌면 중심이 따라와 반대로 꺾을 때 바로 반응한다.
 * - 오른쪽: 제스처(탭·스와이프·홀드).
 * 폰 방향은 상관없다 — 지금 화면의 왼쪽·오른쪽 절반이다.
 */

/**
 * @typedef {import('@digitus/protocol').InputState} InputState
 * @typedef {import('@digitus/protocol').Gesture} Gesture
 */

/** 스틱을 끝까지 기울이는 거리. 화면 짧은 변 대비. */
const STICK_RADIUS = 0.15;
/** 이만큼 쓸면 스와이프. 화면 짧은 변 대비. */
const SWIPE_DISTANCE = 0.08;
/** 이 시간 넘게 제자리에 누르고 있으면 홀드. */
const HOLD_MS = 350;

/** 메시지를 작게 — 입력 정밀도는 이 정도면 충분하다. @param {number} n */
const round = (n) => Math.round(n * 1000) / 1000;

/** 화면 짧은 변(px). 방향을 바꾸면 달라지므로 매번 잰다. */
const shortSide = () => Math.min(innerWidth, innerHeight);

/**
 * @param {HTMLElement} root 터치를 받을 요소(화면 전체)
 * @param {{
 *   onStick: (state: InputState) => void,
 *   onGesture: (gesture: Gesture) => void,
 * }} handlers
 */
export function createPad(root, { onStick, onGesture }) {
  /** @type {InputState} */
  const state = { stick: [0, 0] };

  // ── 왼쪽: 스틱 ──
  /** @type {number | null} */
  let stickId = null;
  let originX = 0;
  let originY = 0;

  /** @param {number} x @param {number} y */
  function setStick(x, y) {
    state.stick = [round(x), round(y)];
    onStick(state);
  }

  /** @param {PointerEvent} e */
  function moveStick(e) {
    const radius = shortSide() * STICK_RADIUS;
    let dx = e.clientX - originX;
    let dy = e.clientY - originY;
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      // 중심을 손가락 쪽으로 끌어와, 손가락은 늘 반지름 위에 있게 한다.
      originX += dx * (1 - radius / len);
      originY += dy * (1 - radius / len);
      dx *= radius / len;
      dy *= radius / len;
    }
    setStick(dx / radius, dy / radius);
  }

  function releaseStick() {
    if (stickId === null) return;
    stickId = null;
    setStick(0, 0);
  }

  // ── 오른쪽: 제스처 ──
  /** @type {number | null} */
  let gestureId = null;
  let startX = 0;
  let startY = 0;
  /** 이 손가락이 이미 제스처를 냈으면(스와이프·홀드) 뗄 때 탭으로 치지 않는다. */
  let fired = /** @type {'swipe' | 'hold' | null} */ (null);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let holdTimer;

  /** @param {Gesture} gesture */
  function emit(gesture) {
    navigator.vibrate?.(gesture.type === 'hold' ? 20 : 10);
    onGesture(gesture);
  }

  /** @param {PointerEvent} e */
  function moveGesture(e) {
    if (fired) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const len = Math.hypot(dx, dy);
    if (len < shortSide() * SWIPE_DISTANCE) return;
    clearTimeout(holdTimer);
    fired = 'swipe';
    emit({ type: 'swipe', dir: [round(dx / len), round(dy / len)] });
  }

  /** @param {boolean} cancelled 앱 전환 등으로 끊겼으면 탭으로 치지 않는다 */
  function releaseGesture(cancelled) {
    if (gestureId === null) return;
    gestureId = null;
    clearTimeout(holdTimer);
    if (fired === 'hold') emit({ type: 'release' });
    else if (!fired && !cancelled) emit({ type: 'tap' });
    fired = null;
  }

  // ── 손가락 배분 ──
  /** @param {PointerEvent} e */
  function down(e) {
    // 한쪽에 손가락 하나만 — 같은 쪽에 두 번째 손가락이 닿으면 무시한다.
    if (e.clientX < innerWidth / 2) {
      if (stickId !== null) return;
      stickId = e.pointerId;
      originX = e.clientX;
      originY = e.clientY;
    } else {
      if (gestureId !== null) return;
      gestureId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      fired = null;
      holdTimer = setTimeout(() => {
        fired = 'hold';
        emit({ type: 'hold' });
      }, HOLD_MS);
    }
    root.setPointerCapture(e.pointerId);
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (e.pointerId === stickId) moveStick(e);
    else if (e.pointerId === gestureId) moveGesture(e);
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (e.pointerId === stickId) releaseStick();
    else if (e.pointerId === gestureId) releaseGesture(e.type === 'pointercancel');
  }

  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);

  function releaseAll() {
    releaseStick();
    releaseGesture(true);
  }

  return {
    /** 모든 입력을 뗀다(앱 전환 등으로 pointerup 을 못 받을 때). */
    releaseAll,
    destroy() {
      releaseAll();
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
    },
  };
}
