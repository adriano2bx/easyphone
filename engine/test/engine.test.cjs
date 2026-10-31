'use strict';

// Testes do engine. Rodar com: node --test phone-desktop/engine/test/
// O motor real (Baresip) não está instalado no host; os testes de processo usam fake-baresip.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPhoneEngine, PhoneError, validateAccountDraft } = require('../index.cjs');
const { encodeNetstring, NetstringDecoder } = require('../netstring.cjs');
const { renderBaresipConfig } = require('../baresip-config.cjs');
const { validateDestination, buildAccountString } = require('../validation.cjs');

const FAKE = path.join(__dirname, 'fake-baresip.cjs');
const PASSWORD = 'segredo-de-teste-42';
const ACCOUNT = {
  label: 'Recepção',
  username: '1001',
  domain: 'pbx.example.test',
  port: 5061,
  transport: 'tls',
  password: PASSWORD,
};

function waitFor(engine, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('tempo esgotado aguardando estado do engine'));
    }, timeoutMs);
    const check = (snapshot) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(snapshot);
    };
    const unsubscribe = engine.onSnapshot(check);
    check(engine.snapshot());
  });
}

async function until(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('tempo esgotado aguardando condição');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function withFakeEngine(t, { mode = 'normal', stderrSecret = '', binaryPath } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-engine-test-'));
  const logPath = path.join(root, 'commands.log');
  const wrapper = path.join(root, 'baresip');
  fs.writeFileSync(
    wrapper,
    `#!/bin/sh\nFAKE_LOG="${logPath}" FAKE_MODE="${mode}" FAKE_STDERR_SECRET="${stderrSecret}" exec "${process.execPath}" "${FAKE}" "$@"\n`,
    { mode: 0o755 },
  );
  const runtimeRoot = path.join(root, 'runtime');
  const engine = createPhoneEngine({
    binaryPath: binaryPath ?? wrapper,
    runtimeRoot,
    modulePath: '/opt/baresip/modules',
    localAddress: '192.0.2.10',
    audio: { driver: 'alsa', device: 'default' },
  });
  t.after(async () => {
    await engine.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { engine, root, logPath, runtimeRoot };
}

function readLog(logPath) {
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean) : [];
}

// ----- Framing -----

test('netstring: codifica em bytes e decodifica mensagens quebradas em pedaços', () => {
  const decoder = new NetstringDecoder();
  const wire = Buffer.concat([encodeNetstring('{"a":"ção"}'), encodeNetstring('{"b":1}')]);
  const messages = [];
  for (const byte of wire) messages.push(...decoder.push(Buffer.from([byte])));
  assert.deepEqual(messages, ['{"a":"ção"}', '{"b":1}']);
});

test('netstring: rejeita cabeçalho inválido e terminador errado', () => {
  assert.throws(() => new NetstringDecoder().push(Buffer.from('abc:xyz,')), /cabeçalho inválido/);
  assert.throws(() => new NetstringDecoder().push(Buffer.from('2:abX')), /terminador inválido/);
});

// ----- Validação e configuração -----

test('contas: aceitam UDP, TCP e TLS e rejeitam WebSocket', () => {
  for (const transport of ['udp', 'tcp', 'tls']) {
    assert.equal(validateAccountDraft({ ...ACCOUNT, transport }).transport, transport);
  }
  for (const transport of ['ws', 'wss', 'WSS', 'webrtc']) {
    assert.throws(() => validateAccountDraft({ ...ACCOUNT, transport }), (err) => err.code === 'INVALID_INPUT');
  }
});

test('contas: rejeitam campos que poderiam injetar parâmetros na string do Baresip', () => {
  assert.throws(() => validateAccountDraft({ ...ACCOUNT, password: 'a;auth_user=x' }), PhoneError);
  assert.throws(() => validateAccountDraft({ ...ACCOUNT, password: 'com espaco' }), PhoneError);
  assert.throws(() => validateAccountDraft({ ...ACCOUNT, username: '1001>x' }), PhoneError);
  assert.throws(() => validateAccountDraft({ ...ACCOUNT, domain: 'pbx.example.test;transport=ws' }), PhoneError);
  assert.throws(() => validateAccountDraft({ ...ACCOUNT, outboundProxy: 'proxy:99999' }), PhoneError);
  assert.throws(() => validateAccountDraft({ ...ACCOUNT, port: 70000 }), PhoneError);
});

test('string da conta: parâmetros de URI dentro de <> e auth_pass depois do >', () => {
  const account = validateAccountDraft({ ...ACCOUNT, outboundProxy: 'sbc.example.test:5061' });
  const text = buildAccountString(account, { regint: 300, password: PASSWORD });
  assert.equal(
    text,
    `"Recepção" <sip:1001@pbx.example.test:5061;transport=tls;regint=300;auth_user=1001;outbound="sip:sbc.example.test:5061">;auth_pass=${PASSWORD}`,
  );
});

test('destinos: aceitam número e sip: convencional, rejeitam WSS e espaços', () => {
  assert.equal(validateDestination('1002'), '1002');
  assert.equal(validateDestination('sip:bob@example.test;transport=tcp'), 'sip:bob@example.test;transport=tcp');
  for (const bad of ['wss://example.test/ws', 'sips:bob@example.test', 'sip:bob@example.test;transport=ws', '1002 2000', '1002\nhangup', 'sip:a@b;x=1']) {
    assert.throws(() => validateDestination(bad), (err) => err.code === 'INVALID_INPUT', bad);
  }
});

test('configuração: controle só em loopback, sem WebSocket, sem 0.0.0.0 e sem senha', () => {
  const text = renderBaresipConfig({
    ctrlPort: 40123,
    modulePath: '/opt/baresip/modules',
    localAddress: '192.0.2.10',
    rtpPorts: '10000-10100',
    audio: { driver: 'alsa', device: 'default' },
    caFile: '/etc/ssl/certs/ca-certificates.crt',
  });
  assert.match(text, /^ctrl_tcp_listen 127\.0\.0\.1:40123$/m);
  assert.match(text, /^sip_transports udp,tcp,tls$/m);
  assert.match(text, /^sip_verify_server yes$/m);
  assert.match(text, /^module menu\.so$/m, 'menu fornece os comandos UA usados pelo canal de controle');
  assert.doesNotMatch(text, /ws|wss/i);
  assert.doesNotMatch(text, /0\.0\.0\.0/);
  assert.doesNotMatch(text, new RegExp(PASSWORD));
  assert.throws(() => renderBaresipConfig({ ctrlPort: 40123, modulePath: '/m', localAddress: '0.0.0.0', rtpPorts: '1-2', audio: { driver: 'alsa', device: 'default' } }));
  assert.throws(() => renderBaresipConfig({ ctrlPort: 80, modulePath: '/m', localAddress: '192.0.2.10', rtpPorts: '1-2', audio: { driver: 'alsa', device: 'default' } }));
  // Quebra de linha em qualquer campo livre não pode criar diretiva nova no arquivo.
  assert.throws(() => renderBaresipConfig({ ctrlPort: 40123, modulePath: '/m', localAddress: '192.0.2.10', rtpPorts: '1-2', audio: { driver: 'alsa', device: 'default\nmodule evil.so' } }));
  assert.throws(() => renderBaresipConfig({ ctrlPort: 40123, modulePath: '/m\nmodule x', localAddress: '192.0.2.10', rtpPorts: '1-2', audio: { driver: 'alsa', device: 'default' } }));
});

// ----- Processo e fluxo com motor simulado -----

test('binário ausente: start falha com código claro e o estado de conta mostra a limitação', async (t) => {
  const { engine } = await withFakeEngine(t, { binaryPath: '/nonexistent/baresip-nao-instalado' });
  engine.addAccount('acc-1', ACCOUNT);
  await assert.rejects(engine.start(), (err) => err.code === 'BINARY_NOT_FOUND');
  const [account] = engine.snapshot().accounts;
  assert.equal(account.state, 'offline');
  assert.match(account.detail, /não encontrado/);
  await assert.rejects(engine.register('acc-1'), (err) => err.code === 'ENGINE_NOT_RUNNING');
});

test('fluxo completo: registro, chamada, controles e encerramento limpo sem vazar a senha', async (t) => {
  const { engine, logPath, runtimeRoot } = await withFakeEngine(t);
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  assert.equal(engine.snapshot().selectedAccountId, id);

  await engine.register(id);
  await waitFor(engine, (s) => s.accounts[0].state === 'registered');

  await engine.dial('1002');
  const active = await waitFor(engine, (s) => s.call?.state === 'active');
  const callId = active.call.id;
  assert.equal(active.call.direction, 'outgoing');
  assert.equal(active.call.remoteUri, '1002');
  assert.ok(active.call.startedAt);

  await engine.setMuted(callId, true);
  assert.equal(engine.snapshot().call.muted, true);

  await engine.setHeld(callId, true);
  assert.equal(engine.snapshot().call.state, 'held');
  await engine.setHeld(callId, false);
  assert.equal(engine.snapshot().call.state, 'active');

  await engine.sendDtmf(callId, '1#');
  await engine.transfer(callId, 'sip:6000@pbx.example.test');
  await engine.hangup(callId);
  await waitFor(engine, (s) => s.call === null);

  const snapshotText = JSON.stringify(engine.snapshot());
  assert.doesNotMatch(snapshotText, new RegExp(PASSWORD));

  const commands = readLog(logPath);
  assert.ok(commands.some((line) => line.startsWith('uanew ') && line.includes(`;auth_pass=${PASSWORD}`)), 'senha deve chegar ao motor pelo uanew');
  assert.ok(commands.indexOf('callfind c1') < commands.indexOf('mute true'), 'mute precisa selecionar a chamada antes');
  assert.ok(commands.includes('sndcode 1#'));
  assert.ok(commands.includes('transfer sip:6000@pbx.example.test'));

  await engine.stop();
  assert.equal(engine.snapshot().accounts[0].state, 'offline');
  assert.deepEqual(fs.existsSync(runtimeRoot) ? fs.readdirSync(runtimeRoot) : [], [], 'diretório de execução removido');
});

test('chamada encerrada libera o snapshot: call volta a null e nova chamada é aceita', async (t) => {
  const { engine, logPath } = await withFakeEngine(t);
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  await engine.register(id);
  await waitFor(engine, (s) => s.accounts[0].state === 'registered');

  await engine.dial('1002');
  const first = await waitFor(engine, (s) => s.call?.state === 'active');
  await engine.hangup(first.call.id);
  const cleared = await waitFor(engine, (s) => s.call === null);
  assert.equal(cleared.call, null);

  // O listener continua assinado: a nova chamada chega pelo mesmo caminho de snapshot.
  await engine.dial('1003');
  const second = await waitFor(engine, (s) => s.call?.state === 'active');
  assert.notEqual(second.call.id, first.call.id);
  assert.equal(second.call.remoteUri, '1003');
  assert.equal(readLog(logPath).filter((line) => line.startsWith('dial ')).length, 2);
});

test('registro recusado por autenticação mapeia para authentication-failed', async (t) => {
  const { engine } = await withFakeEngine(t, { mode: 'auth-fail' });
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  await engine.register(id);
  const snapshot = await waitFor(engine, (s) => s.accounts[0].state === 'authentication-failed');
  assert.match(snapshot.accounts[0].detail, /401/);
});

test('chamada recebida: atender por id e recusar com 603', async (t) => {
  const { engine, logPath } = await withFakeEngine(t, { mode: 'incoming' });
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  await engine.register(id);
  const ringing = await waitFor(engine, (s) => s.call?.direction === 'incoming');
  assert.equal(ringing.call.state, 'ringing');
  assert.equal(ringing.call.remoteUri, 'sip:paciente@example.test');

  await engine.answer(ringing.call.id);
  await waitFor(engine, (s) => s.call?.state === 'active');
  await engine.hangup(ringing.call.id);
  await waitFor(engine, (s) => s.call === null);

  assert.ok(readLog(logPath).includes('accept in1'));
  assert.ok(readLog(logPath).includes('hangup in1'));
});

test('recusa de chamada envia scode=603 ao motor', async (t) => {
  const { engine, logPath } = await withFakeEngine(t, { mode: 'incoming' });
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  await engine.register(id);
  const ringing = await waitFor(engine, (s) => s.call?.direction === 'incoming');
  await engine.reject(ringing.call.id);
  assert.ok(readLog(logPath).includes('hangup in1 scode=603'));
});

function nextNotice(engine, code, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`aviso ${code} não recebido`));
    }, timeoutMs);
    const unsubscribe = engine.onNotice((notice) => {
      if (notice.code !== code) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(notice);
    });
  });
}

