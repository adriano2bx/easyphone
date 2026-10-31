'use strict';

const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PhoneError } = require('./errors.cjs');
const { ProcessSupervisor } = require('./process-supervisor.cjs');
const { renderBaresipConfig, pickLocalAddress } = require('./baresip-config.cjs');
const {
  validateAccountDraft,
  accountKey,
  keyFromAor,
  accountAor,
  buildAccountString,
  validateDestination,
  validateCallId,
  validateDigits,
  validateDeviceId,
  validateDriver,
} = require('./validation.cjs');

const REGISTER_INTERVAL_S = 300;
const FINAL_CALL_STATES = new Set(['ended', 'failed']);
const AUTH_FAILURE_RE = /401|403|407|unauthori[sz]ed|forbidden|auth/i;
const COMMAND_FAILURE_DETAIL_MAX = 160;
const SHUTDOWN_BUDGET_MS = 4000;
const execFileAsync = promisify(execFile);

// Linux desktop in this product targets PulseAudio-compatible servers (PipeWire/PulseAudio).
const AUDIO_DRIVER_BY_PLATFORM = { linux: 'pulse', win32: 'winwave', darwin: 'coreaudio' };

function defaultAudio() {
  return { driver: AUDIO_DRIVER_BY_PLATFORM[process.platform] || 'alsa', device: 'default' };
}

function shortText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Motor de telefonia atrás da API do contrato PhoneBridge. Não recebe nem devolve credenciais no snapshot.
class PhoneEngine {
  constructor({ binaryPath, runtimeRoot, modulePath, localAddress, caFile, caPath, ringFile, rtpPorts = '10000-10100', audio = defaultAudio(), audioSelections = {} }) {
    this.audio = { driver: validateDriver(audio.driver), device: audio.device };
    this.config = { modulePath, localAddress: localAddress || pickLocalAddress(), caFile, caPath, ringFile, rtpPorts, audio: this.audio };
    this.supervisor = new ProcessSupervisor({
      binaryPath,
      runtimeRoot,
      renderConfig: (ctrlPort) => renderBaresipConfig({ ...this.config, ctrlPort }),
    });
    this.supervisor.on('exit', (info) => this.handleExit(info));
    this.listeners = new Set();
    this.noticeListeners = new Set();
    this.accounts = new Map();
    this.uaOrder = [];
    this.calls = new Map();
    this.primaryCallId = null;
    // Conta que tem um dial enviado ao motor cujo CALL_OUTGOING ainda não chegou (chamada "pendente").
    this.dialingAccountId = null;
    this.selectedAccountId = null;
    this.inputDeviceId = typeof audioSelections.inputDeviceId === 'string' ? audioSelections.inputDeviceId : null;
    this.outputDeviceId = typeof audioSelections.outputDeviceId === 'string' ? audioSelections.outputDeviceId : null;
    this.availableAudioDevices = [
      { id: `${this.audio.driver},default`, label: 'Padrão do sistema', kind: 'input' },
      { id: `${this.audio.driver},default`, label: 'Padrão do sistema', kind: 'output' },
    ];
    this.control = null;
    this.running = false;
    this.engineError = null;
    this.queue = Promise.resolve();
  }

  // ----- Snapshot e assinaturas -----

  snapshot() {
    return {
      accounts: [...this.accounts.values()].map((record) => this.summary(record)),
      selectedAccountId: this.selectedAccountId,
      call: this.primaryCall(),
      audioDevices: this.audioDevices(),
      inputDeviceId: this.inputDeviceId,
      outputDeviceId: this.outputDeviceId,
    };
  }

