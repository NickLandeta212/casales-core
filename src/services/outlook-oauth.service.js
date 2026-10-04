const { pool } = require('../config/database');
const HttpError = require('../utils/httpError');

// Microsoft ya no acepta contrasenas para enviar correo desde aplicaciones en cuentas de Outlook:
// el envio se autoriza una sola vez con `npm run mail:outlook-login` (OAuth2) y se hace por Microsoft Graph.
const SCOPE = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';
const REFRESH_TOKEN_KEY = 'outlook_refresh_token';
const EXPIRY_MARGIN_MS = 60 * 1000;

let cachedAccessToken = null;
let pendingRefresh = null;

function isEnabled() {
  return Boolean(String(process.env.OUTLOOK_CLIENT_ID || '').trim());
}

function getClientId() {
  const clientId = String(process.env.OUTLOOK_CLIENT_ID || '').trim();

  if (!clientId) {
    throw new HttpError(503, 'Falta OUTLOOK_CLIENT_ID para enviar correo con Outlook');
  }

  return clientId;
}

// 'consumers' = cuentas personales (@outlook.com, @hotmail.com). Para Microsoft 365 usa el id del tenant.
function oauthUrl(endpoint) {
  const tenant = String(process.env.OUTLOOK_TENANT || 'consumers').trim();

  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/${endpoint}`;
}

async function postForm(url, params) {
  let response;

  try {
    response = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
  } catch (error) {
    throw new HttpError(502, `No se pudo conectar con Microsoft: ${error.message}`);
  }

  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}

async function readRefreshToken() {
  const result = await pool.query('SELECT valor FROM ajustes_internos WHERE clave = $1', [REFRESH_TOKEN_KEY]);

  return result.rows[0]?.valor || null;
}

async function saveRefreshToken(refreshToken) {
  await pool.query(
    `INSERT INTO ajustes_internos (clave, valor) VALUES ($1, $2)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
    [REFRESH_TOKEN_KEY, refreshToken]
  );
}

function rememberTokens(data) {
  cachedAccessToken = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 0) * 1000 - EXPIRY_MARGIN_MS,
  };

  return cachedAccessToken.value;
}

async function refreshAccessToken() {
  const refreshToken = await readRefreshToken();

  if (!refreshToken) {
    throw new HttpError(503, 'El correo de Outlook no esta autorizado. Ejecuta: npm run mail:outlook-login');
  }

  const { ok, data } = await postForm(oauthUrl('token'), {
    client_id: getClientId(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPE,
  });

  if (!ok) {
    console.error('Microsoft rechazo la renovacion del correo:', data.error, data.error_description);
    throw new HttpError(503, 'La autorizacion del correo de Outlook vencio o fue revocada. Ejecuta: npm run mail:outlook-login');
  }

  // Microsoft entrega un refresh token nuevo en cada renovacion; el anterior caduca a los 90 dias.
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await saveRefreshToken(data.refresh_token);
  }

  return rememberTokens(data);
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.value;
  }

  // Una sola renovacion a la vez aunque lleguen varios envios juntos.
  if (!pendingRefresh) {
    pendingRefresh = refreshAccessToken().finally(() => {
      pendingRefresh = null;
    });
  }

  return pendingRefresh;
}

// Inicio de sesion por codigo de dispositivo (lo usa scripts/outlook-login.js).
async function requestDeviceCode() {
  const { ok, data } = await postForm(oauthUrl('devicecode'), { client_id: getClientId(), scope: SCOPE });

  if (!ok) {
    throw new Error(`Microsoft no entrego el codigo: ${data.error_description || data.error || 'error desconocido'}`);
  }

  return data;
}

async function waitForDeviceLogin(deviceCode) {
  let intervalMs = Number(deviceCode.interval || 5) * 1000;
  const deadline = Date.now() + Number(deviceCode.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const { ok, data } = await postForm(oauthUrl('token'), {
      client_id: getClientId(),
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode.device_code,
    });

    if (ok) {
      if (!data.refresh_token) {
        throw new Error('Microsoft no entrego una sesion renovable (falta el permiso offline_access)');
      }

      await saveRefreshToken(data.refresh_token);
      return rememberTokens(data);
    }

    if (data.error === 'slow_down') {
      intervalMs += 5000;
    } else if (data.error !== 'authorization_pending') {
      throw new Error(`Microsoft rechazo el inicio de sesion: ${data.error_description || data.error}`);
    }
  }

  throw new Error('El codigo vencio antes de completar el inicio de sesion');
}

// Envia un mensaje ya armado en formato MIME desde el buzon autorizado.
async function sendMime(mimeBuffer) {
  const accessToken = await getAccessToken();
  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain' },
    body: mimeBuffer.toString('base64'),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error?.message || `Microsoft Graph respondio ${response.status}`);
  }
}

// Correo de la cuenta que autorizo el envio.
async function getAccountEmail() {
  const accessToken = await getAccessToken();
  const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Microsoft Graph respondio ${response.status} al consultar la cuenta`);
  }

  const account = await response.json();

  return String(account.mail || account.userPrincipalName || '').trim();
}

module.exports = { isEnabled, getAccessToken, requestDeviceCode, waitForDeviceLogin, sendMime, getAccountEmail };
