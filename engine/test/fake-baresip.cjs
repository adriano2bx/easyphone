#!/usr/bin/env node
'use strict';

// Motor de teste que fala o protocolo ctrl_tcp (netstring + JSON) para exercitar o supervisor.
// NÃO é o Baresip e não faz SIP, RTP nem áudio: os eventos são roteirizados pelo modo (FAKE_MODE).
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { encodeNetstring, NetstringDecoder } = require('../netstring.cjs');

const mode = process.env.FAKE_MODE || 'normal';
const logPath = process.env.FAKE_LOG;
const configDir = process.argv[process.argv.indexOf('-f') + 1];
const config = fs.readFileSync(path.join(configDir, 'config'), 'utf8');
const listen = /^ctrl_tcp_listen 127\.0\.0\.1:(\d+)$/m.exec(config);
if (!listen) {
  process.stderr.write('fake-baresip: ctrl_tcp_listen ausente ou fora de loopback\n');
  process.exit(2);
}

const uas = [];
let client = null;
let callSeq = 0;
let currentCall = null;

function log(line) {
  if (logPath) fs.appendFileSync(logPath, `${line}\n`);
}

function write(message) {
  if (client) client.write(encodeNetstring(JSON.stringify(message)));
}

function emit(type, fields) {
  write({ event: true, class: type.startsWith('CALL') || type === 'TRANSFER' ? 'call' : 'ua', type, ...fields });
}

function registerLater(aor) {
  emit('REGISTERING', { accountaor: aor });
  setImmediate(() => {
    if (mode === 'auth-fail') emit('REGISTER_FAIL', { accountaor: aor, param: '401 Unauthorized' });
    else emit('REGISTER_OK', { accountaor: aor });
  });
}

function aorFromAccount(params) {
  const match = /<(sip:[^;>]+)/.exec(params);
  return match ? match[1] : '';
}

function indexAor(index) {
  return uas[Number(index)];
}

function handle(command, params) {
  const args = params ? params.split(' ') : [];
  switch (command) {
    case 'uanew': {
      const aor = aorFromAccount(params);
      uas.push(aor);
      if (mode === 'stderr-secret') process.stderr.write(`debug: ${params}\n`);
      if (!/regint=0/.test(params)) registerLater(aor);
      if (mode === 'incoming' || mode === 'second-incoming') {
        setImmediate(() => emit('CALL_INCOMING', { id: 'in1', accountaor: aor, peeruri: 'sip:paciente@example.test', direction: 'incoming' }));
      }
      if (mode === 'second-incoming') {
        // Segunda chamada chega enquanto a primeira ainda toca: o motor deve recusá-la com 486, não exibi-la.
        setImmediate(() => setImmediate(() => emit('CALL_INCOMING', { id: 'in2', accountaor: aor, peeruri: 'sip:outro@example.test', direction: 'incoming' })));
      }
      return { ok: true, data: `Creating UA for ${params}\n` };
    }
    case 'uareg': {
      const aor = indexAor(args[1]);
      if (!aor) return { ok: false, data: `no User-Agent at pos ${args[1]}\n` };
      if (args[0] === '0') emit('UNREGISTERING', { accountaor: aor });
      else registerLater(aor);
      return { ok: true, data: '' };
    }
    case 'uadel': {
      // Premissa do fake (não verificada no Baresip real): o AOR de uadel casa com o de uanew ignorando a porta.
      const wanted = String(args[0] || '').replace(/:\d+(?=[;>]|$)/, '');
      const at = uas.findIndex((aor) => aor.replace(/:\d+(?=[;>]|$)/, '') === wanted);
      if (at === -1) return { ok: false, data: '' };
      uas.splice(at, 1);
      return { ok: true, data: '' };
    }
    case 'uadelall':
      uas.length = 0;
      return { ok: true, data: '' };
    case 'dial': {
      const aor = indexAor(args[1]);
      if (!aor) return { ok: false, data: 'could not find UA' };
      callSeq += 1;
      const id = `c${callSeq}`;
      currentCall = id;
      emit('CALL_OUTGOING', { id, accountaor: aor, peeruri: args[0], direction: 'outgoing' });
      setImmediate(() => {
        emit('CALL_RINGING', { id, accountaor: aor, peeruri: args[0], direction: 'outgoing' });
        emit('CALL_ESTABLISHED', { id, accountaor: aor, peeruri: args[0], direction: 'outgoing' });
      });
      return { ok: true, data: '' };
    }
    case 'accept':
      emit('CALL_ESTABLISHED', { id: args[0] });
      return { ok: true, data: '' };
    case 'hangup':
      emit('CALL_CLOSED', { id: args[0], param: 'local hangup' });
      return { ok: true, data: '' };
    case 'callfind':
      if (args[0] !== currentCall && args[0] !== 'in1') return { ok: false, data: `call not found (id=${args[0]})` };
      currentCall = args[0];
      return { ok: true, data: '' };
    case 'mute':
    case 'sndcode':
    case 'transfer':
    case 'ausrc':
    case 'auplay':
      return { ok: true, data: '' };
    case 'hold':
      emit('CALL_HOLD', { id: args[0] });
      return { ok: true, data: '' };
    case 'resume':
      emit('CALL_RESUME', { id: args[0] });
      return { ok: true, data: '' };
    default:
      return { ok: false, data: `unknown command: ${command}` };
  }
}

const server = net.createServer((socket) => {
  if (client) {
    socket.destroy();
    return;
  }
  client = socket;
  const decoder = new NetstringDecoder();
  if (mode === 'crash') setTimeout(() => process.exit(3), 50);
  socket.on('data', (chunk) => {
    for (const text of decoder.push(chunk)) {
      const message = JSON.parse(text);
      const line = message.params ? `${message.command} ${message.params}` : message.command;
      log(line);
      const { ok, data } = handle(message.command, message.params);
      write({ response: true, ok, data, token: message.token });
    }
  });
  socket.on('close', () => { client = null; });
  socket.on('error', () => socket.destroy());
});

server.listen(Number(listen[1]), '127.0.0.1');

process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
