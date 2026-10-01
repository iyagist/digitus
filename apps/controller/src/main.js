/**
 * 폰 컨트롤러 페이지. 주소 해시로 게임과 방을 알아내 접속하고, 게임이 보낸 배치를 그린다.
 * 모든 게임이 이 페이지 하나를 같이 쓴다.
 */
import { joinRoom } from 'trystero';
import { ACTION, PROTOCOL_VERSION, parseControllerHash } from '@digitus/protocol';
import { createTouch } from '@digitus/touch';
import './style.css';

/**
 * @typedef {import('@digitus/protocol').InputState} InputState
 * @typedef {import('@digitus/protocol').HelloMessage} HelloMessage
 * @typedef {import('@digitus/protocol').InputMessage} InputMessage
 * @typedef {import('@digitus/protocol').GestureMessage} GestureMessage
 */

const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const fullscreenEl = /** @type {HTMLButtonElement} */ (document.getElementById('fullscreen'));

/** @param {string} text */
function setStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

document.addEventListener('contextmenu', (e) => e.preventDefault());

// iPhone Safari 는 요소 전체 화면을 지원하지 않는다 — 되는 기기에서만 보인다.
if (document.documentElement.requestFullscreen) {
  fullscreenEl.hidden = false;
  fullscreenEl.addEventListener('click', () => {
    document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenEl.hidden = !!document.fullscreenElement;
  });
}

const target = parseControllerHash(location.hash);
if (!target) {
  setStatus('게임 화면의 QR 코드로 접속해 주세요');
} else {
  connect(target);
}

/** @param {{ appId: string, room: string }} target */
function connect({ appId, room }) {
  setStatus('게임 찾는 중…');
  const trysteroRoom = joinRoom({ appId }, room);
  /** @type {import('trystero').MessageAction<HelloMessage>} */
  const helloAction = /** @type {any} */ (trysteroRoom.makeAction(ACTION.HELLO));
  /** @type {import('trystero').MessageAction<InputMessage>} */
  const inputAction = /** @type {any} */ (trysteroRoom.makeAction(ACTION.INPUT));
  /** @type {import('trystero').MessageAction<GestureMessage>} */
  const gestureAction = /** @type {any} */ (trysteroRoom.makeAction(ACTION.GESTURE));

  /** @type {string | null} */
  let hostId = null;
  /** @type {ReturnType<typeof createTouch> | null} */
  let pad = null;

  // 바뀔 때마다 바로 보낸다 — 모았다 보내면 dtap 처럼 한 번만 실리는 값이 다음 값에 덮인다.
  /** @param {InputState} state */
  function sendStick(state) {
    if (hostId) inputAction.send({ state }, { target: hostId });
  }

  helloAction.onMessage = (message, { peerId }) => {
    if (message.v !== PROTOCOL_VERSION) {
      setStatus('게임과 컨트롤러 버전이 맞지 않아요');
      return;
    }
    hostId = peerId;
    // 답례 — 호스트는 이걸 받고 버전이 맞으면 이 폰을 플레이어로 받는다.
    helloAction.send({ v: PROTOCOL_VERSION }, { target: peerId });
    pad?.destroy();
    pad = createTouch(); // 폰 화면 전체
    pad.onInput = sendStick;
    pad.onGesture = (gesture) => {
      if (hostId) gestureAction.send({ gesture }, { target: hostId });
    };
    setStatus('');
    document.body.classList.add('connected');
  };

  trysteroRoom.onPeerLeave = (peerId) => {
    if (peerId !== hostId) return;
    hostId = null;
    pad?.destroy();
    pad = null;
    setStatus('게임과 연결이 끊겼어요');
    document.body.classList.remove('connected');
  };
}
