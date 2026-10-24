/**
 * 호스트 라이브러리 사용 예. 게임 대신 입력을 그대로 보여준다. 단추로 영역마다 모드를 바꿔 볼 수 있다.
 */
import QRCode from 'qrcode';
import { createHost } from '@digitus/host';
import { DEFAULT_LAYOUT, SIDES } from '@digitus/protocol';

const host = createHost({
  appId: 'digitus-demo',
  controllerUrl: import.meta.env.VITE_CONTROLLER_URL,
});

const urlEl = /** @type {HTMLAnchorElement} */ (document.getElementById('url'));
const playersEl = /** @type {HTMLElement} */ (document.getElementById('players'));

QRCode.toCanvas(document.getElementById('qr'), host.url, { width: 280, margin: 0 });
urlEl.href = urlEl.textContent = host.url;

/**
 * @typedef {import('@digitus/host').Player} Player
 * @typedef {import('@digitus/protocol').Side} Side
 * @typedef {import('@digitus/protocol').Layout} Layout
 */

/** 모두에게 보낸 배치 — 단추가 영역 하나씩 뒤집는다. @type {Layout} */
let layout = { ...DEFAULT_LAYOUT };
for (const side of SIDES) {
  const button = /** @type {HTMLButtonElement} */ (document.getElementById(side));
  const label = () => {
    button.textContent = `${side === 'left' ? '왼쪽' : '오른쪽'}: ${layout[side] === 'stick' ? '스틱' : '제스처'}`;
  };
  label();
  button.addEventListener('click', () => {
    layout = { ...layout, [side]: layout[side] === 'stick' ? 'gesture' : 'stick' };
    host.setLayout(layout);
    label();
  });
}

/** @type {Map<string, { el: HTMLElement, pre: HTMLElement, dots: { [side in Side]: HTMLElement }, ping: HTMLElement, log: HTMLElement }>} */
const views = new Map();

host.onJoin = (/** @type {Player} */ player) => {
  const el = document.createElement('div');
  el.className = 'player';
  el.innerHTML = `<strong>P${player.index + 1}</strong> <small class="ping"></small>`
    + '<div class="sticks"><div class="dot left"><small>L</small><span></span></div>'
    + '<div class="dot right"><small>R</small><span></span></div></div><pre></pre><ol class="log"></ol>';
  playersEl.append(el);
  const view = {
    el,
    pre: /** @type {HTMLElement} */ (el.querySelector('pre')),
    dots: {
      left: /** @type {HTMLElement} */ (el.querySelector('.dot.left span')),
      right: /** @type {HTMLElement} */ (el.querySelector('.dot.right span')),
    },
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

host.onStick = (/** @type {unknown} */ _state, /** @type {Player} */ player) => render(player);

/** 최근 제스처 몇 개를 위에서부터 보여준다(어느 영역의 것인지 함께). */
host.onGesture = (
  /** @type {import('@digitus/protocol').Gesture} */ gesture,
  /** @type {Player} */ player,
  /** @type {Side} */ side,
) => {
  const view = views.get(player.id);
  if (!view) return;
  const li = document.createElement('li');
  li.textContent = `${side === 'left' ? 'L' : 'R'} ${gesture}`;
  view.log.prepend(li);
  while (view.log.children.length > 8) view.log.lastChild?.remove();
};

const DOT_RANGE = 100;

/** @param {Player} player */
function render(player) {
  const view = views.get(player.id);
  if (!view) return;
  // 점은 100px 끌면 원 가장자리에 닿게 보여준다(값 자체는 끝이 없다).
  for (const side of SIDES) {
    const { dx, dy } = player.state[side];
    const len = Math.max(1, Math.hypot(dx, dy) / DOT_RANGE);
    view.dots[side].style.left = `${50 + (dx / DOT_RANGE / len) * 50}%`;
    view.dots[side].style.top = `${50 + (dy / DOT_RANGE / len) * 50}%`;
  }
  view.pre.textContent = JSON.stringify(player.state, null, 1);
}

// 왕복 지연 표시
setInterval(async () => {
  for (const [id, view] of views) {
    const ms = await host.ping(id).catch(() => null);
    view.ping.textContent = ms === null ? '' : `${Math.round(ms)}ms`;
  }
}, 1000);
