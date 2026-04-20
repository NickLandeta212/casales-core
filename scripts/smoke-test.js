const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const credentials = {
  email: process.env.SMOKE_EMAIL || 'admin@conjunto.com',
  password: process.env.SMOKE_PASSWORD || 'Admin123*',
};

async function toJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function run() {
  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  const loginData = await toJson(loginResponse);

  if (!loginResponse.ok) {
    throw new Error(`Login fallo (${loginResponse.status}): ${JSON.stringify(loginData)}`);
  }

  const token = loginData.token;

  const meResponse = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meData = await toJson(meResponse);

  if (!meResponse.ok) {
    throw new Error(`/auth/me fallo (${meResponse.status}): ${JSON.stringify(meData)}`);
  }

  const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const refreshData = await toJson(refreshResponse);

  if (!refreshResponse.ok) {
    throw new Error(`/auth/refresh fallo (${refreshResponse.status}): ${JSON.stringify(refreshData)}`);
  }

  const torresResponse = await fetch(`${BASE_URL}/torres`);
  const torresData = await toJson(torresResponse);

  if (!torresResponse.ok) {
    throw new Error(`/torres fallo (${torresResponse.status}): ${JSON.stringify(torresData)}`);
  }

  console.log('Smoke test OK');
  console.log({
    loginUser: loginData.user,
    meUser: meData.user,
    refreshMessage: refreshData.message,
    totalTorres: Array.isArray(torresData) ? torresData.length : 0,
  });
}

run().catch((error) => {
  console.error('Smoke test ERROR:', error.message);
  process.exit(1);
});
