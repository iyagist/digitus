/**
 * 호스트(게임)와 컨트롤러(폰) 사이의 약속. 양쪽이 이 파일만 공유한다.
 *
 * 컨트롤러는 화면을 반으로 나눠 쓴다 — 왼쪽은 스틱(어디든 닿은 곳이 시작점), 오른쪽은 제스처.
 * 플레이어는 폰을 보지 않고 조작하므로 그리는 것도, 게임마다 다른 배치도 없다.
 * 게임 개념(공격·회피)은 여기 두지 않는다 — 스틱 값과 제스처만 오가고, 그 의미는 게임이 정한다.
 */

/**
 * 메시지 형식 버전. 다르면 서로 무시한다(컨트롤러는 "버전이 맞지 않아요" 를 띄운다).
 * 출시 전에는 지킬 옛 게임이 없어 1 로 둔다 — 출시 뒤 메시지 모양이 바뀔 때부터 올린다.
 */
export const PROTOCOL_VERSION = 1;

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
 * `dtap` 은 스틱 쪽 더블탭(끌지 않고 5px·짧게 200ms 두 번, 두 탭을 뗀 간격 300ms·거리 60px 안)의 **누적 횟수**다.
 * 늘었으면 그만큼 더블탭이 났다. 한 번짜리 표시로 두면 스냅샷끼리 덮여 사라질 수 있어 횟수로 둔다.
 * 한 번 두드림은 아무것도 아니다. 두드리는 동안의 작은 dx·dy 는 게임 데드존이 거른다.
 *
 * @typedef {object} InputState
 * @property {number} dx
 * @property {number} dy
 * @property {number} dtap
 */

/**
 * 오른쪽 화면 제스처. 문자열 하나다. (더블탭은 왼쪽 스틱에서 난다 — `InputState.dtap`)
 * - `'tap'`: 획 없이 짧게 톡. 바로 온다
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
  return { dx: 0, dy: 0, dtap: 0 };
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
 *
 * 쿼리의 `_` 는 뜻 없는 무작위 값이다. 해시는 캐시 키가 아니라서, 없으면 폰 브라우저가 전에 받아 둔
 * 옛 index.html 을 그대로 쓴다(GitHub Pages 는 10분 캐시) — 컨트롤러를 고쳐 배포해도 옛 판이 돈다.
 * 스크립트·스타일은 파일 이름에 내용 해시가 있어 캐시돼도 괜찮다.
 * @param {string} controllerUrl
 * @param {{ appId: string, room: string }} target
 */
export function buildControllerUrl(controllerUrl, { appId, room }) {
  const url = new URL(controllerUrl);
  url.searchParams.set('_', createRoomId().slice(0, 6));
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
