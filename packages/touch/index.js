/**
 * 터치(포인터)를 스틱·제스처 입력으로 바꾼다. 네트워크는 모른다.
 * 폰 컨트롤러(apps/controller)도, 화면을 직접 만지는 게임도 이걸 쓴다 — 그래서 조작도 값도 같다.
 *
 * 플레이어는 폰을 보지 않고 조작한다 — 그래서 아무것도 그리지 않고, 정해진 자리도 없다.
 * 터치 영역(기본 window)을 반으로 나눠, 손가락이 **처음 닿은 쪽**(`left`·`right`)이 그 손가락의 영역이다. 영역마다
 * 모드가 하나다(`layout` — 처음엔 왼쪽 스틱·오른쪽 제스처).
 * - 스틱: 닿은 곳에서 지금 위치까지의 이동량(px)을 그대로 보낸다. 해석(데드존·최대치)은 게임 몫.
 *   끌지 않고 짧게 두드리면 `tap: true` 를 실은 스틱 입력 하나를 보낸다. 탭은 기다리지 않고 바로 보낸다.
 * - 제스처: 탭·홀드, 그리고 획(→←↑↓)을 이은 문자열. 탭은 바로 보낸다.
 * 모드를 바꾸면(`setLayout`) 그 영역에 **다음에 닿는 손가락**부터 따른다 — 닿아 있는 손가락은 뗄 때까지 옛 모드다
 * (홀드 중에 스틱이 되거나 끌던 스틱이 획이 되지 않게).
 * 폰 방향은 상관없다 — 지금 영역의 왼쪽·오른쪽 절반이다.
 * 버튼·링크 등 조작 요소 위에서 시작한 터치(와 `data-digitus-ignore` 안)는 입력으로 치지 않는다.
 *
 * 뗀 신호(`pointerup`·`pointercancel`)는 가끔 오지 않는다 — 화면 가장자리의 시스템 제스처로 손가락이 넘어가거나, 마우스를
 * 누른 채 창 밖에서 떼면. 그러면 손가락이 계속 닿은 것으로 남아 홀드가 풀리지 않고 그쪽 터치도 막힌다. 그래서 스스로 푼다:
 * 같은 쪽에 새 손가락이 닿으면 옛 손가락은 끝난 것으로 보고(끊긴 것 — 홀드였으면 release), 창이 포커스를 잃거나 가려지면
 * 전부 놓고, 마우스는 버튼을 누르지 않은 채 움직이면 뗀 것으로 본다.
 */
import { DEFAULT_LAYOUT, SIDES } from '@digitus/protocol';

/**
 * @typedef {import('@digitus/protocol').StickState} StickState
 * @typedef {import('@digitus/protocol').Gesture} Gesture
 * @typedef {import('@digitus/protocol').Side} Side
 * @typedef {import('@digitus/protocol').Layout} Layout
 *
 * 닿아 있는 손가락 하나 — 닿은 순간의 모드로 정한 인식기.
 * @typedef {{ id: number, move: (e: PointerEvent) => void, release: (cancelled: boolean) => void }} Finger
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
/** 스틱 쪽 탭 — 끌지 않고(px) 짧게(ms) 뗀 것이 탭. */
const TAP_MOVE_PX = 5;
const TAP_MAX_MS = 200;

/** 여기서 시작한 터치는 입력이 아니다 — 게임의 버튼 등을 누를 수 있게. */
const IGNORE_SELECTOR = 'button, a, input, select, textarea, label, [data-digitus-ignore]';

/**
 * @param {Window | HTMLElement} [target] 터치를 받을 대상. 이 영역을 반으로 나눈다. 기본 window(화면 전체)
 * @param {{ mouse?: boolean }} [options] `mouse`: 마우스 끌기·클릭도 받는다(기본 true)
 */
