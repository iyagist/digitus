# Digitus

폰을 브라우저 게임의 컨트롤러로 쓴다. 게임 화면의 QR 코드를 폰으로 찍으면 컨트롤러 페이지가 열리고,
WebRTC 로 게임과 직접 연결된다. 앱 설치도, 우리 서버도 필요 없다.

> *digitus* — 라틴어로 "손가락". *digital* 의 어원.

```
[게임 (PC 브라우저)] ←── WebRTC 직접 연결 ──→ [컨트롤러 (폰 브라우저)]
            └──── 처음 서로를 찾을 때만: Trystero (공개 Nostr 릴레이) ────┘
```

## 구성 (pnpm workspace, 순수 JS ESM + JSDoc)

| 패키지 | 역할 |
|---|---|
| `packages/protocol` | 호스트·컨트롤러가 공유하는 약속: 메시지 형식, 영역·모드, 입력 상태, 제스처, 주소 |
| `packages/host` | 게임이 가져다 쓰는 라이브러리. 방을 열고 폰의 스틱·제스처를 받고, 영역별 모드를 보낸다 |
| `packages/touch` | 터치 → 스틱·제스처 인식. 폰 컨트롤러가 쓰고, **게임도 화면을 직접 만지는 조작에 그대로 쓴다** |
| `apps/controller` | 폰 컨트롤러 페이지. **모든 게임이 이 페이지 하나를 같이 쓴다** |
| `apps/demo` | 호스트 사용 예. 입력을 화면에 그대로 보여준다 |

## 컨트롤러

플레이어는 폰을 보지 않고 게임 화면을 보며 조작한다. 그래서 컨트롤러는 **아무것도 그리지 않는다** —
버튼 자리를 찾아 폰을 봐야 한다면 패드가 아니다. 화면을 반으로 나눈 **영역**(`left`·`right`)마다 **모드**가 하나고,
손가락이 처음 닿은 쪽 영역의 모드가 그 손가락의 역할을 정한다.

| 모드 | 보내는 것 |
|---|---|
| `stick` | 닿은 곳에서 지금 위치까지의 이동량(px) `{ dx, dy }`. 끝이 없다 — 끄는 만큼 커진다. 끌지 않고 짧게 두드리면 그 입력에 `tap: true` |
| `gesture` | 문자열 하나: `tap` / `hold` → `release`(롱탭) / 획 `→←↑↓` 을 이은 것(`↓↑` 등, 뗄 때) |

처음 배치는 **왼쪽 `stick`, 오른쪽 `gesture`**(`DEFAULT_LAYOUT`)다. 게임이 상황에 따라 바꾼다(`host.setLayout`) — 예를 들어
오른쪽을 잠깐 `stick` 으로 바꿔 화면의 포인터를 끌게 하고, 정하면 다시 `gesture` 로. 바꾼 모드는 그 영역에 **다음에 닿는
손가락**부터 따른다(닿아 있는 손가락은 뗄 때까지 옛 모드 — 홀드 중에 스틱이 되지 않게). 지금 무슨 모드인지는 폰이 아니라
게임 화면이 보여 준다.

폰 방향은 상관없다(세로·가로 모두 그때 화면의 왼쪽·오른쪽 절반). 양쪽 손가락은 동시에 쓸 수 있다.

## 사용법 (게임 쪽)

```js
import { createHost } from '@digitus/host';

const host = createHost({
  appId: 'my-game',                                     // 게임마다 고유
  controllerUrl: 'https://iyagist.github.io/digitus/',  // 컨트롤러 페이지 주소
});

showQrCode(host.url);  // QR 생성은 게임 몫 (demo 는 qrcode 패키지 사용)

// 스틱: 이벤트로 받거나 — side 는 'left' | 'right'
host.onStick = (state, player, side) => { /* state = { dx, dy, tap? } — 탭이면 true */ };
// 게임 루프에서 읽는다
for (const player of host.players.values()) player.state.left.dx;

// 제스처: 이벤트로만, 문자열 하나
host.onGesture = (gesture, player, side) => {
  // 'tap' | 'hold' | 'release' | '→' | '↓↑' | '→←→' …
};

// 영역마다 모드 바꾸기 — 모두에게(앞으로 붙는 폰까지), 또는 한 플레이어에게
host.setLayout({ left: 'stick', right: 'stick' });
host.setLayout({ left: 'stick', right: 'gesture' }, player);
```

- 스틱 값은 폰 화면의 CSS px 정수, 화면 좌표계(오른쪽 +x, 아래 +y). 떼면 `0, 0`. 데드존·최대치는 게임이 정한다.
- 스틱은 바뀔 때마다 바로 보낸다. 폴링용 `player.state.left`·`right` 에는 `dx`, `dy` 만 있다(`tap` 은 `onStick` 으로만).
  스틱 모드가 아닌 영역은 `0, 0`.
