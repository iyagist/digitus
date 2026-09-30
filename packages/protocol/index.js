/**
 * 호스트(게임)와 컨트롤러(폰) 사이의 약속. 양쪽이 이 파일만 공유한다.
 *
 * 컨트롤러는 화면을 반으로 나눠 쓴다 — 왼쪽은 스틱(어디든 닿은 곳이 시작점), 오른쪽은 제스처.
 * 플레이어는 폰을 보지 않고 조작하므로 그리는 것도, 게임마다 다른 배치도 없다.
 * 게임 개념(공격·회피)은 여기 두지 않는다 — 스틱 값과 제스처만 오가고, 그 의미는 게임이 정한다.
 */

/** 메시지 형식이 바뀌면 올린다. 다르면 서로 무시한다. */
export const PROTOCOL_VERSION = 4;

/** Trystero 액션 이름. */
export const ACTION = Object.freeze({
  /** 호스트 → 컨트롤러: 내가 호스트다(컨트롤러끼리도 연결되므로 이걸로 호스트를 알아본다) */
  HELLO: 'hello',
  /** 컨트롤러 → 호스트: 스틱 스냅샷 */
  INPUT: 'input',
  /** 컨트롤러 → 호스트: 오른쪽 화면 제스처 */
  GESTURE: 'gesture',
});

/**
 * 한 시점의 스틱 상태: 손가락이 **처음 닿은 곳에서 지금 위치까지** 이동량(CSS px, 정수). 떼면 0, 0.
 * 끝이 없다 — 끄는 만큼 커진다. 화면 좌표계(오른쪽 +x, 아래 +y), 폰을 세우든 눕히든 폰 화면 기준이다.
 * 직전 대비 변화분이 아니라 스냅샷이라 하나를 놓쳐도 다음 것으로 복구된다. 데드존·최대치는 게임이 정한다.
 *
 * @typedef {object} InputState
 * @property {number} dx
 * @property {number} dy
 */

/**
 * 오른쪽 화면 제스처. 문자열 하나다.
 * - `'tap'`: 획 없이 짧게 톡. 더블탭이 아닌지 확인하느라 **300ms 뒤에** 온다
 * - `'dtap'`: 탭을 뗀 뒤 300ms 안에 가까이(60px) 한 번 더 톡. `'dtap'` 하나만 온다(앞의 `'tap'` 없이)
 * - `'hold'` → `'release'`: 획 없이 180ms 누르고 있으면 `'hold'`, 떼면 `'release'`.
 *   홀드한 채 그은 획이 있으면 뗄 때 그 획을 먼저 보내고 `'release'` 가 뒤따른다(`'hold'`, `'→'`, `'release'`)
 * - 획: `'→'` `'←'` `'↑'` `'↓'` 를 그은 순서대로 이은 문자열(`'↓'`, `'↓↑'`, `'→←→'` …). 손을 **뗄 때** 온다.
 *   같은 방향은 하나로 접고, 30px 미만 획(엄지가 휘며 붙는 꼬리)은 버린다
 *
 * 무슨 동작인지(공격·회피…)는 게임이 정한다.
 *
 * @typedef {string} Gesture
 */

/**
 * @typedef {{ v: number }} HelloMessage
 * @typedef {{ v: number, seq: number, state: InputState }} InputMessage
 * @typedef {{ v: number, gesture: Gesture }} GestureMessage
 */

/** 손을 뗀 상태. @returns {InputState} */
export function neutralInput() {
  return { dx: 0, dy: 0 };
}

// 방 이름을 아는 사람만 붙을 수 있다(Trystero 가 방 이름으로 연결 정보를 암호화) — 추측 못 하게 길게.
const ROOM_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const ROOM_LENGTH = 16;

export function createRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_LENGTH));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

/**
 * 폰이 열 주소. 게임과 방 정보는 해시에 담아 컨트롤러 페이지 서버로 보내지 않는다.
 * @param {string} controllerUrl
 * @param {{ appId: string, room: string }} target
 */
export function buildControllerUrl(controllerUrl, { appId, room }) {
  const url = new URL(controllerUrl);
  url.hash = new URLSearchParams({ a: appId, r: room }).toString();
  return url.toString();
}

/** @param {string} hash `location.hash` @returns {{ appId: string, room: string } | null} */
export function parseControllerHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const appId = params.get('a');
  const room = params.get('r');
  return appId && room ? { appId, room } : null;
}
