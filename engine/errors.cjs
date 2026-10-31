'use strict';

// Erro com código estável para o renderer; a mensagem é curta, em português e nunca contém segredos.
class PhoneError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PhoneError';
    this.code = code;
  }
}

module.exports = { PhoneError };
