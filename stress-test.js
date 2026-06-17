import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

const BASE_URL = __ENV.URL || 'https://calculadora-zeta-seven.vercel.app';
const BYPASS = __ENV.BYPASS || 'xlJMiVrJs3fh0vSIrguerpfhCMS6HyuQ';

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '30s', target: 30 },
    { duration: '15s', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.2'],
  },
};

export default function () {
  const jar = http.cookieJar();

  jar.set(`${BASE_URL}/`, '_vercel_jwt', '');

  const bypassUrl = `${BASE_URL}/api/me?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${BYPASS}`;
  const bypassRes = http.get(bypassUrl, { headers: { Cookie: `x-vercel-protection-bypass=${BYPASS}` } });

  const cookies = jar.cookiesForURL(`${BASE_URL}/`);
  if (!cookies._vercel_jwt && !cookies['x-vercel-protection-bypass']) {
    console.warn('No se pudo obtener cookie de bypass');
  }

  const username = `user_${randomString(8)}`;
  const password = 'test1234';

  const registerRes = http.post(`${BASE_URL}/api/register`, JSON.stringify({
    username, password,
  }), { headers: { 'Content-Type': 'application/json' } });

  check(registerRes, {
    'registro exitoso': (r) => r.status === 200,
  });

  const loginRes = http.post(`${BASE_URL}/api/login`, JSON.stringify({
    username, password,
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, {
    'login exitoso': (r) => r.status === 200,
  });

  let token = '';
  if (loginRes.status === 200) {
    try { token = loginRes.json('token'); } catch (e) {}
  }

  const expressions = [
    '2+2', '10*5', '100/4', '50-23', '3.14*2',
    '(5+3)*2', '100/3', '45+67', '89*12', '500-123',
    'Math.PI', 'Math.sqrt(16)', 'Math.pow(2,10)', '25*4+10', '(8+2)*5',
  ];

  for (let i = 0; i < 5; i++) {
    const expr = expressions[Math.floor(Math.random() * expressions.length)];
    const calcRes = http.post(`${BASE_URL}/api/calculate`,
      JSON.stringify({ expression: expr }),
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }
    );
    check(calcRes, {
      'calculo exitoso': (r) => r.status === 200,
    });
    sleep(0.5 + Math.random());
  }

  const historyRes = http.get(`${BASE_URL}/api/calculations?page=1&limit=5`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  check(historyRes, {
    'historia cargada': (r) => r.status === 200,
  });

  sleep(1);
}