  onSnapshot(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitSnapshot() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Um listener com falha não derruba o motor nem os demais.
      }
    }
  }

  // Avisos explícitos do motor (ex.: chamada recusada por ocupado). Não fazem parte do snapshot do contrato:
  // a UI só os recebe se a integração for combinada.
  onNotice(listener) {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  emitNotice(notice) {
    for (const listener of this.noticeListeners) {
      try {
        listener(notice);
      } catch {
        // Mesmo critério de emitSnapshot: um listener com falha não derruba o motor.
      }
    }
  }

  summary(record) {
    const { account } = record;
    const detail = record.detail ?? (this.running ? undefined : this.engineError?.message);
    return {
      id: record.id,
      label: account.label,
      username: account.username,
      domain: account.domain,
      transport: account.transport,
      state: record.state,
      detail,
    };
  }

  primaryCall() {
    const call = this.calls.get(this.primaryCallId);
    if (!call) return null;
    return {
      id: call.id,
      direction: call.direction,
      remoteUri: call.remoteUri,
      state: call.state,
      startedAt: call.startedAt,
      muted: call.muted,
      held: call.held,
    };
  }

  audioDevices() {
    return this.availableAudioDevices.map((device) => ({ ...device }));
  }

  async refreshAudioDevices() {
    if (process.platform !== 'linux' || this.audio.driver !== 'pulse') return this.audioDevices();
    try {
      const [sourceResult, sinkResult, defaultSourceResult, defaultSinkResult] = await Promise.all([
        execFileAsync('pactl', ['--format=json', 'list', 'sources'], { timeout: 2500, maxBuffer: 1024 * 1024 }),
        execFileAsync('pactl', ['--format=json', 'list', 'sinks'], { timeout: 2500, maxBuffer: 1024 * 1024 }),
        execFileAsync('pactl', ['get-default-source'], { timeout: 2500 }),
        execFileAsync('pactl', ['get-default-sink'], { timeout: 2500 }),
      ]);
      const defaultSource = shortText(defaultSourceResult.stdout, 128);
      const defaultSink = shortText(defaultSinkResult.stdout, 128);
      const devices = [
        { id: 'pulse,default', label: 'Padrão do sistema', kind: 'input' },
        { id: 'pulse,default', label: 'Padrão do sistema', kind: 'output' },
      ];
      const append = (raw, kind, defaultName) => {
        for (const device of JSON.parse(raw)) {
          if (kind === 'input' && (device.monitor_of_sink != null || String(device.name).endsWith('.monitor'))) continue;
          const name = String(device.name || '');
          if (!name || name === 'default') continue;
          const id = `pulse,${name}`;
          try { validateDeviceId(id); } catch { continue; }
          const label = shortText(device.description || name, 100);
          devices.push({ id, label: name === defaultName ? `${label} · padrão` : label, kind });
        }
      };
      append(sourceResult.stdout, 'input', defaultSource);
      append(sinkResult.stdout, 'output', defaultSink);
      this.availableAudioDevices = devices;
      this.emitSnapshot();
    } catch {
      // Sem servidor PulseAudio/PipeWire acessível, o dispositivo padrão continua disponível.
    }
    return this.audioDevices();
  }

  // ----- Ciclo de vida do motor -----

  async start() {
    if (this.running) return;
    try {
      await this.supervisor.start();
    } catch (err) {
      this.engineError = { code: err.code || 'ENGINE_START_FAILED', message: err.message };
      this.emitSnapshot();
      throw err;
    }
    this.control = this.supervisor.control;
    this.control.on('event', (event) => this.handleEvent(event));
    this.control.on('close', () => {
      // Canal caiu com o processo vivo: encerra o processo sem marcar parada intencional, para o evento sair como inesperado.
      if (this.running) this.supervisor.child?.kill('SIGTERM');
    });
    this.running = true;
    this.engineError = null;
    await this.refreshAudioDevices();
    for (const [kind, id] of [['input', this.inputDeviceId], ['output', this.outputDeviceId]]) {
      if (!id) continue;
      if (!this.availableAudioDevices.some((device) => device.kind === kind && device.id === id)) {
        if (kind === 'input') this.inputDeviceId = null;
        else this.outputDeviceId = null;
        continue;
      }
      try { await this.setAudioDevice(kind, id); }
      catch {
        if (kind === 'input') this.inputDeviceId = null;
        else this.outputDeviceId = null;
      }
    }
    this.emitSnapshot();
  }

  async stop() {
    if (!this.supervisor.child) return;
    const shutdown = this.running ? this.unregisterAll() : Promise.resolve();
    await Promise.race([shutdown.catch(() => {}), new Promise((resolve) => setTimeout(resolve, SHUTDOWN_BUDGET_MS))]);
    await this.supervisor.stop();
  }

  unregisterAll() {
    return this.withCommands(async (send) => {
      for (const [index, id] of this.uaOrder.entries()) {
        const record = this.accounts.get(id);
        if (record?.state === 'registered' || record?.state === 'registering') {
          await send(`uareg 0 ${index}`);
        }
      }
    });
  }

  handleExit({ unexpected }) {
    this.running = false;
    this.control = null;
    this.uaOrder = [];
    this.dialingAccountId = null;
    for (const record of this.accounts.values()) {
      record.state = 'offline';
      record.uaActive = false;
      record.detail = undefined;
    }
    for (const call of this.calls.values()) {
      if (!FINAL_CALL_STATES.has(call.state)) call.state = unexpected ? 'failed' : 'ended';
    }
    this.refreshPrimary();
    this.engineError = unexpected ? { code: 'ENGINE_EXITED', message: 'O motor de telefonia encerrou inesperadamente.' } : null;
    this.emitSnapshot();
  }

  // ----- Comandos serializados -----

  // Uma tarefa por vez: comandos que dependem da chamada "corrente" do Baresip (callfind + mute/sndcode/transfer)
  // não podem intercalar com outro comando.
  withCommands(task) {
    const run = this.queue.then(() => task((command) => this.send(command)));
    this.queue = run.catch(() => {});
    return run;
  }

  async send(line) {
    if (!this.control) throw new PhoneError('ENGINE_NOT_RUNNING', 'O motor de telefonia não está em execução.');
    // ctrl_tcp recebe "command" e "params" em campos separados.
    const space = line.indexOf(' ');
    const name = space === -1 ? line : line.slice(0, space);
    const params = space === -1 ? undefined : line.slice(space + 1);
    const { ok, data } = await this.control.request(name, params);
    if (ok) return data;
    // Respostas de uanew ecoam a string da conta, que contém a senha: nunca repassar essa saída.
    if (name === 'uanew') throw new PhoneError('COMMAND_FAILED', 'O motor não conseguiu criar a conta.');
    const detail = shortText(this.supervisor.redact(data), COMMAND_FAILURE_DETAIL_MAX);
    throw new PhoneError('COMMAND_FAILED', detail ? `O motor recusou ${name}: ${detail}` : `O motor recusou ${name}.`);
  }

  requireRunning() {
    if (!this.running) throw new PhoneError('ENGINE_NOT_RUNNING', this.engineError?.message || 'O motor de telefonia não está em execução.');
  }

  requireAccount(id) {
    const record = this.accounts.get(id);
    if (!record) throw new PhoneError('ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
    return record;
  }

  requireCall(id) {
    const call = this.calls.get(validateCallId(id));
    if (!call) throw new PhoneError('CALL_NOT_FOUND', 'Chamada não encontrada.');
    return call;
  }

  uaIndex(id) {
    const index = this.uaOrder.indexOf(id);
    if (index === -1) throw new PhoneError('ACCOUNT_NOT_REGISTERED_IN_ENGINE', 'A conta ainda não foi carregada no motor.');
    return index;
  }

  // ----- Contas -----

  loadAccounts(entries) {
    for (const { id, ...draft } of entries) this.addAccount(id, draft, { silent: true });
    this.emitSnapshot();
  }

  addAccount(id, draft, { silent = false } = {}) {
    if (typeof id !== 'string' || !id) throw new PhoneError('INVALID_INPUT', 'Identificador de conta inválido.');
    const account = validateAccountDraft(draft);
    if (this.accounts.has(id)) throw new PhoneError('INVALID_INPUT', 'Conta já cadastrada.');
    const key = accountKey(account);
    for (const existing of this.accounts.values()) {
      if (accountKey(existing.account) === key) throw new PhoneError('INVALID_INPUT', 'Já existe uma conta para este usuário e domínio.');
    }
    this.accounts.set(id, { id, account, state: 'offline', detail: undefined, uaActive: false });
    this.supervisor.addSecret(account.password);
    if (!this.selectedAccountId) this.selectedAccountId = id;
    if (!silent) this.emitSnapshot();
    return { id };
  }

  // Conta com chamada viva ou dial pendente não pode sair: remover derrubaria a chamada sem aviso.
  // Quem remove precisa esperar a chamada terminar (ou encerrá-la) antes.
  assertAccountIdle(record) {
    if (this.accountBusy(record)) {
      throw new PhoneError('ACCOUNT_IN_CALL', 'A conta tem chamada ativa ou pendente. Encerre a chamada antes de remover a conta.');
    }
  }

  accountBusy(record) {
    if (this.dialingAccountId === record.id) return true;
    // accountId null = o motor não disse de qual conta é a chamada; tratar como ocupada é o lado seguro.
    return [...this.calls.values()].some((call) => !FINAL_CALL_STATES.has(call.state) && (call.accountId === record.id || call.accountId === null));
  }

  async removeAccount(id) {
    const record = this.requireAccount(id);
    this.assertAccountIdle(record);
    if (record.uaActive && this.running) {
      await this.withCommands(async (send) => {
        // Reavaliado dentro da fila: uma chamada pode ter começado enquanto o comando esperava.
        this.assertAccountIdle(record);
        await send(`uareg 0 ${this.uaIndex(id)}`);
        await send(`uadel ${accountAor(record.account)}`);
      });
      this.uaOrder.splice(this.uaOrder.indexOf(id), 1);
    }
    this.accounts.delete(id);
    this.supervisor.removeSecret(record.account.password);
    if (this.selectedAccountId === id) this.selectedAccountId = this.accounts.keys().next().value ?? null;
    this.emitSnapshot();
  }

  selectAccount(id) {
    this.requireAccount(id);
    this.selectedAccountId = id;
    this.emitSnapshot();
  }

  async register(id) {
    const record = this.requireAccount(id);
    this.requireRunning();
    // Otimista: eventos do motor podem chegar antes da resposta do comando e prevalecem sobre este estado.
    const previous = record.state;
    record.state = 'registering';
    record.detail = undefined;
    this.emitSnapshot();
    try {
      await this.withCommands(async (send) => {
        if (record.uaActive) {
          await send(`uareg ${REGISTER_INTERVAL_S} ${this.uaIndex(id)}`);
        } else {
          await send(`uanew ${buildAccountString(record.account, { regint: REGISTER_INTERVAL_S, password: record.account.password })}`);
          this.uaOrder.push(id);
          record.uaActive = true;
        }
      });
    } catch (err) {
      if (record.state === 'registering') record.state = previous;
      this.emitSnapshot();
      throw err;
    }
  }

  async unregister(id) {
    const record = this.requireAccount(id);
    this.requireRunning();
    if (!record.uaActive) return;
    await this.withCommands(async (send) => send(`uareg 0 ${this.uaIndex(id)}`));
    record.state = 'offline';
    record.detail = undefined;
    this.emitSnapshot();
  }

  // ----- Chamadas -----

  async dial(destination) {
    const target = validateDestination(destination);
    this.requireRunning();
    if (!this.selectedAccountId) throw new PhoneError('INVALID_INPUT', 'Selecione uma conta antes de discar.');
    const record = this.requireAccount(this.selectedAccountId);
    if (this.hasLiveCall()) throw new PhoneError('CALL_BUSY', 'Já existe uma chamada em andamento.');
    await this.withCommands(async (send) => {
      // Reavaliado na fila: uma chamada entrante pode ter chegado enquanto o dial esperava.
      if (this.hasLiveCall()) throw new PhoneError('CALL_BUSY', 'Já existe uma chamada em andamento.');
      if (!record.uaActive) {
        // Conta usada só para discar: cria o User-Agent sem registrar.
        await send(`uanew ${buildAccountString(record.account, { regint: 0, password: record.account.password })}`);
        this.uaOrder.push(record.id);
        record.uaActive = true;
      }
      this.dialingAccountId = record.id;
      try {
        await send(`dial ${target} ${this.uaIndex(record.id)}`);
      } catch (err) {
        if (this.dialingAccountId === record.id) this.dialingAccountId = null;
        throw err;
      }
    });
  }

  hasLiveCall() {
    return [...this.calls.values()].some((call) => !FINAL_CALL_STATES.has(call.state));
  }

  async answer(callId) {
    const call = this.requireCall(callId);
    this.requireRunning();
    await this.withCommands((send) => send(`accept ${call.id}`));
  }

  async reject(callId) {
    const call = this.requireCall(callId);
    this.requireRunning();
    // 603 Decline: recusa explícita, diferente de encerrar uma chamada já atendida.
    await this.withCommands((send) => send(`hangup ${call.id} scode=603`));
  }

  async hangup(callId) {
    const call = this.requireCall(callId);
    this.requireRunning();
    await this.withCommands((send) => send(`hangup ${call.id}`));
  }

  async setMuted(callId, muted) {
    const call = this.requireCall(callId);
    this.requireRunning();
    await this.withCommands(async (send) => {
      await send(`callfind ${call.id}`);
      await send(`mute ${muted ? 'true' : 'false'}`);
    });
    call.muted = Boolean(muted);
    this.emitSnapshot();
  }

  async setHeld(callId, held) {
    const call = this.requireCall(callId);
    this.requireRunning();
    await this.withCommands((send) => send(`${held ? 'hold' : 'resume'} ${call.id}`));
    call.held = Boolean(held);
    call.state = held ? 'held' : 'active';
    this.emitSnapshot();
  }

  async sendDtmf(callId, digits) {
    const sequence = validateDigits(digits);
    const call = this.requireCall(callId);
    this.requireRunning();
    await this.withCommands(async (send) => {
      await send(`callfind ${call.id}`);
      await send(`sndcode ${sequence}`);
    });
  }

  async transfer(callId, destination) {
    const call = this.requireCall(callId);
    const target = validateDestination(destination);
    this.requireRunning();
    await this.withCommands(async (send) => {
      await send(`callfind ${call.id}`);
      await send(`transfer ${target}`);
    });
  }

  async setAudioDevice(kind, deviceId) {
    if (kind !== 'input' && kind !== 'output') throw new PhoneError('INVALID_INPUT', 'Tipo de dispositivo inválido.');
    const id = validateDeviceId(deviceId);
    const known = this.audioDevices().some((device) => device.kind === kind && device.id === id);
    if (!known) throw new PhoneError('AUDIO_DEVICE_UNAVAILABLE', 'Dispositivo de áudio indisponível.');
    this.requireRunning();
    await this.withCommands((send) => send(`${kind === 'input' ? 'ausrc' : 'auplay'} ${id}`));
    if (kind === 'input') this.inputDeviceId = id;
    else this.outputDeviceId = id;
    this.emitSnapshot();
  }

  // ----- Eventos do Baresip -----

  handleEvent(event) {
    const type = event.type;
    if (typeof type !== 'string') return;
    if (type.startsWith('REGISTER') || type === 'REGISTERING' || type === 'UNREGISTERING') {
      this.handleRegistration(event);
    } else if (type.startsWith('CALL_') || type === 'TRANSFER' || type === 'TRANSFER_FAILED') {
      this.handleCall(event);
    }
  }

  accountFromEvent(event) {
    const key = keyFromAor(event.accountaor);
    if (!key) return undefined;
    for (const record of this.accounts.values()) {
      if (accountKey(record.account) === key) return record;
    }
    return undefined;
  }

  handleRegistration(event) {
    const record = this.accountFromEvent(event);
    if (!record) return;
    switch (event.type) {
      case 'REGISTERING':
        record.state = 'registering';
        record.detail = undefined;
        break;
      case 'REGISTER_OK':
        record.state = 'registered';
        record.detail = undefined;
        break;
      case 'REGISTER_FAIL': {
        const reason = shortText(this.supervisor.redact(event.param), COMMAND_FAILURE_DETAIL_MAX);
        record.state = AUTH_FAILURE_RE.test(reason) ? 'authentication-failed' : 'error';
        record.detail = reason || 'Falha no registro SIP.';
        break;
      }
      case 'UNREGISTERING':
        record.state = 'offline';
        record.detail = undefined;
        break;
      default:
        return;
    }
    this.emitSnapshot();
  }

  handleCall(event) {
    const id = typeof event.id === 'string' ? event.id : '';
    if (!id) return;
    const existing = this.calls.get(id);
    const now = Date.now();
    // Uma chamada por vez: uma entrante que chega com outra viva é recusada na hora, com aviso explícito.
    // Não entra no mapa; o CALL_CLOSED dela depois é ignorado (id desconhecido).
    if (event.type === 'CALL_INCOMING' && !existing && this.hasLiveCall()) {
      this.rejectBusy(event);
      return;
    }
    switch (event.type) {
      case 'CALL_INCOMING':
      case 'CALL_OUTGOING': {
        const owner = this.accountFromEvent(event);
        let accountId = owner ? owner.id : null;
        if (event.type === 'CALL_OUTGOING') {
          // Com o CALL_OUTGOING a chamada passa a ser registrada; não é mais "pendente".
          if (!accountId && this.dialingAccountId) accountId = this.dialingAccountId;
          this.dialingAccountId = null;
        }
        this.calls.set(id, {
          id,
          accountId,
          direction: event.type === 'CALL_INCOMING' ? 'incoming' : 'outgoing',
          remoteUri: shortText(event.peeruri, 256),
          state: event.type === 'CALL_INCOMING' ? 'ringing' : 'connecting',
          startedAt: undefined,
          muted: false,
          held: false,
        });
        break;
      }
      case 'CALL_RINGING':
        if (existing) existing.state = 'ringing';
        break;
      case 'CALL_PROGRESS':
        if (existing) existing.state = 'early-media';
        break;
      case 'CALL_ANSWERED':
        if (existing) existing.state = 'connecting';
        break;
      case 'CALL_ESTABLISHED':
        if (existing) {
          existing.state = existing.held ? 'held' : 'active';
          existing.startedAt ??= now;
        }
        break;
      case 'CALL_HOLD':
        if (existing) {
          existing.held = true;
          existing.state = 'held';
        }
        break;
      case 'CALL_RESUME':
        if (existing) {
          existing.held = false;
          existing.state = 'active';
        }
        break;
      case 'CALL_CLOSED':
        if (existing) {
          // Chamada que nunca foi atendida por este lado de saída terminou sem conexão; as demais foram encerradas.
          existing.state = existing.startedAt === undefined && existing.direction === 'outgoing' ? 'failed' : 'ended';
        }
        break;
      default:
        return;
    }
    this.refreshPrimary();
    this.emitSnapshot();
  }

  // Recusa a chamada entrante extra com 486 Busy Here e avisa quem assina onNotice. Se o comando falhar, avisa também:
  // o segundo telefone pode continuar tocando, e isso precisa aparecer como falha, não ficar em silêncio.
  rejectBusy(event) {
    let callId;
    try {
      callId = validateCallId(event.id);
    } catch {
      return;
    }
    const remoteUri = shortText(event.peeruri, 256);
    const activeCallId = this.primaryCallId;
    this.emitNotice({
      code: 'CALL_REJECTED_BUSY',
      callId,
      remoteUri,
      activeCallId,
      message: 'Chamada recebida com outra em andamento; recusada com 486 Busy Here.',
    });
    this.withCommands((send) => send(`hangup ${callId} scode=486`)).catch((err) => {
      this.emitNotice({
        code: 'CALL_REJECT_FAILED',
        callId,
        remoteUri,
        activeCallId,
        message: `Não foi possível recusar a chamada extra: ${err.message}`,
      });
    });
  }

  // A chamada viva é o foco do snapshot. Sem chamada viva, o foco vai para null e as chamadas finais são descartadas,
  // para que o snapshot volte a permitir uma nova chamada. Eventos posteriores de um id já descartado são ignorados.
  refreshPrimary() {
    const live = [...this.calls.values()].find((call) => !FINAL_CALL_STATES.has(call.state));
    this.primaryCallId = live ? live.id : null;
    for (const call of [...this.calls.values()]) {
      if (FINAL_CALL_STATES.has(call.state)) this.calls.delete(call.id);
    }
  }
}

module.exports = { PhoneEngine, defaultAudio };