test('segunda chamada entrante com outra viva: recusada com 486, avisada e nunca exibida como chamada', async (t) => {
  const { engine, logPath } = await withFakeEngine(t, { mode: 'second-incoming' });
  const notice = nextNotice(engine, 'CALL_REJECTED_BUSY');
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  await engine.register(id);
  const ringing = await waitFor(engine, (s) => s.call?.direction === 'incoming');
  const seen = await notice;
  assert.equal(seen.callId, 'in2');
  assert.equal(seen.activeCallId, 'in1');
  assert.equal(seen.remoteUri, 'sip:outro@example.test');
  await until(() => readLog(logPath).includes('hangup in2 scode=486'));
  // A primeira chamada segue como foco; a segunda não entrou no mapa de chamadas.
  assert.equal(ringing.call.id, 'in1');
  assert.equal(engine.snapshot().call.id, 'in1');
  assert.equal(engine.calls.has('in2'), false);
  // O CALL_CLOSED da chamada recusada não altera a chamada em andamento.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(engine.snapshot().call.id, 'in1');
  assert.equal(engine.snapshot().call.state, 'ringing');
});

test('conta com chamada ativa não pode ser removida e a remoção só ocorre depois do fim da chamada', async (t) => {
  const { engine, logPath } = await withFakeEngine(t, { mode: 'incoming' });
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  await engine.register(id);
  const ringing = await waitFor(engine, (s) => s.call?.direction === 'incoming');

  await assert.rejects(engine.removeAccount(id), (err) => err.code === 'ACCOUNT_IN_CALL');
  assert.equal(engine.snapshot().accounts.length, 1, 'conta continua cadastrada');
  assert.equal(engine.snapshot().call.id, ringing.call.id, 'chamada continua viva');
  const before = readLog(logPath);
  assert.ok(!before.some((line) => line.startsWith('uareg 0') || line.startsWith('uadel')), 'nada foi desregistrado nem removido do motor');

  await engine.reject(ringing.call.id);
  await waitFor(engine, (s) => s.call === null);
  await engine.removeAccount(id);
  assert.equal(engine.snapshot().accounts.length, 0);
  const after = readLog(logPath);
  assert.ok(after.some((line) => line.startsWith('uareg 0')), 'desregistra depois do fim da chamada');
});

