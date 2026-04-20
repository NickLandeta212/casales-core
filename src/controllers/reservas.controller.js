const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const reservaModel = require('../models/reserva.model');
const departamentoModel = require('../models/departamento.model');
const torreModel = require('../models/torre.model');

const validStates = ['disponible', 'en_proceso', 'reservado'];

function stripTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getPublicAppUrl(req) {
  const configured = stripTrailingSlash(process.env.PUBLIC_APP_URL);

  if (configured) {
    return configured;
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();

  if (!forwardedHost) {
    return '';
  }

  return `${forwardedProto}://${forwardedHost}`;
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();

  for (const interfaceEntries of Object.values(interfaces)) {
    for (const entry of interfaceEntries || []) {
      if (!entry || entry.internal || (entry.family !== 'IPv4' && entry.family !== 4)) {
        continue;
      }

      if (entry.address && entry.address !== '127.0.0.1') {
        return entry.address;
      }
    }
  }

  return '';
}

function getAccessiblePublicBaseUrl(req) {
  const configured = getPublicAppUrl(req);
  if (configured) {
    return configured;
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim() || 'http';
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();

  if (forwardedHost && !/^localhost(?::\d+)?$/i.test(forwardedHost) && !/^127\.0\.0\.1(?::\d+)?$/i.test(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const localIp = getLocalIpAddress();
  if (localIp) {
    const port = String(req.get('host') || '').split(':')[1] || process.env.PORT || '3000';
    return `${forwardedProto}://${localIp}:${port}`;
  }

  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPublicReservationPage(token) {
  const safeToken = escapeHtml(token);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reserva por QR</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Arial, sans-serif; margin: 0; background: #f3f6f1; color: #173126; }
    main { max-width: 860px; margin: 0 auto; padding: 24px; }
    .card { background: #fff; border-radius: 18px; padding: 24px; box-shadow: 0 10px 40px rgba(23,49,38,.08); border: 1px solid #d8e6da; }
    h1, h2, h3, p { margin-top: 0; }
    label { display: block; margin-bottom: 12px; font-size: 14px; }
    input, select, textarea, button { width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid #c7d6c9; padding: 12px 14px; font: inherit; }
    textarea { min-height: 96px; resize: vertical; }
    button { background: #173126; color: #fff; border: 0; cursor: pointer; font-weight: 700; }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .grid { display: grid; gap: 12px; }
    .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .actions button, .actions a { width: auto; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
    .muted { color: #52645a; }
    .error { background: #feeaea; color: #992222; padding: 12px 14px; border-radius: 12px; margin-bottom: 12px; }
    .ok { background: #e7f5ec; color: #1d6b3a; padding: 12px 14px; border-radius: 12px; margin-bottom: 12px; }
    .section { margin-top: 20px; }
    .calendar { display: grid; gap: 8px; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    .day, .empty { min-height: 54px; border-radius: 10px; border: 1px solid #d8e6da; display:flex; align-items:center; justify-content:center; }
    .day { background: #fff; color: #173126; font-weight: 700; cursor: pointer; }
    .day.selected { background: #173126; color: #fff; }
    .day.disabled { background: #eef2ee; color: #92a195; cursor: not-allowed; }
    .weekday { font-size: 12px; color: #52645a; text-align: center; }
    .small { font-size: 12px; }
    .proof-preview { width: 100%; max-width: 260px; border-radius: 12px; border: 1px solid #d8e6da; display: block; margin-top: 8px; }
    @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <p class="muted">Reserva por QR</p>
      <h1>Selecciona tu torre y registra tu reserva</h1>
      <p class="muted">Enlace generado para este conjunto. Si esta pagina la abres desde un celular en la misma red, el registro funciona directamente contra el backend.</p>
      <div id="status"></div>

      <form id="step1" class="grid">
        <div class="grid grid-2">
          <label>Nombres<input name="nombres" required /></label>
          <label>Apellidos<input name="apellidos" required /></label>
        </div>
        <div class="grid grid-2">
          <label>Documento<input name="documento" required /></label>
          <label>Telefono (opcional)<input name="telefono" /></label>
        </div>
        <div class="grid grid-2">
          <label>Torre<select name="torre_id" required><option value="">Cargando...</option></select></label>
          <label>Departamento<select name="departamento_id" required disabled><option value="">Selecciona una torre primero</option></select></label>
        </div>
        <div class="actions">
          <button type="submit">Continuar al calendario</button>
          <a class="muted" href="#" id="copyLink">Copiar enlace</a>
        </div>
      </form>

      <form id="step2" class="grid" style="display:none;">
        <h2>Fecha de reserva</h2>
        <p id="selectedInfo" class="muted"></p>
        <div class="grid grid-2">
          <label>Fecha<input type="date" name="fecha" required /></label>
          <label>Observaciones<textarea name="observaciones" placeholder="Opcional"></textarea></label>
        </div>
        <div>
          <p class="small muted">Fechas reservadas / ocupadas</p>
          <div class="calendar" id="dates"></div>
        </div>
        <div>
          <label>
            Foto del comprobante (opcional)
            <input id="proofFile" type="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <img id="proofPreview" class="proof-preview" alt="Vista previa comprobante" style="display:none;" />
        </div>
        <div class="actions">
          <button type="button" id="backBtn">Volver</button>
          <button type="submit" id="submitBtn">Enviar reserva</button>
        </div>
      </form>
    </section>
  </main>

  <script>
    const token = ${JSON.stringify(token)};
    const statusEl = document.getElementById('status');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const copyLink = document.getElementById('copyLink');
    const backBtn = document.getElementById('backBtn');
    const submitBtn = document.getElementById('submitBtn');
    const selectedInfo = document.getElementById('selectedInfo');
    const datesEl = document.getElementById('dates');
    const proofFileInput = document.getElementById('proofFile');
    const proofPreview = document.getElementById('proofPreview');
    const today = new Date();
    const minDate = today.toISOString().slice(0, 10);
    const state = { torres: [], departamentos: [], reservedDates: [], selectedDate: '' };

    function showMessage(type, message) {
      statusEl.innerHTML = message ? \`<div class="\${type}">\${message}</div>\` : '';
    }

    function pad(value) { return String(value).padStart(2, '0'); }

    function formatDate(date) {
      return \`\${date.getFullYear()}-\${pad(date.getMonth() + 1)}-\${pad(date.getDate())}\`;
    }

    function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el comprobante'));
        reader.readAsDataURL(file);
      });
    }

    function renderDates() {
      const reserved = new Set(state.reservedDates);
      datesEl.innerHTML = '';
      for (let offset = 0; offset < 30; offset += 1) {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        const value = formatDate(date);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'day' + (reserved.has(value) ? ' disabled' : '') + (state.selectedDate === value ? ' selected' : '');
        button.textContent = value.slice(8, 10);
        button.disabled = reserved.has(value);
        button.onclick = () => {
          state.selectedDate = value;
          document.querySelector('input[name="fecha"]').value = value;
          renderDates();
        };
        datesEl.appendChild(button);
      }
    }

    async function loadContext() {
      try {
        const response = await fetch(\`/reservas/public/\${token}/context\`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudo cargar el formulario');
        state.torres = data.torres || [];
        state.departamentos = data.departamentos || [];
        state.reservedDates = data.reserved_dates || [];
        const torreSelect = document.querySelector('select[name="torre_id"]');
        torreSelect.innerHTML = '<option value="">Selecciona tu torre</option>' + state.torres.map((torre) => \`<option value="\${torre.id}">Torre \${torre.numero}</option>\`).join('');
        renderDates();
      } catch (error) {
        showMessage('error', error.message);
      }
    }

    function updateDepartments() {
      const torreId = document.querySelector('select[name="torre_id"]').value;
      const departmentSelect = document.querySelector('select[name="departamento_id"]');
      const filtered = state.departamentos.filter((item) => String(item.torre_id) === String(torreId));
      departmentSelect.disabled = !torreId;
      departmentSelect.innerHTML = '<option value="">Selecciona tu departamento</option>' + filtered.map((dep) => \`<option value="\${dep.id}">Torre \${dep.torre_numero} · Dpto \${dep.numero}</option>\`).join('');
    }

    copyLink.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        await navigator.clipboard.writeText(window.location.href);
        showMessage('ok', 'Enlace copiado al portapapeles');
      } catch {
        showMessage('error', 'No se pudo copiar el enlace');
      }
    });

    document.querySelector('select[name="torre_id"]').addEventListener('change', () => {
      updateDepartments();
    });

    step1.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(step1);
      const nombres = String(formData.get('nombres') || '').trim();
      const apellidos = String(formData.get('apellidos') || '').trim();
      const documento = String(formData.get('documento') || '').trim();
      const torre_id = String(formData.get('torre_id') || '').trim();
      const departamento_id = String(formData.get('departamento_id') || '').trim();
      if (!nombres || !apellidos || !documento || !torre_id || !departamento_id) {
        showMessage('error', 'Completa nombres, apellidos, documento, torre y departamento');
        return;
      }
      selectedInfo.textContent = \`Torre \${torre_id} - Departamento \${departamento_id}\`;
      step1.style.display = 'none';
      step2.style.display = 'grid';
      showMessage('', '');
    });

    backBtn.addEventListener('click', () => {
      step2.style.display = 'none';
      step1.style.display = 'grid';
    });

    proofFileInput.addEventListener('change', () => {
      const file = proofFileInput.files && proofFileInput.files[0] ? proofFileInput.files[0] : null;
      if (!file) {
        proofPreview.style.display = 'none';
        proofPreview.src = '';
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      proofPreview.src = objectUrl;
      proofPreview.style.display = 'block';
    });

    step2.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form1 = new FormData(step1);
      const form2 = new FormData(step2);
      const fecha = String(form2.get('fecha') || '').trim();
      if (!fecha) {
        showMessage('error', 'Selecciona una fecha');
        return;
      }

      submitBtn.disabled = true;
      try {
        let comprobanteBase64 = '';
        const proofFile = proofFileInput.files && proofFileInput.files[0] ? proofFileInput.files[0] : null;
        if (proofFile) {
          comprobanteBase64 = await fileToDataUrl(proofFile);
        }

        const payload = {
          nombres: String(form1.get('nombres') || '').trim(),
          apellidos: String(form1.get('apellidos') || '').trim(),
          documento: String(form1.get('documento') || '').trim(),
          telefono: String(form1.get('telefono') || '').trim(),
          observaciones: String(form2.get('observaciones') || '').trim(),
          departamento_id: Number(String(form1.get('departamento_id') || '0')),
          fecha,
          comprobante_base64: comprobanteBase64,
        };

        const response = await fetch(\`/reservas/public/\${token}\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudo registrar la reserva');
        showMessage('ok', data.message || 'Reserva registrada correctamente');
        const refresh = await fetch(\`/reservas/public/\${token}/context\`);
        const refreshData = await refresh.json();
        state.reservedDates = refreshData.reserved_dates || [];
        renderDates();
      } catch (error) {
        showMessage('error', error.message);
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.querySelector('input[name="fecha"]').min = minDate;
    loadContext();
  </script>
</body>
</html>`;
}

function createPublicReservaToken() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado en el servidor');
  }

  return jwt.sign(
    {
      scope: 'public_reserva_general',
    },
    process.env.JWT_SECRET,
    { noTimestamp: true }
  );
}

function verifyPublicReservaToken(token) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado en el servidor');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.scope !== 'public_reserva_general') {
      throw new HttpError(401, 'Token QR invalido');
    }

    return decoded;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, 'Token QR invalido');
  }
}

function validatePublicPayload(body) {
  const { nombres, apellidos, documento, fecha, departamento_id } = body;

  if (!nombres || !apellidos || !documento || !fecha || !departamento_id) {
    throw new HttpError(400, 'nombres, apellidos, documento, departamento_id y fecha son requeridos');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    throw new HttpError(400, 'fecha debe tener formato YYYY-MM-DD');
  }
}

function isFutureOrToday(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requested = new Date(`${dateString}T00:00:00`);
  return requested >= today;
}

function saveComprobanteImage(dataUrl, departamentoId) {
  if (!dataUrl) {
    return null;
  }

  const match = String(dataUrl).match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);

  if (!match) {
    throw new HttpError(400, 'El comprobante debe ser una imagen PNG, JPG o WEBP valida');
  }

  const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const base64Payload = match[2];
  const buffer = Buffer.from(base64Payload, 'base64');
  const maxSizeInBytes = 4 * 1024 * 1024;

  if (buffer.length > maxSizeInBytes) {
    throw new HttpError(400, 'El comprobante supera el maximo de 4MB');
  }

  const uploadsDir = path.resolve(__dirname, '../../uploads/comprobantes');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const fileName = `dep-${departamentoId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;
  const fullPath = path.join(uploadsDir, fileName);

  fs.writeFileSync(fullPath, buffer);

  return `/uploads/comprobantes/${fileName}`;
}

function validatePayload(body) {
  const { departamento_id, fecha, estado } = body;

  if (!departamento_id || !fecha) {
    throw new HttpError(400, 'departamento_id y fecha son requeridos');
  }

  if (estado && !validStates.includes(estado)) {
    throw new HttpError(400, 'estado debe ser disponible, en_proceso o reservado');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    throw new HttpError(400, 'fecha debe tener formato YYYY-MM-DD');
  }
}

const list = asyncHandler(async (req, res) => {
  const reservas = req.user.role === 'condomino'
    ? await reservaModel.findAllByUsuarioId(req.user.sub)
    : await reservaModel.findAll();
  res.json(reservas);
});

const getById = asyncHandler(async (req, res) => {
  const reserva = req.user.role === 'condomino'
    ? await reservaModel.findByIdForUsuario(Number(req.params.id), req.user.sub)
    : await reservaModel.findById(Number(req.params.id));

  if (!reserva) {
    throw new HttpError(404, 'Reserva no encontrada');
  }

  res.json(reserva);
});

const create = asyncHandler(async (req, res) => {
  validatePayload(req.body);

  if (req.user.role === 'condomino') {
    const isOwner = await reservaModel.isDepartamentoOwnedByUsuario(Number(req.body.departamento_id), req.user.sub);

    if (!isOwner) {
      throw new HttpError(403, 'No puedes reservar para un departamento que no te pertenece');
    }
  }

  try {
    const reserva = await reservaModel.create({
      departamento_id: Number(req.body.departamento_id),
      fecha: req.body.fecha,
      estado: req.body.estado || 'disponible',
      observaciones: req.body.observaciones,
    });

    res.status(201).json(reserva);
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Ya existe una reserva para esa fecha');
    }

    throw error;
  }
});

const update = asyncHandler(async (req, res) => {
  validatePayload(req.body);

  if (req.user.role === 'condomino') {
    const targetReserva = await reservaModel.findByIdForUsuario(Number(req.params.id), req.user.sub);

    if (!targetReserva) {
      throw new HttpError(404, 'Reserva no encontrada');
    }

    const isOwner = await reservaModel.isDepartamentoOwnedByUsuario(Number(req.body.departamento_id), req.user.sub);

    if (!isOwner) {
      throw new HttpError(403, 'No puedes mover reservas a un departamento que no te pertenece');
    }
  }

  try {
    const reserva = await reservaModel.update(Number(req.params.id), {
      departamento_id: Number(req.body.departamento_id),
      fecha: req.body.fecha,
      estado: req.body.estado || 'disponible',
      observaciones: req.body.observaciones,
    });

    if (!reserva) {
      throw new HttpError(404, 'Reserva no encontrada');
    }

    res.json(reserva);
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Ya existe una reserva para esa fecha');
    }

    throw error;
  }
});

const remove = asyncHandler(async (req, res) => {
  if (req.user.role === 'condomino') {
    const targetReserva = await reservaModel.findByIdForUsuario(Number(req.params.id), req.user.sub);

    if (!targetReserva) {
      throw new HttpError(404, 'Reserva no encontrada');
    }
  }

  const reserva = await reservaModel.remove(Number(req.params.id));

  if (!reserva) {
    throw new HttpError(404, 'Reserva no encontrada');
  }

  res.json({ message: 'Reserva eliminada correctamente' });
});

const generatePublicToken = asyncHandler(async (req, res) => {
  const token = createPublicReservaToken();
  const publicAppUrl = getAccessiblePublicBaseUrl(req);

  const publicUrl = publicAppUrl
    ? `${publicAppUrl}/reservas/public/${token}`
    : `/reservas/public/${token}`;

  res.json({ token, public_url: publicUrl });
});

const publicPage = asyncHandler(async (req, res) => {
  verifyPublicReservaToken(req.params.token);
  // Esta vista usa CSS/JS inline; habilitamos CSP especifica para esta ruta.
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; base-uri 'self'; form-action 'self'");
  res.type('html').send(renderPublicReservationPage(req.params.token));
});

const publicContext = asyncHandler(async (req, res) => {
  verifyPublicReservaToken(req.params.token);
  const torres = await torreModel.findAll();
  const departamentos = await departamentoModel.findAll();

  const reservedDates = await reservaModel.findReservedDates();

  res.json({
    torres: torres.map((item) => ({ id: item.id, numero: item.numero })),
    departamentos: departamentos.map((item) => ({ id: item.id, numero: item.numero, torre_id: item.torre_id, torre_numero: item.torre_numero })),
    reserved_dates: reservedDates,
  });
});

const publicCreate = asyncHandler(async (req, res) => {
  verifyPublicReservaToken(req.params.token);
  validatePublicPayload(req.body);

  if (!isFutureOrToday(req.body.fecha)) {
    throw new HttpError(400, 'Solo puedes seleccionar la fecha de hoy o una fecha futura');
  }

  const departamentoId = Number(req.body.departamento_id);
  const departamento = await departamentoModel.findById(departamentoId);

  if (!departamento) {
    throw new HttpError(404, 'Departamento no encontrado');
  }

  const requester = {
    nombres: String(req.body.nombres).trim(),
    apellidos: String(req.body.apellidos).trim(),
    documento: String(req.body.documento).trim(),
    telefono: String(req.body.telefono || '').trim(),
  };

  const noteSections = [
    `[QR] Solicitante: ${requester.nombres} ${requester.apellidos}`,
    `Documento: ${requester.documento}`,
  ];

  const comprobanteUrl = saveComprobanteImage(req.body.comprobante_base64, departamentoId);

  if (requester.telefono) {
    noteSections.push(`Telefono: ${requester.telefono}`);
  }

  if (comprobanteUrl) {
    noteSections.push(`Comprobante: ${comprobanteUrl}`);
  }

  if (req.body.observaciones) {
    noteSections.push(`Observaciones: ${String(req.body.observaciones).trim()}`);
  }

  try {
    const reserva = await reservaModel.create({
      departamento_id: departamentoId,
      fecha: req.body.fecha,
      estado: 'en_proceso',
      observaciones: noteSections.join(' | '),
    });

    res.status(201).json({
      message: 'Solicitud de reserva enviada correctamente',
      reserva,
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'La fecha seleccionada ya no esta disponible');
    }

    throw error;
  }
});

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  generatePublicToken,
  publicPage,
  publicContext,
  publicCreate,
};
