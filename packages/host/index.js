/**
 * 게임(PC 브라우저) 쪽 라이브러리. 방을 열고, 폰 컨트롤러의 스틱과 제스처를 받는다.
 *
 * 스틱(`{ dx, dy }`, 닿은 곳에서의 이동량 px)은 두 방식으로 쓸 수 있다.
 * - 이벤트: `host.onInput = (state, player) => …`
 * - 폴링: 게임 루프에서 `host.players` 의 `state` 를 읽는다(키보드 상태를 읽듯).
 * 제스처는 이벤트로만 온다: `host.onGesture = (gesture, player) => …`
 */
import { joinRoom } from 'trystero';
import {
  ACTION,
  PROTOCOL_VERSION,
  buildControllerUrl,
  createRoomId,
  neutralInput,
} from '@digitus/protocol';

/**
 * @typedef {import('@digitus/protocol').InputState} InputState
 * @typedef {import('@digitus/protocol').Gesture} Gesture
 * @typedef {import('@digitus/protocol').HelloMessage} HelloMessage
 * @typedef {import('@digitus/protocol').InputMessage} InputMessage
 * @typedef {import('@digitus/protocol').GestureMessage} GestureMessage
 *
 * @typedef {object} Player
 * @property {string} id Trystero 피어 ID
 * @property {number} index 0부터. 나간 자리는 다음에 들어온 사람이 채운다
 * @property {InputState} state 최신 스틱
 * @property {number} seq 마지막으로 받은 입력 번호
 *
 * @typedef {object} HostOptions
 * @property {string} appId 게임마다 고유한 값. 컨트롤러와 같아야 한다
 * @property {string} controllerUrl 컨트롤러 페이지 주소
 * @property {string} [room] 생략하면 새로 만든다
 * @property {RTCConfiguration} [rtcConfig] TURN 서버 등을 넣을 때
 */

/** @param {HostOptions} options */
export function createHost({ appId, controllerUrl, room = createRoomId(), rtcConfig }) {
  const trysteroRoom = joinRoom({ appId, ...(rtcConfig && { rtcConfig }) }, room);

  /** @type {import('trystero').MessageAction<HelloMessage>} */
  const helloAction = /** @type {any} */ (trysteroRoom.makeAction(ACTION.HELLO));
  /** @type {import('trystero').MessageAction<InputMessage>} */
  const inputAction = /** @type {any} */ (trysteroRoom.makeAction(ACTION.INPUT));
  /** @type {import('trystero').MessageAction<GestureMessage>} */
  const gestureAction = /** @type {any} */ (trysteroRoom.makeAction(ACTION.GESTURE));

  /** @type {Map<string, Player>} */
  const players = new Map();

  function nextIndex() {
    const used = new Set(Array.from(players.values(), (p) => p.index));
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }

  const host = {
    room,
    /** QR 코드에 담을 주소 */
    url: buildControllerUrl(controllerUrl, { appId, room }),
    /** @type {ReadonlyMap<string, Player>} */
    players,
    onJoin: /** @type {((player: Player) => void) | null} */ (null),
    onLeave: /** @type {((player: Player) => void) | null} */ (null),
    onInput: /** @type {((state: InputState, player: Player) => void) | null} */ (null),
    onGesture: /** @type {((gesture: Gesture, player: Player) => void) | null} */ (null),

    /** 왕복 지연(ms). @param {string} playerId */
    ping(playerId) {
      return trysteroRoom.ping(playerId);
    },

    close() {
      removeEventListener('pagehide', host.close);
      trysteroRoom.leave();
      players.clear();
    },
  };

  // 탭을 닫을 때 알리고 나가면 폰이 바로 안다. 안 하면 WebRTC 가 끊김을 알아채는 데 10초쯤 걸린다.
  addEventListener('pagehide', host.close);

  // 컨트롤러끼리도 서로 연결되지만(Trystero 는 방 안을 모두 잇는다) 입력은 호스트에게만 보낸다.
  // 컨트롤러는 HELLO 를 보낸 쪽을 호스트로 알아본다.
  trysteroRoom.onPeerJoin = (peerId) => {
    const player = { id: peerId, index: nextIndex(), state: neutralInput(), seq: -1 };
    players.set(peerId, player);
    helloAction.send({ v: PROTOCOL_VERSION }, { target: peerId });
    host.onJoin?.(player);
  };

  trysteroRoom.onPeerLeave = (peerId) => {
    const player = players.get(peerId);
    if (!player) return;
    players.delete(peerId);
    host.onLeave?.(player);
  };

  inputAction.onMessage = (message, { peerId }) => {
    const player = players.get(peerId);
    if (!player || message.v !== PROTOCOL_VERSION || message.seq <= player.seq) return;
    player.seq = message.seq;
    player.state = message.state;
    host.onInput?.(player.state, player);
  };

  gestureAction.onMessage = (message, { peerId }) => {
    const player = players.get(peerId);
    if (!player || message.v !== PROTOCOL_VERSION) return;
    host.onGesture?.(message.gesture, player);
  };

  return host;
}