export function createTouch(target = window, { mouse = true } = {}) {
  /** 영역마다 지금 스틱(이동량). 스틱 손가락이 없는 영역은 0, 0. @type {{ [side in Side]: StickState }} */
  const state = { left: { dx: 0, dy: 0 }, right: { dx: 0, dy: 0 } };
  /** @type {Layout} */
  let layout = { ...DEFAULT_LAYOUT };
  /** 영역마다 닿아 있는 손가락. @type {{ [side in Side]: Finger | null }} */
  const fingers = { left: null, right: null };
  const isWindow = target === window;
  const element = isWindow ? null : /** @type {HTMLElement} */ (target);

  /** 영역의 왼쪽 끝과 너비(px, 화면 좌표). */
  const bounds = () => (element ? element.getBoundingClientRect() : { left: 0, width: innerWidth });

  /**
   * 스틱 손가락 — 닿은 곳에서의 이동량을 보내고, 끌지 않고 짧게 떼면 탭.
   * @param {Side} side @param {PointerEvent} e @returns {Finger}
   */
  function stick(side, e) {
    const originX = e.clientX;
    const originY = e.clientY;
    const downAt = performance.now();
    /** 이번 터치에서 가장 멀리 끈 거리 — 끌었으면 탭이 아니다. */
    let maxMove = 0;
    const now = state[side];

    /** @param {number} dx @param {number} dy */
    function set(dx, dy) {
      // 1px 아래 흔들림은 보내지 않는다.
      dx = Math.round(dx);
      dy = Math.round(dy);
      if (dx === now.dx && dy === now.dy) return;
      now.dx = dx;
      now.dy = dy;
      touch.onStick?.(now, side);
    }

    return {
      id: e.pointerId,
      move(ev) {
        const dx = ev.clientX - originX;
        const dy = ev.clientY - originY;
        maxMove = Math.max(maxMove, Math.abs(dx), Math.abs(dy));
        set(dx, dy);
      },
      release(cancelled) {
        set(0, 0);
        if (cancelled || maxMove > TAP_MOVE_PX || performance.now() - downAt > TAP_MAX_MS) return; // 끌었거나 쥐고 있었다
        navigator.vibrate?.(10);
        touch.onStick?.({ ...now, tap: true }, side); // 이 한 번에만 싣는다
      },
    };
  }

  /**
   * 제스처 손가락 — 탭·홀드, 획(→←↑↓)을 이은 문자열.
   * @param {Side} side @param {PointerEvent} e @returns {Finger}
   */
  function gesture(side, e) {
    /** 획 방향을 마지막으로 찍은 자리. */
    let lastX = e.clientX;
    let lastY = e.clientY;
    /** 찍힌 획들과 각 획의 길이(px). 같은 방향이 이어지면 한 획으로 늘린다. */
    /** @type {string[]} */
    const strokes = [];
    /** @type {number[]} */
    const runs = [];
    let holding = false;

    /** @param {Gesture} g */
    function emit(g) {
      navigator.vibrate?.(g === 'hold' ? 20 : 10);
      touch.onGesture?.(g, side);
    }

    const holdTimer = setTimeout(() => {
      holding = true;
      emit('hold');
    }, HOLD_MS);

    /** 짧은 획(꼬리)을 버리고, 그래서 이웃하게 된 같은 방향을 다시 접는다(`↓→↓` → `↓`). */
    function resolve() {
      /** @type {string[]} */
      const kept = [];
      strokes.forEach((dir, i) => {
        if (runs[i] < MIN_STROKE_PX || kept[kept.length - 1] === dir) return;
        kept.push(dir);
      });
      return kept.join('');
    }

    return {
      id: e.pointerId,
      move(ev) {
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        if (Math.abs(dx) < STROKE_STEP_PX && Math.abs(dy) < STROKE_STEP_PX) return;
        clearTimeout(holdTimer); // 홀드 전에 획이 생기면 홀드가 아니다. 홀드 뒤의 획은 뗄 때 release 앞에 보낸다.
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const dir = horizontal ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
        if (strokes[strokes.length - 1] !== dir) {
          strokes.push(dir);
          runs.push(0);
        }
        runs[runs.length - 1] += Math.abs(horizontal ? dx : dy);
        lastX = ev.clientX;
        lastY = ev.clientY;
      },
      release(cancelled) {
        clearTimeout(holdTimer);
        const stroke = cancelled ? '' : resolve();
        if (holding) {
          // 홀드한 채 그은 획(모았다가 튕기기 등)을 먼저, 그다음 release. 가드로 쓰는 게임은 이 획을 무시하면 된다.
          if (stroke) emit(stroke);
          emit('release');
          return;
        }
        if (cancelled) return;
        // 획 없이(또는 꼬리만 남기고) 짧게 뗌 = 탭.
        emit(stroke || 'tap');
      },
    };
  }

  /** @param {Side} side @param {boolean} cancelled 앱 전환 등으로 끊겼으면 탭·획으로 치지 않는다 */
  function release(side, cancelled) {
    const finger = fingers[side];
    if (!finger) return;
    fingers[side] = null;
    finger.release(cancelled);
  }

  /** @param {number} id @returns {Side | null} */
  const sideOf = (id) => SIDES.find((side) => fingers[side]?.id === id) ?? null;

  /** @param {PointerEvent} e */
  function down(e) {
    if (e.pointerType === 'mouse' && (!mouse || e.button !== 0)) return;
    if (e.target instanceof Element && e.target.closest(IGNORE_SELECTOR)) return;
    const { left, width } = bounds();
    /** @type {Side} */
    const side = e.clientX < left + width / 2 ? 'left' : 'right';
    // 한쪽에 손가락 하나만 — 같은 쪽에 새 손가락이 닿으면 옛 손가락은 끝난 것으로 본다(뗀 신호를 놓쳐 남은 것일 수 있다).
    release(side, true);
    fingers[side] = layout[side] === 'stick' ? stick(side, e) : gesture(side, e);
    // 요소 영역이면 손가락이 밖으로 나가도 이어 받는다(window 는 화면 전체라 필요 없다).
    element?.setPointerCapture(e.pointerId);
  }

  /** @param {PointerEvent} e */
  function move(e) {
    const side = sideOf(e.pointerId);
    if (!side) return;
    // 마우스를 누른 채 창 밖에서 떼면 pointerup 이 오지 않는다 — 버튼을 누르지 않은 채 움직이면 뗀 것이다.
    // 창 밖에서 무엇을 했는지 모르니 탭·획으로 치지 않는다(끊긴 것 — 홀드였으면 release).
    if (e.pointerType === 'mouse' && e.buttons === 0) release(side, true);
    else fingers[side]?.move(e);
  }

  /** @param {PointerEvent} e */
  function up(e) {
    const side = sideOf(e.pointerId);
    if (side) release(side, e.type === 'pointercancel');
  }

  function releaseAll() {
    for (const side of SIDES) release(side, true);
  }

  // 앱 전환·화면 끔·창 전환에서는 pointerup 이 오지 않아 스틱이 기운 채, 홀드가 눌린 채 남는다.
  function onVisibility() {
    if (document.hidden) releaseAll();
  }

  // 스크롤·확대·당겨서 새로고침을 막는다. touch-action 은 조상과 겹쳐 적용되므로 window 면 문서 전체에 건다.
  const touchActionHost = element ?? document.documentElement;
  const prevTouchAction = touchActionHost.style.touchAction;
  touchActionHost.style.touchAction = 'none';

  const listen = /** @type {(type: string, fn: (e: PointerEvent) => void) => void} */ (
    (type, fn) => target.addEventListener(type, /** @type {EventListener} */ (fn)));
  const unlisten = /** @type {(type: string, fn: (e: PointerEvent) => void) => void} */ (
    (type, fn) => target.removeEventListener(type, /** @type {EventListener} */ (fn)));
  listen('pointerdown', down);
  listen('pointermove', move);
  listen('pointerup', up);
  listen('pointercancel', up);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', releaseAll);

  const touch = {
    /** 영역마다 지금 스틱(이동량). 폴링용 — 한 번짜리인 tap 은 담지 않는다. 스틱 모드가 아닌 영역은 0, 0. */
    state: /** @type {Readonly<{ [side in Side]: Readonly<StickState> }>} */ (state),
    /** 지금 배치. */
    get layout() {
      return /** @type {Readonly<Layout>} */ (layout);
    },
    /** 스틱이 바뀔 때. 폰 호스트의 `onStick` 과 같은 값(`{ dx, dy, tap? }`)과 영역. */
    onStick: /** @type {((state: StickState, side: Side) => void) | null} */ (null),
    /** 제스처. 폰 호스트의 `onGesture` 와 같은 문자열과 영역. */
    onGesture: /** @type {((gesture: Gesture, side: Side) => void) | null} */ (null),
    /**
     * 영역마다 모드를 바꾼다. 그 영역에 다음에 닿는 손가락부터 따른다.
     * @param {Layout} next
     */
    setLayout(next) {
      layout = { left: next.left, right: next.right };
    },
    /** 모든 입력을 뗀다(메뉴를 열 때 등). */
    releaseAll,
    destroy() {
      releaseAll();
      unlisten('pointerdown', down);
      unlisten('pointermove', move);
      unlisten('pointerup', up);
      unlisten('pointercancel', up);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', releaseAll);
      touchActionHost.style.touchAction = prevTouchAction;
    },
  };
  return touch;
}
