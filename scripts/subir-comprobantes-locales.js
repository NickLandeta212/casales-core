// Sube a Supabase Storage los comprobantes que quedaron en disco (uploads/comprobantes).
// Se puede repetir: los archivos ya subidos se sobrescriben con el mismo contenido. No borra nada del disco.
require('dotenv').config({ override: true });

const fs = require('fs');
const path = require('path');
const comprobantesService = require('../src/services/comprobantes.service');

const uploadsDir = path.resolve(__dirname, '../uploads/comprobantes');

async function main() {
  if (!fs.existsSync(uploadsDir)) {
    console.log('No existe uploads/comprobantes: no hay nada que subir.');
    return;
  }

  let subidos = 0;
  let omitidos = 0;

  for (const entry of fs.readdirSync(uploadsDir)) {
    const fileName = comprobantesService.getFileName(entry);

    if (!fileName) {
      console.warn(`Omitido (nombre no valido): ${entry}`);
      omitidos += 1;
      continue;
    }

    await comprobantesService.uploadFile(fileName, fs.readFileSync(path.join(uploadsDir, entry)), { upsert: true });
    subidos += 1;
  }

  console.log(`${subidos} comprobante(s) subido(s), ${omitidos} omitido(s).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