- **포인터처럼** 쓰려면 손가락을 댈 때의 포인터 자리에 이동량을 더하고, 떼면(`0, 0`) 그 자리를 새 기준으로 삼는다 —
  트랙패드처럼 여러 번 나눠 끌 수 있다. 배율(폰 px → 화면 px)은 게임이 정한다.
- 스틱 탭은 뗀 순간의 스틱 입력에 `tap: true` 로 실려 온다. 더블탭은 없다 — 두 번째 탭을 기다리면 한 번 탭이 그만큼
  늦어진다. 스틱·제스처 탭 모두 늦추지 않고 바로 보낸다.
- 홀드한 채 그으면 뗄 때 `'hold'`, `'→'`, `'release'` 순으로 온다(모았다가 튕기기 등). 가드처럼 쓰는 게임은 홀드 중의 획을 무시하면 된다.
- 판정 값(획 12px 단위·최소 30px, 홀드 180ms, 탭 5px·200ms)은 DarkSeouls 패드에서 실측으로 맞춘 것을 가져왔다.
- 제스처가 무슨 동작인지(공격·회피 등)도 게임이 정한다.
- 플레이어는 `index`(0부터)로 구분한다. 나간 자리는 다음에 들어온 사람이 채운다.

## 직접 터치 (게임 화면)

터치 기기에서는 폰 없이 게임 화면을 직접 만져 조작하게 할 수 있다. 폰 컨트롤러와 **같은 인식 코드**라
판정·값이 같고, 받는 모양도 호스트와 같다.

```js
import { createTouch } from '@digitus/touch';

const touch = createTouch(window);  // 터치를 받을 대상. 이 영역을 반으로 나눈다(기본 window). 요소를 넘겨도 된다
touch.onStick = (state, side) => { /* { dx, dy, tap? } — host.onStick 과 같은 값 */ };
touch.onGesture = (gesture, side) => { /* 'tap' | 'hold' | 'release' | '→' … — host.onGesture 와 같은 문자열 */ };
touch.state.left; // 폴링용 { dx, dy } — 영역마다
touch.setLayout({ left: 'stick', right: 'stick' }); // host.setLayout 과 같다
touch.destroy();
```

- 마우스도 같이 받는다(왼쪽 버튼). 끄려면 `createTouch(window, { mouse: false })`.
- 버튼·링크 등 조작 요소 위(와 `data-digitus-ignore` 안)에서 시작한 터치는 입력으로 치지 않는다.
- 대상에 `touch-action: none` 을 걸어 스크롤·확대를 막는다(window 면 문서 전체). `destroy()` 때 되돌린다.

## 배포

컨트롤러 페이지는 `main` 에 push 하면 GitHub Actions(`.github/workflows/pages.yml`)가 빌드해
**https://iyagist.github.io/digitus/** 에 올린다. 정적 파일(HTML·JS·CSS)뿐이라 서버는 없다.
처음 한 번 저장소 Settings → Pages → Source 를 "GitHub Actions" 로 둬야 한다.

## 개발

```bash
pnpm install
pnpm dev        # 컨트롤러 https://<LAN IP>:5180 + 데모 http://localhost:5181
pnpm build      # 컨트롤러 페이지 빌드 → apps/controller/dist
pnpm typecheck
pnpm lint
```

1. PC 에서 http://localhost:5181 을 연다.
2. 폰을 **같은 와이파이**에 두고 QR 을 찍는다.
3. 개발용 자체 서명 인증서라 폰에서 한 번 "안전하지 않음"을 허용해야 한다.

컨트롤러가 HTTPS 여야 하는 이유: Trystero 가 연결 정보를 `crypto.subtle` 로 암호화하는데, 이건 보안 컨텍스트
(HTTPS 또는 localhost)에서만 돈다. 배포처(Cloudflare Pages, GitHub Pages 등)는 모두 HTTPS 라 문제없다.

## 알아둘 점

- **인터넷이 필요하다.** 서로를 찾는 단계가 공개 Nostr 릴레이를 거친다. 연결된 뒤 입력은 직접 오간다.
  공개 릴레이가 불안하면 Trystero 의 다른 방식(MQTT, 자체 WebSocket 릴레이 등)으로 바꿀 수 있다.
- **방 이름을 아는 사람만 붙는다.** 방 이름(16자 무작위)으로 연결 정보가 암호화되고, 방 이름은 QR 주소의
  해시(`#`)에만 있어 컨트롤러 페이지 서버로도 가지 않는다.
- **직접 연결이 막히는 네트워크**(일부 회사·학교 망)에서는 TURN 서버가 필요하다 — `createHost` 의
  `rtcConfig` 로 넣는다. 컨트롤러 쪽 설정은 아직 없다.
- 호스트 탭을 닫으면 폰이 바로 안다(`pagehide` 에서 방을 나감).

## 아직 없는 것

- 스팀(Electron)판의 인터넷 없는 LAN 연결 — 연결 방식을 하나 더 두는 식으로 붙일 자리.
- Gamepad API 흉내(폰 입력을 `navigator.getGamepads()` 로 노출).
