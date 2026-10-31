# Motor de telefonia — Easyphone

Supervisor do Baresip atrás da API estreita `PhoneBridge` (`contracts/phone-bridge.d.ts`).
Somente SIP convencional por UDP, TCP e TLS. WebSocket e WSS não entram em nenhuma parte deste código. O toque de entrada é um WAV próprio configurado como `ring_aufile` no Baresip.

## Estado de execução

- **Build Linux local:** Baresip 4.12.0 e libre foram compilados no prefixo isolado `/home/adriano/.cache/easyphone-build/prefix`, sem instalar pacotes do sistema. O pacote ainda não está incorporado em `packaging/baresip`.
- **Validação de chamadas reais:** o usuário confirmou chamadas reais pelo Easyphone. Não foram registrados aqui os sistemas operacionais, periféricos, codecs ou casos funcionais cobertos; não inferir paridade com Windows/macOS a partir dessa confirmação.
- **Registro SIP observado:** em 31/10/2026, o `PhoneEngine` registrou o ramal PJSIP UDP 1003 do FreePBX; a VPS mostrou o contato `Avail` e a fila 6000 mostrou o membro `Not in use`. Essa observação é independente da validação de chamadas confirmada pelo usuário.
- Para esse teste, um wrapper temporário definiu `LD_LIBRARY_PATH`, necessário porque o build isolado usa bibliotecas compartilhadas. O pacote Electron ainda precisa carregar essas bibliotecas de forma reproduzível.
- A imagem Linux inclui o módulo PulseAudio, configurado para o servidor PulseAudio de PipeWire; a disponibilidade do dispositivo foi confirmada. A evidência detalhada de dispositivos e cenários de áudio não está registrada neste documento.
- O teste também revelou e corrigiu a ausência de `menu.so` na configuração da sessão. Esse módulo fornece `uanew`, `uareg` e `uadel`, necessários pelo canal `ctrl_tcp`.
- `test/fake-baresip.cjs` continua sendo usado para os 20 testes automatizados do engine; ele valida protocolo e ciclo de vida, não substitui o registro real nem prova RTP/áudio.

Comandos:

```sh
node --check phone-desktop/engine/*.cjs phone-desktop/electron/*.cjs
node --test phone-desktop/engine/test/engine.test.cjs   # 20 testes
```

## Limites de chamada desta versão (decisão de produto)

Esta versão suporta **uma chamada por vez**. As regras abaixo são do motor; a UI não foi alterada.

- **Chamada entrante com outra viva:** o motor recusa a nova na hora com `hangup <id> scode=486` (Busy Here). Ela não entra no mapa de chamadas nem no snapshot, então o segundo telefone não fica tocando sem aviso. O motor emite um aviso `CALL_REJECTED_BUSY` (`callId`, `remoteUri`, `activeCallId`, `message`) por `engine.onNotice(listener)`. Se o comando de recusa falhar, emite `CALL_REJECT_FAILED`. Esses avisos ficam fora do contrato `PhoneBridge`: expor a UI exige coordenação.
- **Dial com chamada viva:** `dial` recusa com `CALL_BUSY`, tanto antes de enfileirar quanto dentro da fila de comandos.
- **Remoção de conta (`removeAccount`):** recusada com `ACCOUNT_IN_CALL` enquanto houver chamada viva ou dial pendente naquela conta. Nada é desregistrado nem removido do motor nesse caso. A checagem é repetida dentro da fila, antes do `uareg 0`.
  - Chamada "pendente" = `dial` enviado ao motor cujo `CALL_OUTGOING` ainda não chegou. O marcador some quando o `CALL_OUTGOING` chega ou quando o `dial` falha. Se o motor nunca enviar `CALL_OUTGOING`, a conta fica bloqueada até o motor parar. Isso não foi testado com Baresip real.
  - Chamada com conta desconhecida (evento sem `accountaor` que case com uma conta cadastrada) bloqueia a remoção de qualquer conta enquanto estiver viva. É o lado seguro.
