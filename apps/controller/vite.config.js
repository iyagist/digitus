import basicSsl from '@vitejs/plugin-basic-ssl';

/** @type {import('vite').UserConfig} */
export default {
  // 폰에서 접속하므로 LAN 에 연다. Trystero 의 암호화(crypto.subtle)가 HTTPS 에서만 돌아 자체 서명 인증서를 쓴다.
  plugins: [basicSsl()],
  base: './',
  server: { host: true, port: 5180, strictPort: true },
};
