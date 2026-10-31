/*
 * Fixtures de QA visual (somente capturas e revisão de design). Não é dado de produto.
 * Este arquivo só declara dados em window.EASYPHONE_QA; não instala nada.
 * A ponte offline (bridge-offline.js) usa estas fixtures apenas com ?fixture=<nome>.
 * Todos os nomes são de teste e o domínio é example.invalid. Nenhuma ação chega ao motor.
 */
(function () {
  const account = (state) => ({
    id: 'qa-1',
    label: 'Conta de teste',
    username: 'qa-user',
    domain: 'example.invalid',
    transport: 'udp',
    state,
    detail: state === 'authentication-failed' ? 'Credenciais recusadas pelo servidor.' : undefined,
  });

  const base = (extra) => ({
    accounts: [],
    selectedAccountId: null,
    call: null,
    audioDevices: [],
    inputDeviceId: null,
    outputDeviceId: null,
    ...extra,
  });

  const registered = () => base({ accounts: [account('registered')], selectedAccountId: 'qa-1' });
  // Chamada ativa com Mudo ligado e com Mudo desligado: fixtures separadas, uma para cada estado.
  const activeCall = (muted) => base({
    accounts: [account('registered')],
    selectedAccountId: 'qa-1',
    call: { id: 'qa-call-out', direction: 'outgoing', remoteUri: 'sip:846001@example.invalid', state: 'active', startedAt: Date.now() - 83000, muted, held: false },
  });

  window.EASYPHONE_QA = {
    fixtures: {
      registered,
      'auth-failed': () => base({ accounts: [account('authentication-failed')], selectedAccountId: 'qa-1' }),
      incoming: () => base({
        accounts: [account('registered')],
        selectedAccountId: 'qa-1',
        call: { id: 'qa-call-in', direction: 'incoming', remoteUri: 'sip:paciente-teste@example.invalid', displayName: 'Contato de teste', state: 'ringing', muted: false, held: false },
      }),
      'active-muted': () => activeCall(true),
      'active-unmuted': () => activeCall(false),
    },
  };
})();
