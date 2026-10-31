'use strict';

const net = require('node:net');
const { EventEmitter } = require('node:events');
const { encodeNetstring, NetstringDecoder } = require('./netstring.cjs');
const { PhoneError } = require('./errors.cjs');

const HOST = '127.0.0.1';
const REQUEST_TIMEOUT_MS = 10_000;

// Cliente do ctrl_tcp. Só conecta em loopback; o Baresip aceita uma conexão por vez e não tem autenticação,
// por isso a porta é escolhida na hora e nunca sai da máquina.
class ControlClient extends EventEmitter {
  constructor({ port }) {
    super();
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Porta de controle inválida.');
    this.port = port;
    this.socket = null;
    this.decoder = new NetstringDecoder();
    this.pending = new Map();
    this.sequence = 0;
  }

  connect(timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const attempt = () => {
        const socket = net.createConnection({ host: HOST, port: this.port });
        const onError = () => {
          socket.destroy();
          if (Date.now() >= deadline) {
            reject(new PhoneError('CONTROL_TIMEOUT', 'O motor não abriu o canal de controle a tempo.'));
          } else {
            setTimeout(attempt, 100);
          }
        };
        socket.once('error', onError);
        socket.once('connect', () => {
          socket.removeListener('error', onError);
          this.attach(socket);
          resolve();
        });
      };
      attempt();
    });
  }

  attach(socket) {
    this.socket = socket;
    socket.on('data', (chunk) => {
      try {
        for (const text of this.decoder.push(chunk)) this.dispatch(text);
      } catch {
        // Protocolo fora do esperado: encerra o canal sem repetir o conteúdo recebido.
        socket.destroy();
      }
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      this.rejectAll(new PhoneError('CONTROL_CLOSED', 'O canal de controle do motor foi encerrado.'));
      this.emit('close');
    });
  }

  dispatch(text) {
    const message = JSON.parse(text);
    if (message.response === true) {
      const entry = this.takePending(message.token);
      if (entry) entry.resolve({ ok: message.ok === true, data: typeof message.data === 'string' ? message.data : '' });
      return;
    }
    if (message.event === true) this.emit('event', message);
  }

  takePending(token) {
    if (token === undefined) {
      const first = this.pending.keys().next();
      if (first.done) return undefined;
      token = first.value;
    }
    const entry = this.pending.get(token);
    this.pending.delete(token);
    return entry;
  }

  // Comandos são enviados um por vez pelo chamador (ver PhoneEngine); cada um tem token próprio para casar a resposta.
  request(command, params, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (!this.socket) return Promise.reject(new PhoneError('ENGINE_NOT_RUNNING', 'O motor de telefonia não está conectado.'));
    const token = `r${++this.sequence}`;
    const body = { command, token };
    if (params !== undefined) body.params = params;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(token);
        reject(new PhoneError('CONTROL_TIMEOUT', `O motor não respondeu ao comando ${command}.`));
      }, timeoutMs);
      this.pending.set(token, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      this.socket.write(encodeNetstring(JSON.stringify(body)));
    });
  }

  rejectAll(err) {
    for (const entry of this.pending.values()) entry.reject(err);
    this.pending.clear();
  }

  close() {
    this.socket?.destroy();
  }
}

module.exports = { ControlClient };
