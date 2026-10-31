'use strict';

const { PhoneError } = require('./errors.cjs');

// Somente SIP convencional: udp, tcp e tls. WebSocket (ws/wss) fica fora de qualquer validação.
const TRANSPORTS = new Set(['udp', 'tcp', 'tls']);
const LABEL_RE = /^[\p{L}\p{N} ._-]{1,64}$/u;
const USER_RE = /^[A-Za-z0-9._+-]{1,64}$/;
const HOST_RE = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
// Senha sem espaços, controles, aspas, "<", ">" ou ";": o Baresip lê auth_pass como parâmetro da string de conta.
const PASSWORD_RE = /^[^\s\x00-\x1f\x7f;"<>]{1,256}$/;
const NUMBER_RE = /^\+?[0-9*#]{1,32}$/;
const SIP_URI_RE = /^sip:([A-Za-z0-9._+-]{1,64})@([A-Za-z0-9.-]{1,253})(?::(\d{1,5}))?(?:;transport=(udp|tcp|tls))?$/;
const CALL_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const DIGITS_RE = /^[0-9*#A-D]{1,32}$/;
const DRIVER_RE = /^[a-z0-9_]{1,16}$/;
const DEVICE_ID_RE = /^[a-z0-9_]{1,16},[A-Za-z0-9_.:-]{1,128}$/;

function invalid(message) {
  return new PhoneError('INVALID_INPUT', message);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function parsePort(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const port = Number(value);
  if (!isValidPort(port)) throw invalid(`${field} deve estar entre 1 e 65535.`);
  return port;
}

// Proxy opcional em "host" ou "host:porta"; sem esquema e sem parâmetros, para não abrir espaço de injeção na URI.
function parseProxy(value) {
  const raw = text(value);
  if (!raw) return undefined;
  const match = /^([^:]+)(?::(\d{1,5}))?$/.exec(raw);
  if (!match || !HOST_RE.test(match[1])) throw invalid('Proxy de saída inválido. Use host ou host:porta.');
  if (match[2] !== undefined && !isValidPort(Number(match[2]))) throw invalid('Porta do proxy inválida.');
  return raw;
}

function validateAccountDraft(draft) {
  if (!draft || typeof draft !== 'object') throw invalid('Dados da conta ausentes.');
  const username = text(draft.username);
  if (!USER_RE.test(username)) throw invalid('Usuário SIP inválido.');
  const domain = text(draft.domain);
  if (!HOST_RE.test(domain)) throw invalid('Domínio SIP inválido.');
  const transport = text(draft.transport);
  if (!TRANSPORTS.has(transport)) throw invalid('Transporte deve ser UDP, TCP ou TLS.');
  const label = text(draft.label) || username;
  if (!LABEL_RE.test(label)) throw invalid('Nome da conta inválido.');
  const authUsername = text(draft.authUsername) || username;
  if (!USER_RE.test(authUsername)) throw invalid('Usuário de autenticação inválido.');
  const password = typeof draft.password === 'string' ? draft.password : '';
  if (!PASSWORD_RE.test(password)) throw invalid('Senha inválida: sem espaços, aspas ou ponto e vírgula.');

  return {
    label,
    username,
    authUsername,
    domain,
    port: parsePort(draft.port, 'Porta'),
    outboundProxy: parseProxy(draft.outboundProxy),
    transport,
    password,
  };
}

// Identidade da conta para unicidade e para casar eventos (usuário@domínio, sem porta nem parâmetros).
function accountKey(account) {
  return `${account.username}@${account.domain}`.toLowerCase();
}

function keyFromAor(aor) {
  const match = /^sips?:([^@;>\s]+)@([^:;>\s]+)/i.exec(String(aor || ''));
  return match ? `${match[1]}@${match[2]}`.toLowerCase() : null;
}

function accountAor(account) {
  return `sip:${account.username}@${account.domain}`;
}

// Formato lido pelo account.c do Baresip: parâmetros de URI ficam dentro de <>, auth_pass depois do '>'.
function buildAccountString(account, { regint, password }) {
  const uriParams = [`transport=${account.transport}`, `regint=${regint}`, `auth_user=${account.authUsername}`];
  if (account.outboundProxy) uriParams.push(`outbound="sip:${account.outboundProxy}"`);
  const port = account.port ? `:${account.port}` : '';
  const display = `"${account.label}" `;
  return `${display}<sip:${account.username}@${account.domain}${port};${uriParams.join(';')}>;auth_pass=${password}`;
}

function validateDestination(value) {
  const target = text(value);
  if (NUMBER_RE.test(target)) return target;
  const match = SIP_URI_RE.exec(target);
  if (match && HOST_RE.test(match[2]) && (match[3] === undefined || isValidPort(Number(match[3])))) return target;
  throw invalid('Destino inválido. Use um número ou um URI sip: convencional.');
}

function validateCallId(value) {
  if (typeof value !== 'string' || !CALL_ID_RE.test(value)) throw invalid('Identificador de chamada inválido.');
  return value;
}

function validateDigits(value) {
  if (typeof value !== 'string' || !DIGITS_RE.test(value)) throw invalid('DTMF aceita somente 0-9, *, #, A-D.');
  return value;
}

function validateDeviceId(value) {
  if (typeof value !== 'string' || !DEVICE_ID_RE.test(value)) throw invalid('Identificador de dispositivo inválido.');
  return value;
}

function validateDriver(value) {
  if (typeof value !== 'string' || !DRIVER_RE.test(value)) throw invalid('Driver de áudio inválido.');
  return value;
}

module.exports = {
  TRANSPORTS,
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
};
