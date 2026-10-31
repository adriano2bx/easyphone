'use strict';

// Framing do ctrl_tcp do Baresip: cada mensagem é "<tamanho em bytes>:<payload>,".
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const COLON = 0x3a;
const COMMA = 0x2c;

function encodeNetstring(text) {
  const payload = Buffer.from(text, 'utf8');
  return Buffer.concat([Buffer.from(`${payload.length}:`, 'ascii'), payload, Buffer.from(',', 'ascii')]);
}

class NetstringDecoder {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    for (;;) {
      const colon = this.buffer.indexOf(COLON);
      if (colon === -1) {
        if (this.buffer.length > 8) throw new Error('netstring: cabeçalho inválido');
        break;
      }
      const header = this.buffer.subarray(0, colon).toString('ascii');
      if (!/^\d{1,7}$/.test(header)) throw new Error('netstring: cabeçalho inválido');
      const length = Number(header);
      if (length > MAX_PAYLOAD_BYTES) throw new Error('netstring: mensagem grande demais');
      const end = colon + 1 + length;
      if (this.buffer.length <= end) break;
      if (this.buffer[end] !== COMMA) throw new Error('netstring: terminador inválido');
      messages.push(this.buffer.subarray(colon + 1, end).toString('utf8'));
      this.buffer = this.buffer.subarray(end + 1);
    }
    return messages;
  }
}

module.exports = { encodeNetstring, NetstringDecoder };
