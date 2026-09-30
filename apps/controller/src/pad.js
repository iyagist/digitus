/**
 * 화면 터치를 입력으로 바꾼다. 네트워크는 모른다.
 *
 * 플레이어는 폰을 보지 않고 조작한다 — 그래서 아무것도 그리지 않고, 정해진 자리도 없다.
 * 화면을 반으로 나눠, 손가락이 **처음 닿은 쪽**이 그 손가락의 역할을 정한다.
 * - 왼쪽: 스틱. 닿은 곳에서 지금 위치까지의 이동량(px)을 그대로 보낸다. 해석(데드존·최대치)은 게임 몫.
 * - 오른쪽: 제스처. 탭·더블탭·홀드, 그리고 획(→←↑↓)을 이은 문자열.
 * 폰 방향은 상관없다 — 지금 화면의 왼쪽·오른쪽 절반이다.
 */

/**
 * @typedef {import('@digitus/protocol').InputState} InputState
 * @typedef {import('@digitus/protocol').Gesture} Gesture
 */

// 판정 값은 DarkSeouls 패드에서 실측으로 맞춘 것을 그대로 쓴다.
/** 이만큼(px) 움직일 때마다 가로·세로 중 큰 쪽으로 획 방향을 찍는다. */
const STROKE_STEP_PX = 12;
/**
 * 한 획으로 인정하는 최소 길이(px). 엄지는 뿌리에서 돌아 올려긋기가 오른쪽 위로 휘고, 획 끝에서 세로가 먼저 죽으면
 * 짧은 가로 꼬리가 붙는다(`↓↑` 가 `↓↑→` 로). 실측에서 의도한 획은 34px 이상, 꼬리는 25px 이하였다.
 */
const MIN_STROKE_PX = 30;
/** 획 없이 이 시간 누르고 있으면 홀드. */
const HOLD_MS = 180;
/** 탭을 뗀 뒤 이 시간 안에 가까이(px) 다시 두드리면 더블탭. 그래서 탭은 이만큼 기다렸다 보낸다. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 60;

/**
 * @param {HTMLElement} root 터치를 받을 요소(화면 전체)
 * @param {{
 *   onStick: (state: InputState) => void,
 *   onGesture: (gesture: Gesture) => void,
 * }} handlers
 */
export function createPad(root, { onStick, onGesture }) {
  /** @type {InputState} */
  const state = { dx: 0, dy: 0 };

  // ── 왼쪽: 스틱 ──
  /** @type {number | null} */
  let stickId = null;
  let originX = 0;
  let originY = 0;

  /** @param {number} dx @param {number} dy */
  function setStick(dx, dy) {
    // 1px 아래 흔들림은 보내지 않는다.
    dx = Math.round(dx);
    dy = Math.round(dy);
    if (dx === state.dx && dy === state.dy) return;
    state.dx = dx;
    state.dy = dy;
    onStick(state);
  }

  /** @param {PointerEvent} e */
  function moveStick(e) {
    setStick(e.clientX - originX, e.clientY - originY);
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
  /** 획 방향을 마지막으로 찍은 자리. */
  let lastX = 0;
  let lastY = 0;
  /** 찍힌 획들과 각 획의 길이(px). 같은 방향이 이어지면 한 획으로 늘린다. */
  /** @type {string[]} */
  let strokes = [];
  /** @type {number[]} */
  let runs = [];
  let holding = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let holdTimer;
  /**
   * 보류 중인 탭 — 더블탭이 될지 몰라 아직 안 보냈다. 다음 터치가 DOUBLE_TAP_MS 안에 시작되면 그 터치가 끝날 때
   * 판정하고, 아니면 타이머가 'tap' 으로 보낸다. @type {{ x: number, y: number } | null}
   */
  let pendingTap = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let tapTimer;

  /** @param {Gesture} gesture */
  function emit(gesture) {
    navigator.vibrate?.(gesture === 'hold' ? 20 : 10);
    onGesture(gesture);
  }

  /** 보류 중인 탭을 'tap' 으로 확정해 보낸다. 다른 제스처보다 먼저 보내야 순서가 맞다. */
  function flushTap() {
    clearTimeout(tapTimer);
    if (!pendingTap) return;
    pendingTap = null;
    emit('tap');
  }

  /** @param {PointerEvent} e */
  function moveGesture(e) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) < STROKE_STEP_PX && Math.abs(dy) < STROKE_STEP_PX) return;
    clearTimeout(holdTimer); // 홀드 전에 획이 생기면 홀드가 아니다. 홀드 뒤의 획은 뗄 때 release 앞에 보낸다.
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const dir = horizontal ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
    if (strokes[strokes.length - 1] !== dir) {
      strokes.push(dir);
      runs.push(0);
    }
    runs[runs.length - 1] += Math.abs(horizontal ? dx : dy);
    lastX = e.clientX;
    lastY = e.clientY;
  }

  /** 짧은 획(꼬리)을 버리고, 그래서 이웃하게 된 같은 방향을 다시 접는다(`↓→↓` → `↓`). */
  function resolveStrokes() {
    /** @type {string[]} */
    const kept = [];
    strokes.forEach((dir, i) => {
      if (runs[i] < MIN_STROKE_PX || kept[kept.length - 1] === dir) return;
      kept.push(dir);
    });
    return kept.join('');
  }

  /** @param {boolean} cancelled 앱 전환 등으로 끊겼으면 이번 터치는 탭·획으로 치지 않는다(앞서 보류한 탭은 보낸다) */
  function releaseGesture(cancelled) {
    if (gestureId === null) return;
    gestureId = null;
    clearTimeout(holdTimer);
    const stroke = cancelled ? '' : resolveStrokes();
    if (holding) {
      // 홀드한 채 그은 획(모았다가 튕기기 등)을 먼저, 그다음 release. 가드로 쓰는 게임은 이 획을 무시하면 된다.
      holding = false;
      if (stroke) emit(stroke);
      emit('release');
      return;
    }
    if (cancelled) {
      flushTap();
      return;
    }
    if (stroke) {
      flushTap();
      emit(stroke);
      return;
    }
    // 획 없이(또는 꼬리만 남기고) 짧게 뗌 = 탭. 보류 중인 탭과 가까우면 둘을 합쳐 더블탭 하나만 보낸다.
    if (pendingTap
      && Math.abs(startX - pendingTap.x) <= DOUBLE_TAP_PX && Math.abs(startY - pendingTap.y) <= DOUBLE_TAP_PX) {
      pendingTap = null;
      emit('dtap');
      return;
    }
    flushTap(); // 멀리 두드렸으면 앞의 탭은 따로 보내고, 이번 탭을 새로 보류한다.
    pendingTap = { x: startX, y: startY };
    tapTimer = setTimeout(flushTap, DOUBLE_TAP_MS);
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
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      strokes = [];
      runs = [];
      holding = false;
      // 보류 중인 탭이 있으면 이 터치가 끝날 때까지 판정을 미룬다(더블탭의 두 번째일 수 있다).
      clearTimeout(tapTimer);
      holdTimer = setTimeout(() => {
        holding = true;
        flushTap();
        emit('hold');
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
    flushTap();
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
