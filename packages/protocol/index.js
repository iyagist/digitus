/**
 * 호스트(게임)와 컨트롤러(폰) 사이의 약속. 양쪽이 이 파일만 공유한다.
 *
 * 컨트롤러는 화면을 반으로 나눠 쓴다 — 왼쪽은 스틱(어디든 닿은 곳이 시작점), 오른쪽은 제스처.
 * 플레이어는 폰을 보지 않고 조작하므로 그리는 것도, 게임마다 다른 배치도 없다.
 * 게임 개념(공격·회피)은 여기 두지 않는다 — 스틱 값과 제스처만 오가고, 그 의미는 게임이 정한다.
 */

/** 메시지 형식이 바뀌면 올린다. 다르면 서로 무시한다. */
export const PROTOCOL_VERSION = 3;

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
 * 오른쪽 화면 제스처. 손가락 하나가 만드는 것은 셋 중 하나다.
 * - `tap`: 짧게 톡
 * - `swipe`: 일정 거리를 넘게 쓸면 **넘는 순간** 온다. `dir` 은 단위 벡터(화면 좌표계) — 몇 방향으로 나눌지는 게임 몫
 * - `hold` → `release`: 제자리에서 오래 누르면 `hold`, 떼면 `release`
 *
 * @typedef {{ type: 'tap' } | { type: 'swipe', dir: [number, number] } | { type: 'hold' } | { type: 'release' }} Gesture
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
