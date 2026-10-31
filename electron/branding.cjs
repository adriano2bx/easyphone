'use strict';

// Logo personalizado do easyphone, guardado só neste dispositivo (pasta branding do userData).
// Este módulo não importa o Electron: recebe o diretório e recebe o caminho escolhido pelo main process.
// Nada aqui usa rede. Formato e tamanho são validados pelo conteúdo do arquivo, nunca pela extensão.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PhoneError } = require('../engine/errors.cjs');

const LOGO_MAX_BYTES = 1024 * 1024; // 1 MiB
const LOGO_BASENAME = 'custom-logo';
const LOGO_FILE_PATTERN = /^custom-logo\.(png|jpg|webp)$/;
const TEMP_FILE_PATTERN = /^\.logo-[0-9a-f-]+\.tmp$/;
const FORMATS = {
  png: { mime: 'image/png' },
  jpg: { mime: 'image/jpeg' },
  webp: { mime: 'image/webp' },
};

// Assinatura real do conteúdo. SVG, GIF, executáveis e qualquer outro conteúdo não passam.
function detectLogoFormat(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buf.subarray(12, 16).toString('latin1') === 'IHDR') {
    return { ext: 'png', ...FORMATS.png };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf.lastIndexOf(Buffer.from([0xff, 0xd9])) > 2) {
    return { ext: 'jpg', ...FORMATS.jpg };
  }
  if (buf.length >= 16 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    const chunk = buf.subarray(12, 16).toString('latin1');
    if (chunk === 'VP8 ' || chunk === 'VP8L' || chunk === 'VP8X') return { ext: 'webp', ...FORMATS.webp };
  }
  return null;
}

function rejectInvalid() {
  return new PhoneError('LOGO_INVALID_FORMAT', 'Formato não aceito. Use um arquivo PNG, JPEG ou WebP.');
}

// Lê o arquivo escolhido com limite de tamanho verificado antes de carregar tudo na memória.
function readLogoSource(sourcePath) {
  const fd = fs.openSync(sourcePath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new PhoneError('LOGO_NOT_A_FILE', 'Escolha um arquivo de imagem.');
    if (stat.size > LOGO_MAX_BYTES) throw new PhoneError('LOGO_TOO_LARGE', 'A imagem passa de 1 MiB. Escolha um arquivo menor.');
    if (stat.size === 0) throw rejectInvalid();
    const bytes = Buffer.alloc(stat.size);
    const read = fs.readSync(fd, bytes, 0, stat.size, 0);
    if (read !== stat.size) throw rejectInvalid();
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function createBrandingStore(brandingDir) {
  function logoFiles() {
    try {
      return fs.readdirSync(brandingDir)
        .map((name) => ({ name, match: LOGO_FILE_PATTERN.exec(name) }))
        .filter((entry) => entry.match)
        .map((entry) => ({ name: entry.name, ext: entry.match[1] }));
    } catch {
      return [];
    }
  }

  // Devolve o logo validado ou null. Arquivo inválido não é apagado aqui; o renderer cai no logo oficial.
  function load() {
    const [file] = logoFiles();
    if (!file) return null;
    try {
      const bytes = readLogoSource(path.join(brandingDir, file.name));
      const format = detectLogoFormat(bytes);
      if (!format || format.ext !== file.ext) return null;
      return { mime: format.mime, bytes };
    } catch {
      return null;
    }
  }

  // Copia o arquivo para dentro do diretório por escrita atômica (temporário + rename), sem caminho vindo do renderer.
  function save(sourcePath) {
    const bytes = readLogoSource(sourcePath);
    const format = detectLogoFormat(bytes);
    if (!format) throw rejectInvalid();

    fs.mkdirSync(brandingDir, { recursive: true, mode: 0o700 });
    const temporary = path.join(brandingDir, `.logo-${crypto.randomUUID()}.tmp`);
    const target = path.join(brandingDir, `${LOGO_BASENAME}.${format.ext}`);
    try {
      fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, target);
    } catch {
      fs.rmSync(temporary, { force: true });
      throw new PhoneError('LOGO_WRITE_FAILED', 'Não foi possível guardar o logo neste dispositivo.');
    }
    // Remove outro formato antigo de logo, depois que o novo já está no lugar.
    for (const file of logoFiles()) {
      if (file.ext !== format.ext) fs.rmSync(path.join(brandingDir, file.name), { force: true });
    }
    return { mime: format.mime };
  }

  // Remove só os arquivos de logo (e temporários próprios deste módulo). Nada mais na pasta é tocado.
  function reset() {
    for (const file of logoFiles()) fs.rmSync(path.join(brandingDir, file.name), { force: true });
    try {
      for (const name of fs.readdirSync(brandingDir)) {
        if (TEMP_FILE_PATTERN.test(name)) fs.rmSync(path.join(brandingDir, name), { force: true });
      }
    } catch {
      // Pasta ainda não existe: nada a remover.
    }
  }

  return { load, save, reset, directory: brandingDir };
}

module.exports = { createBrandingStore, detectLogoFormat, LOGO_MAX_BYTES };
