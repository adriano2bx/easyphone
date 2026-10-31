/*
 * Ponte de desenvolvimento para o contrato window.phone (contracts/phone-bridge.d.ts).
 * Só é instalada quando o preload real não injetou window.phone.
 * Não há motor, conta, contato nem chamada reais aqui: o estado padrão é vazio e toda ação é recusada.
 * ?fixture=<nome> usa as fixtures de QA de qa-fixtures.js, somente para capturas visuais.
 */
(function () {
  if (window.phone) return;

  const fixture = new URLSearchParams(window.location.search).get('fixture');
  const qa = window.EASYPHONE_QA;
  const fixtures = (qa && qa.fixtures) || {};
  const NO_ENGINE = 'Motor de telefonia não conectado. Nada foi enviado ao SIP.';
  const FIXTURE_NOTE = 'Modo de QA: nenhuma ação chega ao motor.';

  function emptySnapshot() {
    return {
      accounts: [],
      selectedAccountId: null,
      call: null,
      audioDevices: [],
      inputDeviceId: null,
      outputDeviceId: null,
    };
  }

  const snapshotFactory = (fixture && fixtures[fixture]) || emptySnapshot;
  const notice = fixture ? FIXTURE_NOTE : NO_ENGINE;
  // Título e faixa de QA só aparecem com ?fixture=; a janela demo sem fixture mostra o título de produto.
  if (fixture) {
    document.title = 'Easyphone (QA: ' + fixture + ')';
    document.body.dataset.qa = 'true';
  }

  const rejected = () => Promise.reject(new Error(notice));

  window.phone = {
    snapshot: () => Promise.resolve(snapshotFactory()),
    onSnapshot: () => () => {},
    saveAccount: rejected,
    removeAccount: rejected,
    selectAccount: rejected,
    register: rejected,
    unregister: rejected,
    dial: rejected,
    answer: rejected,
    reject: rejected,
    hangup: rejected,
    setMuted: rejected,
    setHeld: rejected,
    sendDtmf: rejected,
    transfer: rejected,
    setAudioDevice: rejected,
  };
})();
