import { networkInterfaces } from 'node:os';

/** 폰이 닿을 수 있는 이 PC 의 LAN 주소. */
function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

/** @type {import('vite').UserConfig} */
export default {
  // localhost 는 보안 컨텍스트라 데모 자체는 HTTP 로 충분하다.
  server: { port: 5181, strictPort: true },
  define: {
    'import.meta.env.VITE_CONTROLLER_URL': JSON.stringify(
      process.env.VITE_CONTROLLER_URL ?? `https://${lanAddress()}:5180/`,
    ),
  },
};