- A UI deve tratar `ACCOUNT_IN_CALL` como mensagem de erro e não derrubar a chamada. Hoje o erro sobe pelo IPC com o `message` em português.

## Pendências e premissas não verificadas

- **Formato do AOR em `uadel`:** `uanew` recebe o AOR com porta (`sip:1001@host:5061`), e `uadel`/`uareg` recebem `accountAor()` sem porta (`sip:1001@host`). Não foi verificado qual casamento o Baresip real faz. O fake aceita os dois, o que é premissa do teste, não prova. Se o Baresip exigir o AOR exato, `removeAccount` falha depois do `uareg 0` e a conta fica cadastrada e offline, o que é seguro, mas exige correção.
- **Canal de controle sem autenticação (QA-03):** continua em aberto, como descrito acima.
- **Códigos de motivo SIP (F-20):** o motor não mapeia 486, 603 e 408 para motivos de chamada. `CALL_CLOSED` vira só `ended` ou `failed`.
- **Janela de contrato:** `removeAccount` e os avisos mudaram de comportamento e precisam de revisão do `electron/main.cjs` (QA-04, ordem de cofre e motor) e da UI antes do uso real.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `phone-engine.cjs` | `PhoneEngine`: API do contrato, estado do snapshot, mapeamento de eventos, comandos serializados |
| `process-supervisor.cjs` | Spawn, espera de prontidão, redação de saída, parada com SIGTERM/SIGKILL e limpeza |
| `control-client.cjs` | Cliente `ctrl_tcp` (só `127.0.0.1`), uma requisição por token |
| `netstring.cjs` | Framing `<tamanho>:<payload>,` |
| `baresip-config.cjs` | Gera o arquivo de configuração da sessão (sem credenciais) |
| `validation.cjs` | Validação de contas e destinos; montagem da string `uanew` |

## Canal de controle (`ctrl_tcp`)

Fonte verificada: `modules/ctrl_tcp/ctrl_tcp.c` do Baresip (branch `main`; última release `v4.12.0`).

- **Transporte:** TCP em `127.0.0.1:<porta>`. A porta é livre, escolhida na hora e nunca fixa. O padrão do Baresip é `0.0.0.0:4444`, que **não** é usado.
- **Framing:** netstring (`<bytes>:<json>,`).
- **Requisição:** `{"command": "<nome>", "params": "<resto>", "token": "<id>"}`.
- **Resposta:** `{"response": true, "ok": true|false, "data": "<texto>", "token": "<id>"}`.
- **Evento:** `{"event": true, "class": "call|ua", "type": "<TIPO>", "id", "accountaor", "peeruri", "param"}`.
- **Conexão:** o módulo aceita uma conexão por vez. Uma segunda conexão substitui a primeira.

### Limitações de segurança do canal (decisão em aberto)

- O `ctrl_tcp` **não tem autenticação nem senha** nesta versão. Qualquer processo do mesmo usuário na máquina pode conectar-se a `127.0.0.1` se descobrir a porta (visível em `/proc/net/tcp`).
- A recomendação do DevOps (senha aleatória por sessão) não é possível sem alterar o módulo. As alternativas são: (a) um patch do `ctrl_tcp` com token; (b) socket privado (Unix socket ou named pipe) em vez de TCP. **Isto precisa de decisão antes de produção.**
- Os itens acima são o que o código garante hoje: loopback, porta efêmera, sem `0.0.0.0`.

### Comandos usados

