'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ControlClient } = require('./control-client.cjs');
const { PhoneError } = require('./errors.cjs');

// Só estas variáveis chegam ao Baresip; credenciais e o restante do ambiente ficam de fora.
const ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'XDG_RUNTIME_DIR', 'PULSE_SERVER', 'PIPEWIRE_RUNTIME_DIR'];
const OUTPUT_LINES = 200;
const STOP_GRACE_MS = 5000;

function pickEnv(source) {
  const env = {};
  for (const key of ENV_KEYS) if (source[key] !== undefined) env[key] = source[key];
  return env;
}

async function assertExecutable(binaryPath) {
  try {
    await fs.promises.access(binaryPath, fs.constants.X_OK);
  } catch {
    throw new PhoneError('BINARY_NOT_FOUND', 'Binário do Baresip não encontrado ou sem permissão de execução.');
  }
}

function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// Dono do processo Baresip: sobe com configuração efêmera, mantém o canal de controle e encerra com limpeza.
// Não usa shell, não recebe credenciais e mantém em memória apenas as últimas linhas de saída, já redigidas.
class ProcessSupervisor extends EventEmitter {
  constructor({ binaryPath, runtimeRoot, renderConfig, env = process.env }) {
    super();
    this.binaryPath = binaryPath;
    this.runtimeRoot = runtimeRoot;
    this.renderConfig = renderConfig;
    this.env = env;
    this.secrets = new Set();
    this.output = [];
    this.child = null;
    this.control = null;
    this.runtimeDir = null;
    this.exited = null;
    this.stopping = false;
  }

  addSecret(value) {
    if (value) this.secrets.add(value);
  }

  removeSecret(value) {
    this.secrets.delete(value);
  }

  redact(text) {
    let clean = String(text);
    for (const secret of this.secrets) clean = clean.split(secret).join('[redigido]');
    return clean;
  }

  recentOutput() {
    return [...this.output];
  }

  async start() {
    if (this.child) throw new PhoneError('ENGINE_RUNNING', 'O motor já está em execução.');
    await assertExecutable(this.binaryPath);
    await fs.promises.mkdir(this.runtimeRoot, { recursive: true, mode: 0o700 });
    this.runtimeDir = await fs.promises.mkdtemp(path.join(this.runtimeRoot, 'run-'));
    let port;
    try {
      port = await freeLoopbackPort();
      await fs.promises.writeFile(path.join(this.runtimeDir, 'config'), this.renderConfig(port), { mode: 0o600 });
    } catch (err) {
      await this.removeRuntime();
      throw err;
    }

    const child = spawn(this.binaryPath, ['-f', this.runtimeDir], {
      cwd: this.runtimeDir,
      env: pickEnv(this.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.stopping = false;
    this.exited = new Promise((resolve) => {
      const finish = (code, signal) => {
        if (this.child !== child) return resolve();
        this.handleExit(code, signal);
        resolve();
      };
      child.once('exit', finish);
      child.once('error', () => finish(null, 'spawn-error'));
    });
    child.stdout.on('data', (chunk) => this.collect(chunk));
    child.stderr.on('data', (chunk) => this.collect(chunk));

    const control = new ControlClient({ port });
    try {
      await Promise.race([
        control.connect(),
        this.exited.then(() => {
          throw new PhoneError('ENGINE_EXITED', 'O motor encerrou antes de aceitar o canal de controle.');
        }),
      ]);
    } catch (err) {
      control.close();
      await this.stop();
      throw err;
    }
    this.control = control;
  }

  handleExit(code, signal) {
    const unexpected = !this.stopping;
    this.child = null;
    this.control?.close();
    this.control = null;
    this.emit('exit', { code, signal, unexpected });
    this.removeRuntime().catch(() => {});
  }

  collect(chunk) {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      this.output.push(this.redact(line).slice(0, 300));
    }
    if (this.output.length > OUTPUT_LINES) this.output.splice(0, this.output.length - OUTPUT_LINES);
  }

  // Quem chama depois (stop) espera a mesma remoção que já começou no exit.
  removeRuntime() {
    const dir = this.runtimeDir;
    if (dir) {
      this.runtimeDir = null;
      this.pendingRemoval = fs.promises.rm(dir, { recursive: true, force: true });
    }
    return this.pendingRemoval ?? Promise.resolve();
  }

  async stop({ graceMs = STOP_GRACE_MS } = {}) {
    const child = this.child;
    if (!child) {
      await this.removeRuntime();
      return;
    }
    this.stopping = true;
    // SIGTERM faz o Baresip desregistrar contas e encerrar chamadas; SIGKILL só se ele não sair no prazo.
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), graceMs);
    await this.exited;
    clearTimeout(timer);
    await this.removeRuntime();
  }
}

module.exports = { ProcessSupervisor, pickEnv };
