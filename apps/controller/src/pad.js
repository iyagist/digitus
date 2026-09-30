/**
 * 화면 터치를 입력으로 바꾼다. 네트워크는 모른다.
 *
 * 플레이어는 폰을 보지 않고 조작한다 — 그래서 아무것도 그리지 않고, 정해진 자리도 없다.
 * 화면을 반으로 나눠, 손가락이 **처음 닿은 쪽**이 그 손가락의 역할을 정한다.
 * - 왼쪽: 스틱. 닿은 곳에서 지금 위치까지의 이동량(px)을 그대로 보낸다. 해석(데드존·최대치)은 게임 몫.
 *   끌지 않고 짧게 두 번 두드리면 더블탭 — 스틱 상태의 `dtap` 횟수를 올린다. 한 번 두드림은 아무것도 아니라 기다릴 필요가 없다.
 * - 오른쪽: 제스처. 탭·홀드, 그리고 획(→←↑↓)을 이은 문자열. 탭은 바로 보낸다.
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
/** 스틱 쪽 더블탭 — 끌지 않고(px) 짧게(ms) 뗀 것이 탭, 두 탭을 뗀 시각·자리가 이 안이면 더블탭. */
const TAP_MOVE_PX = 5;
const TAP_MAX_MS = 200;
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
  const state = { dx: 0, dy: 0, dtap: 0 };

  // ── 왼쪽: 스틱 ──
  /** @type {number | null} */
  let stickId = null;
  let originX = 0;
  let originY = 0;
  let stickDownAt = 0;
  /** 이번 터치에서 가장 멀리 끈 거리 — 끌었으면 탭이 아니다. */
  let stickMaxMove = 0;
  /** 직전 스틱 탭 — 다음 탭이 가까우면 더블탭. @type {{ x: number, y: number, at: number } | null} */
  let lastStickTap = null;

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
    const dx = e.clientX - originX;
    const dy = e.clientY - originY;
    stickMaxMove = Math.max(stickMaxMove, Math.abs(dx), Math.abs(dy));
    setStick(dx, dy);
  }

  /** @param {boolean} cancelled 앱 전환 등으로 끊겼으면 탭으로 치지 않는다 */
  function releaseStick(cancelled) {
    if (stickId === null) return;
    stickId = null;
    setStick(0, 0);
    const now = performance.now();
    if (cancelled || stickMaxMove > TAP_MOVE_PX || now - stickDownAt > TAP_MAX_MS) {
      lastStickTap = null; // 끌었거나 쥐고 있었다 — 탭 연속이 끊긴다
      return;
    }
    if (lastStickTap && now - lastStickTap.at <= DOUBLE_TAP_MS
      && Math.abs(originX - lastStickTap.x) <= DOUBLE_TAP_PX && Math.abs(originY - lastStickTap.y) <= DOUBLE_TAP_PX) {
      lastStickTap = null; // 세 번째 탭이 또 더블탭이 되지 않게
      // 스틱은 스냅샷이라 한 번짜리 표시는 다음 값에 덮일 수 있다 — 누적 횟수로 올린다.
      state.dtap += 1;
      navigator.vibrate?.(10);
      onStick(state);
      return;
    }
    lastStickTap = { x: originX, y: originY, at: now };
  }

  // ── 오른쪽: 제스처 ──
  /** @type {number | null} */
  let gestureId = null;
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

  /** @param {Gesture} gesture */
  function emit(gesture) {
    navigator.vibrate?.(gesture === 'hold' ? 20 : 10);
    onGesture(gesture);
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

  /** @param {boolean} cancelled 앱 전환 등으로 끊겼으면 탭·획으로 치지 않는다 */
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
    if (cancelled) return;
    // 획 없이(또는 꼬리만 남기고) 짧게 뗌 = 탭.
    emit(stroke || 'tap');
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
      stickDownAt = performance.now();
      stickMaxMove = 0;
    } else {
      if (gestureId !== null) return;
      gestureId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      strokes = [];
      runs = [];
      holding = false;
      holdTimer = setTimeout(() => {
        holding = true;
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
    if (e.pointerId === stickId) releaseStick(e.type === 'pointercancel');
    else if (e.pointerId === gestureId) releaseGesture(e.type === 'pointercancel');
  }

  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);

  function releaseAll() {
    releaseStick(true);
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