test('dial pendente (comando enviado, CALL_OUTGOING ainda não chegou) também bloqueia a remoção', async (t) => {
  const { engine } = await withFakeEngine(t);
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  await engine.register(id);
  await waitFor(engine, (s) => s.accounts[0].state === 'registered');
  // Estado que o dial deixa entre o envio e o evento: simulado diretamente, o fake não tem janela para isso.
  engine.dialingAccountId = id;
  await assert.rejects(engine.removeAccount(id), (err) => err.code === 'ACCOUNT_IN_CALL');
  engine.dialingAccountId = null;
  await engine.removeAccount(id);
  assert.equal(engine.snapshot().accounts.length, 0);
});

test('segredo que aparece na saída do motor é redigido antes de guardar', async (t) => {
  const { engine } = await withFakeEngine(t, { mode: 'stderr-secret', stderrSecret: PASSWORD });
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  await engine.register(id);
  await waitFor(engine, (s) => s.accounts[0].state === 'registered');
  // O stderr chega por outro pipe: espera a linha aparecer antes de checar a redação.
  await until(() => engine.supervisor.recentOutput().some((line) => line.includes('[redigido]')));
  const output = engine.supervisor.recentOutput().join('\n');
  assert.doesNotMatch(output, new RegExp(PASSWORD));
});

