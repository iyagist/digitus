/**
 * 호스트 라이브러리 사용 예. 게임 대신 입력을 그대로 보여준다.
 */
import QRCode from 'qrcode';
import { createHost } from '@digitus/host';

const host = createHost({
  appId: 'digitus-demo',
  controllerUrl: import.meta.env.VITE_CONTROLLER_URL,
});

const urlEl = /** @type {HTMLAnchorElement} */ (document.getElementById('url'));
const playersEl = /** @type {HTMLElement} */ (document.getElementById('players'));

QRCode.toCanvas(document.getElementById('qr'), host.url, { width: 280, margin: 0 });
urlEl.href = urlEl.textContent = host.url;

/** @type {Map<string, { el: HTMLElement, pre: HTMLElement, dot: HTMLElement, ping: HTMLElement, log: HTMLElement }>} */
const views = new Map();

/** @typedef {import('@digitus/host').Player} Player */

host.onJoin = (/** @type {Player} */ player) => {
  const el = document.createElement('div');
  el.className = 'player';
  el.innerHTML = `<strong>P${player.index + 1}</strong> <small class="ping"></small><div class="dot"><span></span></div><pre></pre><ol class="log"></ol>`;
  playersEl.append(el);
  const view = {
    el,
    pre: /** @type {HTMLElement} */ (el.querySelector('pre')),
    dot: /** @type {HTMLElement} */ (el.querySelector('.dot span')),
    ping: /** @type {HTMLElement} */ (el.querySelector('.ping')),
    log: /** @type {HTMLElement} */ (el.querySelector('.log')),
  };
  views.set(player.id, view);
  render(player);
};

host.onLeave = (/** @type {Player} */ player) => {
  views.get(player.id)?.el.remove();
  views.delete(player.id);
};

host.onInput = (/** @type {unknown} */ _state, /** @type {Player} */ player) => render(player);

/** 최근 제스처 몇 개를 위에서부터 보여준다. */
host.onGesture = (/** @type {import('@digitus/protocol').Gesture} */ gesture, /** @type {Player} */ player) => {
  const view = views.get(player.id);
  if (!view) return;
  const li = document.createElement('li');
  li.textContent = gesture.type === 'swipe' ? `swipe [${gesture.dir.join(', ')}]` : gesture.type;
  view.log.prepend(li);
  while (view.log.children.length > 8) view.log.lastChild?.remove();
};

/** @param {Player} player */
function render(player) {
  const view = views.get(player.id);
  if (!view) return;
  const [x, y] = player.state.stick;
  view.dot.style.left = `${50 + x * 50}%`;
  view.dot.style.top = `${50 + y * 50}%`;
  view.pre.textContent = JSON.stringify(player.state, null, 1);
}

// 왕복 지연 표시
setInterval(async () => {
  for (const [id, view] of views) {
    const ms = await host.ping(id).catch(() => null);
    view.ping.textContent = ms === null ? '' : `${Math.round(ms)}ms`;
  }
}, 1000);