| Ação | Comando Baresip | Observação |
| --- | --- | --- |
| Criar UA com registro | `uanew "<label>" <sip:…;transport=…;regint=300;auth_user=…>;auth_pass=…` | Única forma sem arquivo de contas; a senha passa aqui |
| Criar UA só para discar | `uanew …` com `regint=0` | Sem registro |
| Registrar / desregistrar | `uareg <regint> <índice>` | `0` desregistra |
| Remover UA | `uadel <aor>` | Após `uareg 0` |
| Discar | `dial <destino> <índice>` | O índice é a posição na lista de UAs |
| Atender | `accept <callid>` | |
| Recusar | `hangup <callid> scode=603` | |
| Encerrar | `hangup <callid>` | |
| Selecionar chamada | `callfind <callid>` | Necessário antes de `mute`, `sndcode` e `transfer` |
| Mudo | `mute true\|false` | Após `callfind` |
| Espera / retomada | `hold <callid>` / `resume <callid>` | Recebem o id direto |
| DTMF | `sndcode <dígitos>` | Após `callfind` |
| Transferência cega | `transfer <destino>` | Após `callfind` |
| Áudio | `ausrc <driver,dispositivo>` / `auplay <driver,dispositivo>` | |

### Eventos tratados

- **Registro:** `REGISTERING` → `registering`; `REGISTER_OK` → `registered`; `REGISTER_FAIL` → `authentication-failed` se o texto citar 401/403/407 ou autorização, senão `error`; `UNREGISTERING` → `offline`.
- **Chamada:** `CALL_INCOMING`, `CALL_OUTGOING`, `CALL_RINGING`, `CALL_PROGRESS` (early media), `CALL_ANSWERED`, `CALL_ESTABLISHED`, `CALL_HOLD`, `CALL_RESUME`, `CALL_CLOSED`.
- `CALL_CLOSED` vira `ended`, ou `failed` quando a chamada de saída nunca foi estabelecida.
- `TRANSFER_FAILED` e eventos DTMF/RTP são ignorados nesta versão.

## Configuração gerada

- `sip_transports udp,tcp,tls` e `sip_trans_def udp`. O padrão do Baresip inclui `ws,wss`, por isso é sobrescrito.
- `sip_listen <IP da interface>:0`. Nunca `0.0.0.0`. A porta efetiva é escolhida pelo sistema e **ainda não foi confirmada** com `ss`.
- `sip_verify_server yes`. `sip_cafile` é usado somente se existir (Linux: `/etc/ssl/certs/ca-certificates.crt`). Sem CA, a verificação TLS deve falhar fechada; **não verificado** sem o binário.
- `ctrl_tcp_listen 127.0.0.1:<porta efêmera>`.
- Módulos: `g711` (PCMU/PCMA), `auconv`, `auresamp`, e o driver de áudio do sistema (`pulse` no Linux, `winwave` no Windows ou `coreaudio` no macOS). Dispositivo `default`.
- `rtp_ports 10000-10100`. **O bind de RTP não é controlado por uma chave verificada**; a validação com `ss` é pendente.

### Pendente de F-P1-03 (TLS, expiração e codecs)

- Codecs: apenas G.711. Opus e outros não estão carregados. Decisão necessária.
- Expiração do registro: `regint` fixo em 300 s, sem configuração. Decisão necessária.
- CA para Windows e macOS: não há caminho padrão definido. TLS sem CA configurada deve falhar.

## Segredos

- A senha fica cifrada pelo `safeStorage` no processo principal (`electron/main.cjs`), nunca em texto.
- Ela chega ao motor só pelo comando `uanew` no loopback. Não entra no arquivo de configuração nem no snapshot.
- A resposta do `uanew` ecoa a string da conta com a senha: o engine a descarta e não a repassa em erro.
- A saída do motor (stdout/stderr) passa por redação antes de ser guardada. Nada é gravado em disco.
- O Baresip não é iniciado com `-v`: no modo debug ele registra os parâmetros dos comandos.
- **Limitação:** a senha trafega em texto no loopback, porque o `ctrl_tcp` não tem TLS.
- Senhas com espaço, aspas, `;`, `<` ou `>` são recusadas, porque o Baresip lê `auth_pass` como parâmetro da string.