test('encerramento inesperado: chamadas falham, conta fica offline com motivo e diretório é limpo', async (t) => {
  const { engine, runtimeRoot } = await withFakeEngine(t, { mode: 'crash' });
  await engine.start();
  const { id } = engine.addAccount('acc-1', ACCOUNT);
  const snapshot = await waitFor(engine, (s) => s.accounts[0].detail !== undefined);
  assert.match(snapshot.accounts[0].detail, /encerrou inesperadamente/);
  assert.equal(snapshot.accounts[0].state, 'offline');
  await assert.rejects(engine.register(id), (err) => err.code === 'ENGINE_NOT_RUNNING');
  await until(() => fs.readdirSync(runtimeRoot).length === 0);
});

test('validação de chamada: destino inválido, sem conta selecionada e dispositivo desconhecido', async (t) => {
  const { engine } = await withFakeEngine(t);
  await engine.start();
  await assert.rejects(engine.dial('wss://example.test'), (err) => err.code === 'INVALID_INPUT');
  await assert.rejects(engine.dial('1002'), (err) => err.code === 'INVALID_INPUT');
  await assert.rejects(engine.setAudioDevice('input', 'alsa,inexistente'), (err) => err.code === 'AUDIO_DEVICE_UNAVAILABLE');
  await assert.rejects(engine.sendDtmf('c1', 'X'), (err) => err.code === 'INVALID_INPUT');
});

test('contas: duplicadas por usuário e domínio são recusadas', (t) => {
  const engine = createPhoneEngine({ binaryPath: '/nonexistent', runtimeRoot: os.tmpdir(), modulePath: '/m', localAddress: '192.0.2.10' });
  t.after(() => engine.stop());
  engine.addAccount('a', ACCOUNT);
  assert.throws(() => engine.addAccount('b', { ...ACCOUNT, transport: 'udp' }), (err) => err.code === 'INVALID_INPUT');
});
