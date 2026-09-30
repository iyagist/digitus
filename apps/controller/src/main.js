/**
 * 폰 컨트롤러 페이지. 주소 해시로 게임과 방을 알아내 접속하고, 게임이 보낸 배치를 그린다.
 * 모든 게임이 이 페이지 하나를 같이 쓴다.
 */
import { joinRoom } from 'trystero';
import { ACTION, PROTOCOL_VERSION, parseControllerHash } from '@digitus/protocol';
import { createPad } from './pad.js';
import './style.css';

/**
 * @typedef {import('@digitus/protocol').InputState} InputState
 * @typedef {import('@digitus/protocol').LayoutMessage} LayoutMessage
 * @typedef {import('@digitus/protocol').InputMessage} InputMessage
 */

const padEl = /** @type {HTMLElement} */ (document.getElementById('pad'));
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
  /** @type {import('trystero').MessageAction<LayoutMessage>} */
  const layoutAction = /** @type {any} */ (trysteroRoom.makeAction(ACTION.LAYOUT));
  /** @type {import('trystero').MessageAction<InputMessage>} */
  const inputAction = /** @type {any} */ (trysteroRoom.makeAction(ACTION.INPUT));

  /** @type {string | null} */
  let hostId = null;
  /** @type {ReturnType<typeof createPad> | null} */
  let pad = null;
  let seq = 0;
  /** @type {InputState | null} */
  let pending = null;

  // 터치 이벤트는 프레임보다 자주 온다 — 프레임당 한 번, 마지막 상태만 보낸다.
  function flush() {
    if (pending && hostId) {
      inputAction.send({ v: PROTOCOL_VERSION, seq: seq++, state: pending }, { target: hostId });
    }
    pending = null;
  }

  /** @param {InputState} state */
  function queue(state) {
    if (!pending) requestAnimationFrame(flush);
    pending = state;
  }

  layoutAction.onMessage = (message, { peerId }) => {
    if (message.v !== PROTOCOL_VERSION) {
      setStatus('게임과 컨트롤러 버전이 맞지 않아요');
      return;
    }
    hostId = peerId;
    document.body.dataset.orientation = message.layout.orientation ?? 'landscape';
    pad?.destroy();
    pad = createPad(padEl, message.layout, queue);
    setStatus('');
  };

  trysteroRoom.onPeerLeave = (peerId) => {
    if (peerId !== hostId) return;
    hostId = null;
    pad?.destroy();
    pad = null;
    setStatus('게임과 연결이 끊겼어요');
  };

  // 앱 전환·화면 끔에서는 pointerup 이 오지 않아 버튼이 눌린 채 남는다.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pad?.releaseAll();
  });
}