## Ciclo de vida

- `start`: diretório de execução em `userData/runtime/run-*` com modo 0700; arquivo `config` com modo 0600; processo sem shell; ambiente restrito a uma lista de variáveis.
- `stop`: desregistra as contas (`uareg 0`), envia SIGTERM (o Baresip então faz `ua_stop_all`), espera 5 s, depois SIGKILL. O diretório de execução é removido.
- Saída inesperada do processo: contas ficam `offline` com motivo, chamadas ficam `failed`, e o diretório é removido.
- No Windows, SIGTERM encerra o processo sem desregistrar. **Limitação não tratada.**

## Ciclo de chamada no snapshot (correção após QA)

- Problema achado no QA (task_9ea40b9dd0ee): `refreshPrimary()` mantinha a última chamada encerrada como `primaryCallId`. O snapshot ficava com `call.state === 'ended'`, a UI tratava isso como chamada presente e "Ligar" ficava desabilitado, mesmo com o motor aceitando novo `dial`.
- Correção: quando não há chamada viva, `primaryCallId` vira `null` e as chamadas em estado final são removidas do mapa. `snapshot().call` passa a ser `null`, e a UI volta a permitir discar. Eventos tardios de um id já removido são ignorados.
- `handleExit` (encerramento do motor) passa pela mesma limpeza, então uma queda também não deixa chamada final presa no snapshot.
- Os listeners continuam recebendo `emitSnapshot` a cada evento de chamada; nenhum evento é descartado.
- Testes: `fluxo completo` e `chamada recebida` passaram a esperar `call === null`; novo teste `chamada encerrada libera o snapshot` cobre desligar, `call` nulo e segunda chamada (`dial` duas vezes, ids distintos). Tudo com `test/fake-baresip.cjs`, sem Baresip real nem SIP de produção.
- Arquivos alterados: `phone-desktop/engine/phone-engine.cjs`, `phone-desktop/engine/test/engine.test.cjs`, `phone-desktop/engine/README.md`.
- Comandos executados:
  - `node --check phone-desktop/engine/*.cjs`
  - `node --test phone-desktop/engine/test/engine.test.cjs` (antes: 16/16; depois: 17/17)
- Não coberto: chamada de saída que falha antes de ser estabelecida (`failed`) não é exercitada pelo fake. A regra é a mesma (`FINAL_CALL_STATES`), mas sem teste de integração.

## Pendente e não verificado

- **Compilação e execução real do Baresip**: sem binário no host. Bloqueia a validação de `ss`, do bind de RTP, da ordem da lista de UAs (índice de `dial`), da forma `outbound="…"` dentro da URI e do formato de `REGISTER_FAIL`.
- **F-P1-01 (contatos e recentes):** fora do contrato atual. Não há API de contatos nem de histórico. Decisão: onde persistir (cofre ou banco local).
- **Estado do motor no snapshot:** o contrato não tem campo de estado do motor. Hoje o erro aparece só no `detail` das contas. Proposta: um campo `engine`.
- **Edição de conta:** `saveAccount` só cria. Para editar, é preciso remover e adicionar.
- **Dispositivos de áudio:** somente `default`; não há enumeração.
- **Chamadas:** o snapshot mostra uma chamada principal. Uma segunda entrante enquanto há outra viva é recusada com 486 e avisada (ver "Limites de chamada desta versão"). A UI ainda não mostra esse aviso.
- **Transferência:** somente cega.
- **Janela:** `electron/main.cjs` usa os mesmos tamanhos de `renderer/demo/main.cjs`. Não há medição do Zoiper.
- **Bug no demo do renderer** (fora do escopo deste trabalho): `renderer/demo/main.cjs` usa `win.getContentSize()` como se fosse objeto, mas ele devolve um array `[largura, altura]`. Ao voltar ao modo normal, o tamanho vira `undefined`.
