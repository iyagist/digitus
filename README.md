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
| `packages/protocol` | 호스트·컨트롤러가 공유하는 약속: 메시지 형식, 입력 상태, 제스처, 주소 |
| `packages/host` | 게임이 가져다 쓰는 라이브러리. 방을 열고 스틱·제스처를 받는다 |
| `apps/controller` | 폰 컨트롤러 페이지. **모든 게임이 이 페이지 하나를 같이 쓴다** |
| `apps/demo` | 호스트 사용 예. 입력을 화면에 그대로 보여준다 |

## 컨트롤러

플레이어는 폰을 보지 않고 게임 화면을 보며 조작한다. 그래서 컨트롤러는 **아무것도 그리지 않는다** —
버튼 자리를 찾아 폰을 봐야 한다면 패드가 아니다. 화면을 반으로 나눠, 손가락이 처음 닿은 쪽이 역할을 정한다.

| 화면 | 역할 |
|---|---|
| 왼쪽 절반 | **스틱.** 닿은 곳에서 지금 위치까지의 이동량(px) `{ dx, dy }`. 끝이 없다 — 끄는 만큼 커진다. 끌지 않고 짧게 두 번 두드리면 `dtap` 횟수가 는다 |
| 오른쪽 절반 | **제스처.** 문자열 하나: `tap` / `hold` → `release`(롱탭) / 획 `→←↑↓` 을 이은 것(`↓↑` 등, 뗄 때) |

폰 방향은 상관없다(세로·가로 모두 그때 화면의 왼쪽·오른쪽 절반). 양쪽 손가락은 동시에 쓸 수 있다.

## 사용법 (게임 쪽)

```js
import { createHost } from '@digitus/host';

const host = createHost({
  appId: 'my-game',                                     // 게임마다 고유
  controllerUrl: 'https://iyagist.github.io/digitus/',  // 컨트롤러 페이지 주소
});

showQrCode(host.url);  // QR 생성은 게임 몫 (demo 는 qrcode 패키지 사용)

// 스틱: 이벤트로 받거나
host.onInput = (state, player) => { /* state = { dx, dy, dtap } — dtap 이 늘면 더블탭 */ };
// 게임 루프에서 읽는다
for (const player of host.players.values()) player.state.dx;

// 제스처: 이벤트로만, 문자열 하나
host.onGesture = (gesture, player) => {
  // 'tap' | 'hold' | 'release' | '→' | '↓↑' | '→←→' …
};
```

- 스틱 값은 폰 화면의 CSS px 정수, 화면 좌표계(오른쪽 +x, 아래 +y). 떼면 `0, 0`. 데드존·최대치는 게임이 정한다.
- 스틱은 매번 **전체 스냅샷**이다. 하나를 놓쳐도 다음 것으로 복구된다.
- 더블탭은 **왼쪽(스틱)** 에서 나고 스틱 상태의 `dtap`(누적 횟수)로 온다(DarkSeouls 의 회피와 같은 자리).
  스냅샷이라 한 번짜리 표시 대신 횟수로 둔다 — 게임은 직전 값보다 늘었는지 본다. 왼쪽 한 번 톡은 아무 뜻이 없어
  기다릴 필요가 없고, 그래서 오른쪽 `'tap'` 도 늦추지 않고 바로 보낸다.
- 홀드한 채 그으면 뗄 때 `'hold'`, `'→'`, `'release'` 순으로 온다(모았다가 튕기기 등). 가드처럼 쓰는 게임은 홀드 중의 획을 무시하면 된다.
- 판정 값(획 12px 단위·최소 30px, 홀드 180ms, 더블탭 5px·200ms·300ms·60px)은 DarkSeouls 패드에서 실측으로 맞춘 것을 가져왔다.
- 제스처가 무슨 동작인지(공격·회피 등)도 게임이 정한다.
- 플레이어는 `index`(0부터)로 구분한다. 나간 자리는 다음에 들어온 사람이 채운다.

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
