(() => {
  'use strict';

  const MODE_KEY = 'easyphone:mode';
  const DEFAULT_ERROR = 'Não foi possível concluir a ação no motor de telefonia.';

  const REG_LABEL = {
    offline: 'Offline',
    connecting: 'Conectando',
    registering: 'Registrando',
    registered: 'Registrada',
    'authentication-failed': 'Falha de autenticação',
    error: 'Erro de registro',
  };
  const REG_TONE = {
    registered: 'ok',
    connecting: 'pending',
    registering: 'pending',
    'authentication-failed': 'bad',
    error: 'bad',
    offline: 'idle',
  };
  const ACCOUNT_HINT = {
    offline: 'Conta sem registro.',
    connecting: 'Registrando a conta. Aguarde.',
    registering: 'Registrando a conta. Aguarde.',
    'authentication-failed': 'Falha de autenticação.',
    error: 'Erro de registro.',
  };
  const DIRECTION_LABEL = { incoming: 'Entrada', outgoing: 'Saída' };
  const CALL_LABEL = {
    ringing: 'Tocando',
    connecting: 'Conectando',
    'early-media': 'Chamando',
    active: 'Em chamada',
    held: 'Em espera',
    ending: 'Encerrando',
    ended: 'Encerrada',
    failed: 'Falhou',
  };
  const TRANSPORT_LABEL = { udp: 'UDP', tcp: 'TCP', tls: 'TLS' };
  const KEYS = [
    ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
    ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
    ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
    ['*', ''], ['0', '+'], ['#', ''],
  ];

  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label, className, onClick) => {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };

  let snap = null;
  let dtmfOpen = false;
  let transferOpen = false;
  let removeArmedId = null;
  let saving = false;
  let noticeTimer = 0;
  let accountListKey = '';
  let accountSelectKey = '';

  const selectedAccount = () => {
    if (!snap) return null;
    return snap.accounts.find((account) => account.id === snap.selectedAccountId) || snap.accounts[0] || null;
  };
  const isIncomingRinging = (call) => call.direction === 'incoming' && call.state === 'ringing';
  const isLive = (call) => !['ending', 'ended', 'failed'].includes(call.state);
  const isMediaActive = (call) => call.state === 'active' || call.state === 'held';

  // Separa "sip:usuario@dominio" em usuário e domínio. Não exibe o prefixo sip: ao usuário.
  function splitUri(uri = '') {
    const bare = String(uri).replace(/^sips?:/i, '');
    const at = bare.indexOf('@');
    return at > 0 ? { user: bare.slice(0, at), host: bare.slice(at + 1) } : { user: bare, host: '' };
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const seconds = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
  }

  function showNotice(message, tone = 'error') {
    const notice = $('notice');
    notice.textContent = message;
    notice.dataset.tone = tone;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 8000);
  }

  async function run(action, fallback = DEFAULT_ERROR) {
    try {
      await action();
      return true;
    } catch (error) {
      showNotice(error?.message || fallback);
      return false;
    }
  }

  function callAction(action) {
    const call = snap?.call;
    if (call) run(() => action(call));
  }

  function restoreMode() {
    try {
      return localStorage.getItem(MODE_KEY) === 'compact' ? 'compact' : 'normal';
    } catch {
      return 'normal';
    }
  }

  function setMode(mode, { remember = true } = {}) {
    const compact = mode === 'compact';
    document.body.dataset.mode = compact ? 'compact' : 'normal';
    const label = compact ? 'Voltar ao modo normal' : 'Usar modo compacto';
    const toggle = $('mode-toggle');
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    $('icon-to-compact').hidden = compact;
    $('icon-to-normal').hidden = !compact;
    if (remember) {
      try {
        localStorage.setItem(MODE_KEY, compact ? 'compact' : 'normal');
      } catch {
        // Sem armazenamento, o modo vale só nesta sessão.
      }
    }
    const shell = window.phoneShell;
    if (shell?.setWindowMode) {
      shell.setWindowMode(compact ? 'compact' : 'normal').catch(() => showNotice('Não foi possível redimensionar a janela.'));
    }
    if (snap) renderDial();
  }

  function setView(view) {
    document.body.dataset.view = view;
    for (const section of document.querySelectorAll('.view')) {
      section.classList.toggle('is-active', section.dataset.view === view);
    }
    for (const tab of document.querySelectorAll('.tab')) {
      if (tab.dataset.go === view) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
  }

  function buildKeypad(container, onKey, small = false) {
    container.classList.toggle('keypad-small', small);
    for (const [digit, letters] of KEYS) {
      const key = el('button', 'key');
      key.type = 'button';
      key.dataset.key = digit;
      key.setAttribute('aria-label', digit);
      key.append(el('span', 'key-digit', digit));
      // A linha de letras é sempre reservada (vazia nas teclas 1, * e #): dígitos ficam na mesma altura em todos os teclados.
      key.append(el('span', 'key-letters', letters));
      key.addEventListener('click', () => onKey(digit));
      container.append(key);
    }
  }

  function renderCall() {
    const call = snap.call;
    document.body.dataset.call = !call ? 'none' : isIncomingRinging(call) ? 'incoming' : 'active';
    $('call-panel').hidden = !call;
    if (!call) {
      dtmfOpen = false;
      transferOpen = false;
      $('call-dtmf').hidden = true;
      $('transfer-form').hidden = true;
      return;
    }

    const media = isMediaActive(call);
    const incoming = isIncomingRinging(call);
    if (!media) {
      dtmfOpen = false;
      transferOpen = false;
    }

    const { user, host } = splitUri(call.remoteUri);
    const name = call.displayName || user || call.remoteUri;
    const address = call.displayName ? [user, host].filter(Boolean).join('@') : host;
    $('call-name').textContent = name;
    $('call-uri').textContent = address;
    $('call-uri').hidden = !address;
    $('call-direction').textContent = DIRECTION_LABEL[call.direction] ?? '';
    $('call-state').textContent = CALL_LABEL[call.state] ?? call.state;

    $('incoming-actions').hidden = !incoming;
    $('call-controls').hidden = incoming || !isLive(call);

    // Mudo é ação fixa: o rótulo não muda, o estado vai para aria-pressed e para o destaque visual.
    const mute = $('mute-btn');
    mute.setAttribute('aria-pressed', String(call.muted));
    mute.title = call.muted ? 'Microfone silenciado. Clique para reativar.' : 'Silenciar o microfone.';
    mute.querySelector('.ctl-state').textContent = call.muted ? 'ativo' : 'inativo';
    mute.disabled = !media;

    const hold = $('hold-btn');
    hold.setAttribute('aria-pressed', String(call.held));
    hold.querySelector('span').textContent = call.held ? 'Retomar' : 'Espera';
    hold.disabled = !media;

    for (const id of ['keypad-toggle', 'transfer-toggle']) $(id).disabled = !media;
    $('keypad-toggle').setAttribute('aria-expanded', String(dtmfOpen && media));
    $('transfer-toggle').setAttribute('aria-expanded', String(transferOpen && media));
    $('call-dtmf').hidden = !(dtmfOpen && media);
    $('transfer-form').hidden = !(transferOpen && media);
  }

  // Duração só aparece com chamada de mídia e horário real; antes disso o campo fica vazio.
  function renderTimer() {
    const call = snap?.call;
    const timer = $('call-timer');
    if (!call || !isMediaActive(call)) {
      timer.textContent = '';
      return;
    }
    timer.textContent = call.startedAt ? formatDuration(Date.now() - call.startedAt) : '--:--';
  }

  // Seletor de conta de ligação fica em Configurações; o Discador mostra só o status resumido da linha.
  function renderAccountSelect() {
    const accounts = snap.accounts;
    $('account-select-wrap').hidden = accounts.length === 0;
    const select = $('account-select');
    const key = JSON.stringify(accounts.map((account) => [account.id, account.label]));
    if (key !== accountSelectKey) {
      accountSelectKey = key;
      select.replaceChildren(...accounts.map((account) => new Option(account.label, account.id)));
    }
    select.value = selectedAccount()?.id ?? '';
  }

  function renderDialLine() {
    const account = selectedAccount();
    $('dial-line').textContent = account
      ? `Linha: ${account.label} · ${REG_LABEL[account.state] ?? account.state}`
      : 'Linha não configurada.';
  }

  function dialHint(account, hasDestination) {
    if (!account) return 'Linha não configurada. Peça à equipe responsável para liberar chamadas.';
    // Com chamada ativa ou tocando, o painel de chamada já mostra o estado: a dica do discador fica vazia.
    if (snap.call) return '';
    if (account.state === 'registered') return hasDestination ? '' : 'Digite um número ou endereço SIP.';
    return ACCOUNT_HINT[account.state] ?? 'Conta indisponível para ligar.';
  }

  // No modo compacto não há aba de Configurações: o atalho leva ao modo normal, na aba certa.
  function renderDial() {
    renderAccountSelect();
    renderDialLine();
    const account = selectedAccount();
    const hasDestination = $('dial-input').value.trim() !== '';
    $('dial-hint').textContent = dialHint(account, hasDestination);
    $('call-btn').disabled = !(account?.state === 'registered' && !snap.call && hasDestination);
  }

  function accountItem(account) {
    const item = el('li', 'account-item');
    const info = el('div', 'account-info');
    const selected = account.id === selectedAccount()?.id;
    info.append(
      el('strong', 'account-name', account.label),
      el('span', 'account-addr', `${account.username}@${account.domain} · ${TRANSPORT_LABEL[account.transport] ?? account.transport}`),
    );
    const status = el('p', 'account-status');
    const state = el('span', 'account-state', REG_LABEL[account.state] ?? account.state);
    state.dataset.tone = REG_TONE[account.state] ?? 'idle';
    status.append(state);
    if (selected) status.append(el('span', 'account-tag', 'Conta de ligação'));
    info.append(status);
    if (account.detail) info.append(el('span', 'account-detail', account.detail));

    const actions = el('div', 'account-actions');
    if (!selected) {
      actions.append(button('Usar', 'btn btn-quiet', () => run(() => window.phone.selectAccount(account.id))));
    }
    const active = ['registered', 'registering', 'connecting'].includes(account.state);
    actions.append(active
      ? button('Cancelar registro', 'btn btn-quiet', () => run(() => window.phone.unregister(account.id)))
      : button('Registrar', 'btn btn-outline', () => run(() => window.phone.register(account.id))));

    const armed = removeArmedId === account.id;
    actions.append(button(armed ? 'Confirmar remoção' : 'Remover', armed ? 'btn btn-danger' : 'btn btn-link', () => {
      if (!armed) {
        removeArmedId = account.id;
        accountListKey = '';
        renderAccounts();
        return;
      }
      removeArmedId = null;
      run(() => window.phone.removeAccount(account.id));
    }));

    item.append(info, actions);
    return item;
  }

  function renderAccounts() {
    const accounts = snap.accounts;
    $('account-list-empty').hidden = accounts.length > 0;
    $('account-list').hidden = accounts.length === 0;
    const key = JSON.stringify([accounts, snap.selectedAccountId, removeArmedId]);
    if (key === accountListKey) return;
    accountListKey = key;
    $('account-list').replaceChildren(...accounts.map(accountItem));
  }

  function renderAudio() {
    const hasDevices = snap.audioDevices.length > 0;
    $('audio-hint').textContent = hasDevices
      ? 'Microfone e alto-falante usados pelo motor de telefonia.'
      : 'Os dispositivos aparecem quando o motor os informa.';
    for (const kind of ['input', 'output']) {
      const select = $(kind === 'input' ? 'audio-input' : 'audio-output');
      const devices = snap.audioDevices.filter((device) => device.kind === kind);
      const key = JSON.stringify(devices);
      if (select.dataset.key !== key) {
        select.dataset.key = key;
        const placeholder = new Option(devices.length ? 'Escolher dispositivo' : 'Nenhum dispositivo informado', '');
        placeholder.disabled = true;
        select.replaceChildren(placeholder, ...devices.map((device) => new Option(device.label, device.id)));
      }
      select.disabled = devices.length === 0;
      select.value = (kind === 'input' ? snap.inputDeviceId : snap.outputDeviceId) ?? '';
    }
  }

  // Marca: logo personalizado vem do main process como bytes e vira data URI aqui (CSP img-src data:).
  // Sem ponte de marca (demo/harness), mantém o logo easyphone padrão.
  const BRAND_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const brandApi = window.phoneBranding;
  let brandDataUri = null;
  let brandBusy = false;

  // O Electron prefixa erros de IPC ("Error invoking remote method ..."): mostra só a mensagem em português.
  function brandError(error) {
    return String(error?.message ?? '').replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '') || DEFAULT_ERROR;
  }

  // Confirma que o navegador consegue decodificar a imagem antes de mostrá-la no cabeçalho.
  async function brandLogoFromBridge() {
    const logo = await brandApi.getLogo();
    if (!logo) return null;
    if (!BRAND_MIME.has(logo.mime)) throw new Error('Formato de logo não suportado.');
    if (typeof logo.data !== 'string' || logo.data.length > 1_400_000) throw new Error('O logo guardado é inválido.');
    const uri = `data:${logo.mime};base64,${logo.data}`;
    const probe = new Image();
    probe.src = uri;
    await probe.decode();
    return uri;
  }

  function renderBrand() {
    const custom = brandDataUri !== null;
    $('brand-wordmark').hidden = custom;
    const header = $('brand-custom');
    header.hidden = !custom;
    header.src = custom ? brandDataUri : '';
    $('brand-preview-official').hidden = custom;
    const preview = $('brand-preview-img');
    preview.hidden = !custom;
    preview.src = custom ? brandDataUri : '';
    $('brand-status').textContent = custom
      ? 'Logo personalizado guardado neste dispositivo.'
      : 'Usando o logo easyphone.';
    $('brand-change').disabled = brandBusy;
    $('brand-reset').disabled = brandBusy || !custom;
  }

  // Falha ao ler o logo guardado mantém o logo oficial; o arquivo não é apagado automaticamente.
  async function loadBrand() {
    if (!brandApi) return;
    try {
      brandDataUri = await brandLogoFromBridge();
    } catch (error) {
      brandDataUri = null;
      showNotice(`Não foi possível exibir o logo guardado. Logo easyphone mantido. ${brandError(error)}`);
    }
    renderBrand();
  }

  async function onChooseLogo() {
    if (brandBusy || !brandApi) return;
    brandBusy = true;
    renderBrand();
    try {
      const result = await brandApi.chooseLogo();
      if (result.status === 'saved') {
        try {
          brandDataUri = await brandLogoFromBridge();
        } catch {
          // Arquivo gravado mas ilegível para o navegador: não deixa um logo inutilizável guardado.
          await brandApi.resetLogo().catch(() => {});
          brandDataUri = null;
          throw new Error('A imagem não pôde ser lida. Escolha outro arquivo.');
        }
        showNotice('Logo guardado neste dispositivo.', 'info');
      }
    } catch (error) {
      showNotice(brandError(error));
    } finally {
      brandBusy = false;
      renderBrand();
    }
  }

  async function onResetLogo() {
    if (brandBusy || !brandApi) return;
    brandBusy = true;
    renderBrand();
    try {
      await brandApi.resetLogo();
      brandDataUri = null;
      showNotice('Logo easyphone restaurado.', 'info');
    } catch (error) {
      showNotice(brandError(error));
    } finally {
      brandBusy = false;
      renderBrand();
    }
  }

  function apply(next) {
    snap = next;
    renderCall();
    renderAccounts();
    renderDial();
    renderAudio();
    renderTimer();
  }

  async function onDialSubmit(event) {
    event.preventDefault();
    const destination = $('dial-input').value.trim();
    if (!destination) return;
    await run(() => window.phone.dial(destination));
  }

  async function onTransferSubmit(event) {
    event.preventDefault();
    const input = $('transfer-input');
    const destination = input.value.trim();
    const call = snap?.call;
    if (!destination || !call) return;
    const ok = await run(() => window.phone.transfer(call.id, destination));
    if (ok) {
      transferOpen = false;
      input.value = '';
      renderCall();
    }
  }

  async function onAccountSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (saving || !form.reportValidity()) return;
    const data = new FormData(form);
    const text = (name) => String(data.get(name) ?? '').trim();
    const portText = text('port');
    const port = portText ? Number(portText) : undefined;
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      showNotice('A porta deve estar entre 1 e 65535.');
      return;
    }
    const draft = {
      label: text('label'),
      username: text('username'),
      domain: text('domain'),
      transport: data.get('transport'),
      password: String(data.get('password') ?? ''),
    };
    if (text('authUsername')) draft.authUsername = text('authUsername');
    if (port !== undefined) draft.port = port;
    if (text('outboundProxy')) draft.outboundProxy = text('outboundProxy');

    saving = true;
    $('account-save').disabled = true;
    const ok = await run(() => window.phone.saveAccount(draft), 'A conta não foi salva.');
    saving = false;
    $('account-save').disabled = false;
    if (ok) {
      form.reset();
      updatePortPlaceholder();
      setPasswordVisible(false);
      showNotice('Conta enviada ao motor. O estado do registro aparece na lista de contas.', 'info');
    }
  }

  function updatePortPlaceholder() {
    const transport = $('account-form').elements.transport.value;
    $('account-form').elements.port.placeholder = transport === 'tls' ? '5061' : '5060';
  }

  function setPasswordVisible(visible) {
    const input = $('account-form').elements.password;
    const toggle = $('password-toggle');
    input.type = visible ? 'text' : 'password';
    toggle.textContent = visible ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-pressed', String(visible));
  }

  function bindEvents() {
    $('mode-toggle').addEventListener('click', () => {
      setMode(document.body.dataset.mode === 'compact' ? 'normal' : 'compact');
    });
    for (const node of document.querySelectorAll('[data-go]')) {
      node.addEventListener('click', () => setView(node.dataset.go));
    }

    $('dial-form').addEventListener('submit', onDialSubmit);
    $('dial-input').addEventListener('input', renderDial);
    $('backspace-btn').addEventListener('click', () => {
      const input = $('dial-input');
      input.value = input.value.slice(0, -1);
      renderDial();
      input.focus();
    });
    $('account-select').addEventListener('change', (event) => {
      run(() => window.phone.selectAccount(event.target.value));
    });

    $('answer-btn').addEventListener('click', () => callAction((call) => window.phone.answer(call.id)));
    $('reject-btn').addEventListener('click', () => callAction((call) => window.phone.reject(call.id)));
    $('hangup-btn').addEventListener('click', () => callAction((call) => window.phone.hangup(call.id)));
    $('mute-btn').addEventListener('click', () => callAction((call) => window.phone.setMuted(call.id, !call.muted)));
    $('hold-btn').addEventListener('click', () => callAction((call) => window.phone.setHeld(call.id, !call.held)));
    $('keypad-toggle').addEventListener('click', () => {
      dtmfOpen = !dtmfOpen;
      renderCall();
    });
    $('transfer-toggle').addEventListener('click', () => {
      transferOpen = !transferOpen;
      renderCall();
      if (transferOpen) $('transfer-input').focus();
    });
    $('transfer-cancel').addEventListener('click', () => {
      transferOpen = false;
      renderCall();
    });
    $('transfer-form').addEventListener('submit', onTransferSubmit);

    $('account-form').addEventListener('submit', onAccountSubmit);
    $('account-form').addEventListener('change', (event) => {
      if (event.target.name === 'transport') updatePortPlaceholder();
    });
    $('account-form').addEventListener('reset', () => setTimeout(() => {
      updatePortPlaceholder();
      setPasswordVisible(false);
    }));
    $('password-toggle').addEventListener('click', () => {
      setPasswordVisible($('account-form').elements.password.type === 'password');
    });

    $('brand-change').addEventListener('click', onChooseLogo);
    $('brand-reset').addEventListener('click', onResetLogo);

    for (const [id, kind] of [['audio-input', 'input'], ['audio-output', 'output']]) {
      $(id).addEventListener('change', (event) => {
        if (event.target.value) run(() => window.phone.setAudioDevice(kind, event.target.value));
      });
    }
  }

  async function init() {
    buildKeypad($('dial-keypad'), (digit) => {
      const input = $('dial-input');
      input.value += digit;
      renderDial();
      input.focus();
    });
    buildKeypad($('dtmf-keypad'), (digit) => callAction((call) => window.phone.sendDtmf(call.id, digit)), true);
    bindEvents();
    updatePortPlaceholder();
    const brandAvailable = typeof brandApi?.getLogo === 'function';
    $('brand-actions').hidden = !brandAvailable;
    $('brand-unavailable').hidden = brandAvailable;
    renderBrand();
    loadBrand();
    // O modo compacto precisa redimensionar a janela. Sem a ponte da janela, o botão não aparece
    // e a janela fica no modo normal, para não mostrar um layout compacto dentro de uma janela grande.
    const canResize = typeof window.phoneShell?.setWindowMode === 'function';
    $('mode-toggle').hidden = !canResize;
    setMode(canResize ? restoreMode() : 'normal', { remember: false });
    setView('dial');
    window.phone.onSnapshot(apply);
    apply(await window.phone.snapshot());
    setInterval(renderTimer, 1000);
  }

  init().catch((error) => showNotice(error?.message || 'Não foi possível iniciar o telefone.'));
})();
