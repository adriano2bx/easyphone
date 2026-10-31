'use strict';

const os = require('node:os');
const { validateDriver } = require('./validation.cjs');

// Configuração gerada por sessão. Não contém credenciais; senhas entram só pelo comando uanew.
const SAFE_PATH_RE = /^[^\r\n]+$/;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const RTP_RE = /^\d{1,5}-\d{1,5}$/;
const DEVICE_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

function pickLocalAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function assertConcreteAddress(address) {
  const match = IPV4_RE.exec(address || '');
  if (!match || match.slice(1).some((part) => Number(part) > 255)) throw new Error('Endereço local inválido para o SIP.');
  if (address === '0.0.0.0') throw new Error('Endereço 0.0.0.0 não é permitido para escuta do SIP.');
}

function renderBaresipConfig({ ctrlPort, modulePath, localAddress, caFile, caPath, rtpPorts, audio, ringFile }) {
  if (!Number.isInteger(ctrlPort) || ctrlPort < 1024 || ctrlPort > 65535) throw new Error('Porta de controle inválida.');
  if (!SAFE_PATH_RE.test(modulePath || '')) throw new Error('Caminho dos módulos inválido.');
  if (caFile !== undefined && !SAFE_PATH_RE.test(caFile)) throw new Error('Caminho do CA inválido.');
  if (caPath !== undefined && !SAFE_PATH_RE.test(caPath)) throw new Error('Caminho do CA inválido.');
  if (ringFile !== undefined && !SAFE_PATH_RE.test(ringFile)) throw new Error('Caminho do toque inválido.');
  assertConcreteAddress(localAddress);
  if (!RTP_RE.test(rtpPorts)) throw new Error('Faixa de portas RTP inválida.');
  if (!DEVICE_RE.test(audio.device || '')) throw new Error('Dispositivo de áudio inválido.');
  const driver = validateDriver(audio.driver);

  const lines = [
    '# Gerado pelo easyphone para uma sessão local. Não contém credenciais.',
    `module_path ${modulePath}`,
    'module g711.so',
    'module auconv.so',
    'module auresamp.so',
    `module ${driver}.so`,
    // The menu module registers dynamic UA commands (uanew/uareg/uadel) used over ctrl_tcp.
    'module menu.so',
    'module_app ctrl_tcp.so',
    // Controle só em loopback: o padrão do ctrl_tcp é 0.0.0.0:4444.
    `ctrl_tcp_listen 127.0.0.1:${ctrlPort}`,
    // WebSocket/WSS não entram aqui: o padrão do Baresip inclui ws,wss.
    'sip_transports udp,tcp,tls',
    'sip_trans_def udp',
    // Endereço concreto da interface, nunca 0.0.0.0; porta efetiva escolhida pelo sistema.
    `sip_listen ${localAddress}:0`,
    'sip_verify_server yes',
    `rtp_ports ${rtpPorts}`,
    `audio_player ${driver},${audio.device}`,
    `audio_source ${driver},${audio.device}`,
    `audio_alert ${driver},${audio.device}`,
  ];
  if (ringFile) lines.push(`ring_aufile ${ringFile}`);
  if (caFile) lines.push(`sip_cafile ${caFile}`);
  if (caPath) lines.push(`sip_capath ${caPath}`);
  return `${lines.join('\n')}\n`;
}

module.exports = { renderBaresipConfig, pickLocalAddress };
