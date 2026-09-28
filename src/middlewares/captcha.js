// CAPTCHA opcional para los formularios publicos (Cloudflare Turnstile, gratuito).
// Se activa solo si TURNSTILE_SECRET_KEY esta definido; el frontend debe tener la site key correspondiente.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function isCaptchaEnabled() {
  return Boolean(String(process.env.TURNSTILE_SECRET_KEY || '').trim());
}

async function verifyCaptcha(req, res, next) {
  if (!isCaptchaEnabled()) {
    return next();
  }

  const token = String(req.body?.captcha_token || '').trim();

  if (!token) {
    return res.status(400).json({ message: 'Completa la verificacion de seguridad (captcha)' });
  }

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: req.ip || '',
      }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();

    if (!result.success) {
      return res.status(400).json({ message: 'La verificacion de seguridad no es valida. Intenta nuevamente.' });
    }

    return next();
  } catch (error) {
    console.error('No se pudo validar el captcha:', error.message);
    return res.status(503).json({ message: 'No se pudo validar la verificacion de seguridad. Intenta mas tarde.' });
  }
}

module.exports = { verifyCaptcha, isCaptchaEnabled };
