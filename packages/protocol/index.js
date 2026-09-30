/**
 * 호스트(게임)와 컨트롤러(폰) 사이의 약속. 양쪽이 이 파일만 공유한다.
 *
 * 컨트롤러 페이지 하나를 모든 게임이 같이 쓰므로, 게임 개념(공격·점프)은 여기 두지 않는다 —
 * 스틱·버튼 같은 범용 입력만 오가고, 그 의미는 게임이 정한다.
 */

/** 메시지 형식이 바뀌면 올린다. 다르면 서로 무시한다. */
export const PROTOCOL_VERSION = 1;

/** Trystero 액션 이름. */
export const ACTION = Object.freeze({
  /** 호스트 → 컨트롤러: 그릴 배치 */
  LAYOUT: 'layout',
  /** 컨트롤러 → 호스트: 입력 스냅샷 */
  INPUT: 'input',
});

/**
 * 위치는 화면 비율(0~1)의 중심 좌표, 반지름 `r` 은 화면 짧은 변 대비 비율.
 *
 * @typedef {{ type: 'stick', id: string, x: number, y: number, r?: number }} StickControl
 * @typedef {{ type: 'button', id: string, x: number, y: number, r?: number, label?: string }} ButtonControl
 * @typedef {StickControl | ButtonControl} Control
 *
 * @typedef {object} Layout
 * @property {'landscape' | 'portrait'} [orientation] 권장 화면 방향 (기본 landscape)
 * @property {Control[]} controls
 */

/**
 * 한 시점의 전체 입력 상태. 변화분이 아니라 스냅샷이라 하나를 놓쳐도 다음 것으로 복구된다.
 * 스틱 값은 [-1, 1], 화면 좌표계(오른쪽 +x, 아래 +y). 데드존은 게임이 정한다.
 *
 * @typedef {object} InputState
 * @property {Record<string, [number, number]>} sticks
 * @property {Record<string, boolean>} buttons
 */

/**
 * @typedef {{ v: number, layout: Layout }} LayoutMessage
 * @typedef {{ v: number, seq: number, state: InputState }} InputMessage
 */

/** @returns {InputState} */
export function emptyInput() {
  return { sticks: {}, buttons: {} };
}

/** 배치에 맞는 초기 입력(스틱 0, 버튼 뗌). @param {Layout} layout @returns {InputState} */
export function neutralInput(layout) {
  const state = emptyInput();
  for (const c of layout.controls) {
    if (c.type === 'stick') state.sticks[c.id] = [0, 0];
    else state.buttons[c.id] = false;
  }
  return state;
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
