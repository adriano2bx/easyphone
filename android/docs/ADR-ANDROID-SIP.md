# ADR — Softphone Android do easyphone: motor SIP nativo

- **Estado:** proposto (aguardando aceite do responsável técnico)
- **Data:** 2026-10-31
- **Escopo:** app Android do easyphone, em paralelo ao desktop Linux (`phone-desktop/`). Não altera o desktop.
- **Roteiro de entrega:** [ANDROID-ROADMAP.md](ANDROID-ROADMAP.md)

## Como ler este documento

Cada afirmação técnica recebe um rótulo:

- **[CONFIRMADO]** — lido em fonte primária (código-fonte ou documentação oficial) nesta pesquisa. A fonte está citada.
- **[SECUNDÁRIO]** — vindo de busca, blog ou projeto de terceiros. Serve de pista, não de prova.
- **[A VERIFICAR]** — não confirmado. Precisa de teste ou de leitura da fonte antes de virar decisão.
- **[LOCAL]** — fato observado neste repositório (`phone-desktop/`).

Este ADR **não registra nenhum build, teste ou execução no Android**. Nada aqui foi compilado. As afirmações sobre o comportamento do app são decisões de projeto e critérios de aceite, não resultados.

---

## 1. Contexto

- O easyphone desktop usa wxWidgets para a interface e um processo Baresip supervisionado pelo Electron. O motor fala com o Baresip por `ctrl_tcp` em loopback [LOCAL: `phone-desktop/engine/baresip-config.cjs:49`, `engine/process-supervisor.cjs:92`].
- O desktop fixa Baresip e libre em commits da versão 4.12.0 [LOCAL: `phone-desktop/packaging/scripts/build-baresip-isolated.sh:9-10`: `RE_COMMIT=e5ec9ba…` e `BARESIP_COMMIT=cf7f60a…`].
- O ADR-0003 do repositório pai já escolheu Baresip como motor SIP, sem WebSocket, com segredos no cofre nativo e licenças auditadas antes da distribuição [LOCAL: `docs/adr/0003-softphone-doctorbot-baresip.md`]. Este ADR estende essa decisão ao Android.
- O requisito de produto é SIP convencional (UDP, TCP, TLS). WebSocket e WSS ficam fora [LOCAL: `phone-desktop/engine/README.md`].
- O engine desktop suporta uma chamada por vez e recusa a segunda com 486 [LOCAL: `phone-desktop/engine/README.md`, seção "Limites de chamada desta versão"].

## 2. Decisão

**Usar libbaresip (Baresip como biblioteca) dentro de um processo Android, compilada com o NDK e exposta ao Kotlin por JNI. Não usar o binário `baresip` como processo separado.**

Escopo da decisão:

1. O motor roda **in-process**, em uma biblioteca nativa `libeasyphone_sip.so` que linka `libbaresip`, `libre` e `libopus`. Um wrapper C fino expõe ao Kotlin: registrar conta, discar, atender, recusar, encerrar, mudo, espera, DTMF, transferência cega e eventos.
2. **Não há `ctrl_tcp` no Android.** A camada de controle é chamada direta em memória. Isso elimina a porta de loopback sem autenticação, apontada como risco aberto no desktop [LOCAL: `phone-desktop/engine/README.md`, "Limitações de segurança do canal"]. Este é o principal ganho de segurança da decisão.
3. Um único thread nativo dono de `re_main()` executa o loop do libre. Comandos do Kotlin entram por fila e são executados nesse thread. Eventos voltam ao Kotlin por callback JNI com referência global. Nenhuma função do Baresip é chamada diretamente de outra thread.
4. O Kotlin/Java cuida da UI, do ciclo de vida, de permissões, do serviço em primeiro plano, da integração com Telecom (seção 5) e do cofre (seção 7).

### Alternativas consideradas

| Alternativa | Veredito | Motivo |
|---|---|---|
| **A. Binário `baresip` como processo filho** (modelo do desktop) | Descartada | Apps Android com `targetSdk` 29 ou superior não executam binários do diretório de dados do app de forma confiável; isso precisa de verificação [A VERIFICAR]. O `ctrl_tcp` abriria uma porta de loopback sem autenticação, que é o problema que queremos eliminar [LOCAL]. |
| **B. libbaresip via NDK/JNI (esta decisão)** | **Escolhida** | Engine in-process, sem porta de controle, mesma base de código C do desktop, licença BSD-3 [CONFIRMADO]. |
| **C. PJSIP / PJSUA2** | Rejeitada | O ADR-0003 já a descartou: GPL ou licença comercial [LOCAL: ADR-0003]. |
| **D. SIP.js ou WebSocket** | Rejeitada | Requisito de produto proíbe WebSocket na sinalização [LOCAL]. |
| **E. Linphone SDK** | Rejeitada nesta fase | O ADR-0003 registra o risco de obrigações GPL/AGPL ou licença proprietária [LOCAL]. Reavaliar só com decisão explícita de licenciamento. |
| **F. Reutilizar um app Android pronto (ex.: baresip-studio)** | Não adotar o app; usar como referência | Ver seção 9. Projeto de terceiros, não é base de produto. |

## 3. Fatos confirmados sobre o Baresip e o Android

### 3.1 Estado do suporte Android no upstream

- **[CONFIRMADO]** O repositório `baresip/baresip` declara licença BSD-3-Clause e lista Android 8.0 ou superior como plataforma. Lista Opus (RFC 6716), TLS para sinalização e SRTP para mídia. Traz os módulos de áudio `aaudio` e `opensles` [fonte: https://github.com/baresip/baresip].
- **[CONFIRMADO]** O diretório `modules/aaudio/` existe no upstream, com `aaudio.c`, `player.c`, `recorder.c`, `utils.c` e `CMakeLists.txt` [fonte: https://github.com/baresip/baresip/tree/main/modules/aaudio].
- **[CONFIRMADO]** Os copyrights do `LICENSE` do upstream são: Baresip Foundation 2020–2026; Alfred E. Heggestad 2010–2024; Richard Aas 2010–2021; Creytiv.com 2010–2021. O texto é a BSD de 3 cláusulas [fonte: https://raw.githubusercontent.com/baresip/baresip/main/LICENSE].
- **[CONFIRMADO]** O build do desktop usa CMake 3.18 ou superior, por exigência do próprio Baresip 4.12 [LOCAL: `packaging/scripts/check-toolchain.sh`].

### 3.2 Projetos Android de terceiros (não são base de produto)

- **[CONFIRMADO]** `github.com/baresip/baresip-android` é um guia de build antigo: NDK suportado r14 a r17, não suportado r13 e r18; usa baresip-0.5.9, re-0.5.8, OpenSSL 1.1.0h. O repositório tem só um `Makefile` como arquivo de build. Não mostra integração JNI nem AAR. **Conclusão:** defasado frente ao Baresip 4.12 [fonte: https://github.com/baresip/baresip-android].
- **[CONFIRMADO]** `juha-h/baresip-studio` é app Android em BSD-3, com README que cita Android 9 ou superior e chamadas em Android 10 ou superior. Depende de um submódulo `libbaresip-android` e exige gerar bibliotecas estáticas antes do Android Studio [fonte: https://github.com/juha-h/baresip-studio].
- **[SECUNDÁRIO]** O pacote `baresip_flutter` 0.2.1 declara Android 10 ou superior (minSdk 29) e exige um AAR do Baresip em `libs` [fonte: https://pub.dev/packages/baresip_flutter/changelog].
- **[CONFIRMADO]** Discussão `baresip/baresip#2672` reconhece que as instruções de build Android são difíceis de achar [fonte: https://github.com/baresip/baresip/discussions/2672].

**Conclusão:** não existe um caminho oficial, atual e documentado de "libbaresip para Android via JNI" no upstream. Os exemplos são antigos ou dependem de bibliotecas intermediárias. **Precisamos de um wrapper próprio**, construído sobre o Baresip 4.12 fixado, e de um script de build reproduzível, no mesmo padrão do `build-baresip-isolated.sh` do desktop.

### 3.3 Chamadas e Telecom no Android

- **[CONFIRMADO]** A biblioteca Jetpack `androidx.core:core-telecom:1.0.0` documenta o fluxo para apps de chamada de voz própria (self-managed). Exige a permissão `android.permission.MANAGE_OWN_CALLS` no manifesto. A biblioteca usa `ConnectionService` até o Android 13 (API 33) e tipos de serviço em primeiro plano no Android 14 (API 34) ou superior [fonte: https://developer.android.com/develop/connectivity/telecom/selfManaged].
- **[CONFIRMADO]** A mesma página exige que o `CallsManager` rode em um `Service` em primeiro plano com `android:foregroundServiceType="phoneCall"`. Exige uma notificação `NotificationCompat.CallStyle` publicada em até 5 segundos após adicionar a chamada, e `startForeground(..., FOREGROUND_SERVICE_TYPE_PHONE_CALL)` [fonte: mesma página].
- **[CONFIRMADO]** A mesma página orienta: não usar `AudioManager#setCommunicationDevice` nem `startBluetoothSco` quando o Telecom gerencia a chamada, porque causa problemas de áudio; o stream deve ser `STREAM_VOICE_CALL` [fonte: mesma página].
- **[CONFIRMADO]** Callbacks remotos da Core-Telecom (`onAnswerCall`, `onSetCallActive` etc.) devem terminar em até 5 segundos [fonte: mesma página].
- **[SECUNDÁRIO]** A referência de `ConnectionService`, `addNewIncomingCall` e `PROPERTY_SELF_MANAGED` existe em `developer.android.com/reference/android/telecom/`. Trechos de busca indicam que, quando a chamada não pode ser atendida, o app não deve postar notificação de chamada própria. **[A VERIFICAR]** a leitura integral dessas referências nesta pesquisa não foi concluída; a página veio truncada.

### 3.4 Serviços em primeiro plano

- **[CONFIRMADO]** A partir do Android 14, todo serviço em primeiro plano precisa declarar tipo. Dois tipos relevantes:
  - `microphone`: exige `FOREGROUND_SERVICE_MICROPHONE` e `RECORD_AUDIO` concedido.
  - `phoneCall`: exige `FOREGROUND_SERVICE_PHONE_CALL` e (`MANAGE_OWN_CALLS` no manifesto **ou** papel `ROLE_DIALER`).
  - Tipo ausente → `MissingForegroundServiceTypeException`. Permissão do tipo ausente → `SecurityException`. Pré-requisito ausente → `SecurityException` [fonte: https://developer.android.com/about/versions/14/changes/fgs-types-required].
- **[CONFIRMADO]** Iniciar serviço em primeiro plano em segundo plano é restrito a partir do Android 12 (API 31): gera `ForegroundServiceStartNotAllowedException`. Exceções incluem: transição a partir de estado visível; interação do usuário com notificação, bubble ou widget; mensagem FCM de prioridade alta; roles de sistema; usuário desativar otimização de bateria [fonte: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start].
- **[CONFIRMADO]** No Android 14 ou superior, serviço em primeiro plano que precisa de microfone **não pode ser criado a partir do segundo plano**, mesmo com exceção, e lança `SecurityException`. Para evitar, iniciar o serviço com activity visível [mesma fonte].

## 4. Arquitetura do serviço de chamadas

```
Activity / Compose UI (Kotlin)
   │  estado e comandos
   ▼
CallCoordinator (Kotlin, único dono do estado de chamadas)
   │                    ▲ eventos (Flow)
   ▼                    │
SipForegroundService (phoneCall + microphone)  ──── Telecom (Core-Telecom)
   │  JNI (chamadas síncronas em fila)                 │ estado da chamada/rota
   ▼                                                  ▼
SipEngine (Kotlin) ──► libeasyphone_sip.so ──► thread re_main() ──► libbaresip / libre
                                                        │
                                                        └─► áudio AAudio (driver aaudio) ↔ dispositivo
```

### 4.1 Serviço

- Um `Service` em primeiro plano hospeda o `SipEngine` e o `CallsManager`. Ele é o dono do ciclo de vida do motor.
- Tipos declarados no manifesto: `phoneCall` sempre; `microphone` somente enquanto houver chamada ativa ou atendimento em curso.
- Ativação: o serviço sobe quando o usuário faz a primeira ação visível (abrir o app, tocar em Ligar, ou tocar na notificação). Em segundo plano, **não** iniciar a partir de broadcast sem exceção confirmada (seção 3.4).
- Notificação permanente de conta registrada e notificação de chamada com `CallStyle`. Canal de notificação separado para chamada e para status de registro.
- O motor é encerrado quando o usuário desliga "manter registrado" e não há chamada. O `stop` faz `uareg 0` antes de liberar a biblioteca, equivalente ao `stop()` do desktop [LOCAL: `engine/README.md`, "Ciclo de vida"].

### 4.2 Ordem de desligamento

Os mesmos três passos do desktop, adaptados: desregistrar contas → encerrar chamadas → parar `re_main` e liberar memória → liberar o serviço. Cada passo tem timeout. Se o timeout estourar, o estado vai para `error` e a UI avisa.

## 5. Chamadas recebidas em segundo plano

Esta é a parte de maior risco funcional. Duas estratégias:

| Estratégia | Como funciona | Prós | Contras |
|---|---|---|---|
| **S1. Registro persistente no serviço em primeiro plano** | O serviço `phoneCall` mantém o REGISTER ativo com o app fechado para a tela. A chamada chega pelo socket SIP e o Telecom mostra a tela de chamada. | Sem infraestrutura nova. Não depende de push. | Consome bateria. Doze e otimização de bateria podem atrasar keepalive. Mudança de rede (Wi-Fi/4G) exige novo REGISTER [A VERIFICAR: comportamento do Baresip nessa troca]. |
| **S2. Push de alta prioridade (FCM) + Telecom** | Um servidor de push acorda o app quando há chamada, e o app reporta a chamada ao Telecom. | Economia de bateria. Funciona com o app totalmente fechado. | Exige gateway de push que não existe no projeto. Exige o PBX enviar o aviso (ou um proxy). Mensagens FCM de prioridade alta são o caminho de exceção para iniciar serviço [CONFIRMADO]. |

**Decisão para o beta:** S1 como caminho obrigatório. S2 fica fora do beta e vira milestone posterior, com decisão de infraestrutura registrada. Antes de S2, o fluxo "tela de chamada com app fechado" precisa de prova em aparelho real (ver roteiro, M7).

Regras de chamada recebida:

- O aviso de chamada passa pelo Telecom, não por notificação própria, quando o Telecom estiver ativo. A alternativa é a notificação com `CallStyle` e tela cheia, que depende de permissão e de política de tela cheia do Android 14 em diante [A VERIFICAR: `USE_FULL_SCREEN_INTENT` e sua concessão].
- Se já houver chamada viva, a segunda entrante é recusada com 486, igual ao desktop, e o usuário é avisado [LOCAL: `engine/README.md`]. Isso deve ser confirmado no Android para evitar que o Telecom mostre duas telas.
- O ring tone usa `ring_aufile` com o WAV do easyphone [LOCAL: `engine/baresip-config.cjs:61`]. No Android, o toque deve tocar pelo stream de toque ou pelo Telecom, nunca pelo stream de voz.

## 6. Permissões e microfone

Permissões e o motivo de cada uma:

| Permissão | Quando pedir | Motivo | Status |
|---|---|---|---|
| `RECORD_AUDIO` | Na primeira chamada ou no primeiro uso do microfone, com explicação na UI | Áudio da chamada | Runtime. Obrigatória para `microphone` [CONFIRMADO] |
| `POST_NOTIFICATIONS` | Ao ativar "manter registrado" ou na primeira chamada | Notificação do serviço e de chamada no Android 13 ou superior | Runtime [A VERIFICAR: requisito de API nesta pesquisa não lido na fonte] |
| `FOREGROUND_SERVICE` | Manifesto | Base dos serviços em primeiro plano | Manifesto [CONFIRMADO] |
| `FOREGROUND_SERVICE_MICROPHONE` | Manifesto | Tipo `microphone` | Normal, concedida por padrão [CONFIRMADO] |
| `FOREGROUND_SERVICE_PHONE_CALL` | Manifesto | Tipo `phoneCall` | Normal, concedida por padrão [CONFIRMADO] |
| `MANAGE_OWN_CALLS` | Manifesto | Telecom self-managed (Core-Telecom) | Manifesto [CONFIRMADO] |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Manifesto | SIP e detecção de rede | Normal [A VERIFICAR: nome exato se for só lista de nomes] |
| `BLUETOOTH_CONNECT` | Se houver rota Bluetooth | Headsets no Android 12 ou superior | Runtime [A VERIFICAR] |
| `USE_FULL_SCREEN_INTENT` | Só se o toque de chamada for por notificação | Tela de chamada com a tela bloqueada | Política restrita no Android 14 ou superior [A VERIFICAR] |

Regras de UX:

- Sem `RECORD_AUDIO`, a chamada não é atendida. A UI diz o motivo e oferece abrir as configurações. Nada de tela em branco ou falha silenciosa.
- Se o usuário negar "para sempre", a UI mostra o caminho para Configurações do app.
- Permissões são pedidas no momento da ação, nunca na abertura do app sem contexto.

## 7. Áudio

- **Driver:** `aaudio` do upstream, com fallback para `opensles` se AAudio falhar em algum aparelho. Ambos existem no upstream [CONFIRMADO: `modules/aaudio`, README]. Escolha final por teste em aparelho (M4).
- **Rota e modo:** o áudio de chamada usa `STREAM_VOICE_CALL` e modo de comunicação. Alterar rota (alto-falante, fone, Bluetooth) passa pelo Telecom, não por `setCommunicationDevice` [CONFIRMADO, seção 3.3].
- **Foco de áudio:** tratado pelo Telecom. A pesquisa não encontrou a regra detalhada de foco na fonte lida [A VERIFICAR]. O teste de M4 precisa cobrir: outra app tocando música, alarme, chamada de operadora.
- **Dispositivo:** o desktop usa `default` e não enumera dispositivos [LOCAL: `contracts/phone-bridge.d.ts`, `engine/README.md`]. No Android, a seleção de rota é do Telecom; o contrato de dispositivos é só lógico (alto-falante, fone, Bluetooth, padrão).
- **Ponto de atenção:** há duas camadas que querem o áudio (Baresip via AAudio e Telecom). O risco é a rota ser decidida por um e não pelo outro. A regra do projeto: o Telecom decide a rota; o Baresip só recebe a mudança de dispositivo. Isso precisa de prova em aparelho.
- **Eco e ganho:** o Baresip tem módulos de eco e ganho no upstream [LOCAL: `packaging/scripts/build-baresip-isolated.sh`, lista inclui `augain`; eco não listado] — a escolha de eco (AEC do Android ou do Baresip) fica em aberto e precisa de teste.

## 8. Armazenamento seguro de credenciais SIP

- **Chave:** gerada no Android Keystore com `AndroidKeyStore`, AES-GCM, não exportável. Usar StrongBox quando `FEATURE_STRONGBOX_KEYSTORE` existir; senão, TEE. O app verifica o nível real com `KeyInfo.getSecurityLevel()` (API 29+) [CONFIRMADO: https://developer.android.com/privacy-and-security/keystore].
- **Armazenamento:** a senha cifrada vai para o diretório privado do app, com `android:allowBackup="false"` ou regras de backup que excluam esse arquivo. Não guardar em `SharedPreferences` em texto.
- **Mesmo princípio do desktop:** a senha nunca vai para arquivo de configuração do Baresip nem para log, e não aparece no snapshot de estado [LOCAL: `engine/README.md`, "Segredos"].
- **Uso:** a senha é decifrada só no momento de registrar a conta e passada ao libbaresip pela API nativa. Se a API nativa ainda exigir a string `uanew` com `auth_pass`, a regra de caracteres proibidos do desktop vale aqui também (`PASSWORD_RE`, [LOCAL: `engine/validation.cjs:10-11`]). Essa restrição é um defeito de projeto a eliminar, não aceitar como permanente. **[A VERIFICAR]** a API do libbaresip 4.12 para autenticação sem string.
- **Biblioteca de criptografia:** não adotar `EncryptedSharedPreferences` sem verificar o estado atual de `androidx.security:security-crypto`. Esta pesquisa **não confirmou** se o pacote está depreciado. Usar a API do Keystore diretamente é o caminho base.
- **Logs:** a saída nativa do libre/baresip passa por filtro antes de `Log.d`. Nenhum log de release contém senha, digest ou cabeçalho `Authorization` [A VERIFICAR: ajuste de nível de log no Baresip].

## 9. Codecs e transporte

| Item | Decisão | Status |
|---|---|---|
| **G.711 (PCMU/PCMA)** | Obrigatório. Compatível com o desktop e com PBX | Baresip `g711` [LOCAL: `baresip-config.cjs:41`] |
| **Opus** | Recomendado para mobile (banda larga, perda de pacote). Compilar libopus para ARM | Suportado upstream [CONFIRMADO: README do Baresip]; licença Opus BSD-3 [CONFIRMADO: https://github.com/xiph/opus/blob/main/COPYING], com patentes royalty-free por declaração [CONFIRMADO no mesmo arquivo] |
| **Ordem de codecs** | Opus, depois PCMU, depois PCMA. Negociação conforme o PBX | A confirmar com o FreePBX de laboratório [A VERIFICAR] |
| **Transporte SIP** | UDP, TCP e TLS. WS/WSS desligados | Igual ao desktop [LOCAL: `baresip-config.cjs:51`] |
| **TLS** | Verificação de certificado obrigatória. Sem CA válida a conexão falha | No Android, o caminho de CA é diferente do desktop (`/etc/ssl/certs`). Definir se usa CA do sistema ou CA empacotada [A VERIFICAR] |
| **SRTP** | Só se o PBX exigir; é suportado pelo Baresip | [CONFIRMADO: upstream lista SRTP]. Habilitar só por config do PBX [A VERIFICAR] |
| **RTP** | Faixa de portas fixa (`rtp_ports`) pode não funcionar em rede móvel com NAT. Definir política | [A VERIFICAR] |
| **Expiração do REGISTER** | Configurável por conta. Padrão 300 s no desktop; no mobile, escolher valor maior para economizar bateria, respeitando o PBX | Decisão aberta (F-P1-03 do desktop) [LOCAL: `engine/README.md`] |

## 10. Licenças

| Componente | Licença | Fonte | Status |
|---|---|---|---|
| Baresip | BSD-3-Clause | [CONFIRMADO] baresip/LICENSE | Obrigações: manter aviso e texto de licença nos binários |
| libre (`re`) | BSD-3-Clause | [SECUNDÁRIO] Arch e Debian; [A VERIFICAR] no arquivo LICENSE do `baresip/re` | Verificar antes de distribuir |
| Módulos Baresip | Maioria BSD-3; exceções pontuais | [SECUNDÁRIO] listagem Debian; `ctrl_tcp` tem trecho de domínio público | Auditar os módulos incluídos no build Android. `ctrl_tcp` **não** entra no Android |
| Opus | BSD-3-Clause | [CONFIRMADO] COPYING | — |
| OpenSSL | Apache-2.0 (3.x) | [A VERIFICAR] | Ler a versão fixada |
| Android NDK, AndroidX, Core-Telecom | Apache-2.0 | [A VERIFICAR] | Ler os LICENSE dos artefatos |
| Electron, wxWidgets | não se aplicam ao Android | — | — |

Obrigações práticas:

- Gerar um arquivo `THIRD-PARTY-NOTICES` com os textos de licença de cada binário `.so` distribuído e exibi-lo no app (tela "Sobre" → "Licenças de código aberto").
- Não usar nomes dos autores (Baresip Foundation, Creytiv) para endossar o produto.
- Manter o script de build que gera a lista de componentes, para que a lista não dependa de memória.

## 11. Incompatibilidades do engine desktop com o Android

A tabela abaixo lista o que **não pode ser copiado** do desktop sem mudança. Todos os itens são de código, com linha de referência.

| # | Engine desktop | Problema no Android | Ação no Android |
|---|---|---|---|
| I-1 | `ctrl_tcp` em `127.0.0.1` sem autenticação (`baresip-config.cjs:47-49`) | Porta de loopback sem autenticação; qualquer processo que descubra a porta pode conectar-se. Isolamento entre apps Android nessa porta não foi verificado | Não usar `ctrl_tcp`. Chamada direta por JNI |
| I-2 | Supervisor cria processo filho (`process-supervisor.cjs:92`) | Modelo de processo filho não serve a apps Android modernos (verificar) | Engine in-process |
| I-3 | `sip_listen <IP>:0` com IPv4 escolhido por `os.networkInterfaces()` (`baresip-config.cjs:12-20`, `:54`) | Android muda de rede (Wi-Fi, dados, VPN). IP escolhido na subida fica obsoleto | Recalcular escuta e re-registrar em mudança de rede. Testar IPv6 [A VERIFICAR] |
| I-4 | `sip_cafile /etc/ssl/certs/...` (`baresip-config.cjs:62`) | Caminho não existe no Android | CA empacotada ou do sistema, a decidir (seção 9) |
| I-5 | `audio_player pulse,default` (`baresip-config.cjs:57`) | Driver pulse não existe no Android | `aaudio` ou `opensles` (seção 7) |
| I-6 | `ring_aufile` com WAV próprio (`baresip-config.cjs:61`) | Toque deve seguir o stream e a política do Telecom | Tocar pelo Telecom ou pelo stream de toque |
| I-7 | Senha na string `uanew`, com caracteres proibidos (`validation.cjs:10-11`, `phone-engine.cjs:377`) | Restrição de caracteres vem de limitação do parser de string | Investigar API nativa sem string (seção 8) |
| I-8 | Uma chamada por vez; segunda recebida recebe 486 (`phone-engine.cjs:623-641`) | Telecom pode exibir duas telas antes do 486 | Confirmar ordem de eventos em M4 |
| I-9 | Só G.711 (`baresip-config.cjs:41`) | Qualidade e banda em rede móvel | Acrescentar Opus (seção 9) |
| I-10 | `regint` fixo em 300 s (`phone-engine.cjs:377`) | Consumo de bateria e doze | Configurável por conta |
| I-11 | Sem reconexão com backoff (F-P2-01, `engine/README.md`) | Rede móvel cai com frequência | Implementar retry e estado "tentando de novo" |
| I-12 | Códigos SIP 486, 603 e 408 não mapeados (`engine/README.md`, F-20) | Motivo de encerramento aparece genérico | Mapear no wrapper nativo |
| I-13 | `removeAccount` depende de ordem `uareg 0` → `uadel` com AOR sem porta (`engine/README.md`, "Pendências") | Formato do AOR não verificado com Baresip real | Testar com o Baresip nativo antes de usar |
| I-14 | Contatos e histórico não existem no contrato (F-P1-01, `contracts/phone-bridge.d.ts`) | Mesma lacuna no Android | Definir contrato compartilhado antes de implementar |
| I-15 | `safeStorage` do Electron (`electron/main.cjs:42-65`) | API exclusiva do Electron | Android Keystore (seção 8) |
| I-16 | Bandeja do sistema (`electron/main.cjs:552-573`) | Não existe no Android | Notificação do serviço |
| I-17 | Nenhum teste em aparelho ou com Baresip real (`engine/README.md`, "Pendente") | O desktop tem 17 testes com `fake-baresip`, sem prova de RTP nem áudio | No Android, M3 e M4 exigem prova em aparelho e em PBX de laboratório |

**Reuso que vale a pena:** o contrato `PhoneBridge` (`contracts/phone-bridge.d.ts`), a validação de entrada (`validation.cjs`) e os testes de contrato do motor. A lógica de estado de chamada (`phone-engine.cjs`, limpeza de `FINAL_CALL_STATES`) deve ser portada, não reescrita do zero.

## 12. Pontos de atenção que bloqueiam o beta

1. **Telecom versus Baresip na rota de áudio** — decidir quem manda (seção 7).
2. **Atendimento com app fechado** — S1 ou S2 (seção 5). Sem prova em aparelho, o beta fica limitado a app em primeiro plano ou em segundo plano recente.
3. **Autenticação sem string** no libbaresip 4.12 — investigar (seção 8).
4. **TLS com CA no Android** — decidir (seção 9).
5. **Build reproduzível do NDK** — escolher versão do NDK, ABI e pinagem de commit. Hoje não há script equivalente ao `build-baresip-isolated.sh` para Android [LOCAL].

## 13. Consequências

- Engine embutido: o app cresce pelo tamanho das bibliotecas nativas (Opus, libre, Baresip). Medir na M1.
- O código C do Baresip passa a ser compilado pelo NDK, em ABIs `arm64-v8a` e `x86_64` (emulador). `armeabi-v7a` fica fora, por decisão a tomar.
- Qualquer mudança de versão do Baresip exige rever esta lista de incompatibilidades.
- Desktop e Android compartilham o contrato, não o código de processo. Mudanças no contrato precisam de revisão nos dois lados.

## 13-A. Identidade visual no Android

Inspeção de `phone-desktop/branding/easyphone/` (somente leitura):

- **Tokens** em `design-tokens.json`: cor de marca `#38F094`, fundo `#202225`, superfície `#2C3034`, texto `#F0F1EE`, perigo `#C83847`, texto sobre marca `#102A1C`; espaçamentos 4 a 32 px; raios 6, 8 e 12 px; alturas de controle 32, 40 e 50 px; foco de 2 px na cor de marca. Os tokens são lógicos, pensados para desktop [LOCAL].
- **Tipografia:** o guia manda usar fontes do sistema e não redistribuir fontes proprietárias. No Android, a fonte padrão do sistema deve ser usada. Nome exato da família padrão e comportamento por versão: [A VERIFICAR].
- **Logotipo:** SVG vetorizado em `easyphone-horizontal-negativo*.svg`. Não reconstruir o nome digitando texto [LOCAL: `IMPLEMENTACAO.md`].
- **Ícone do app:** `easyphone-app.svg` é a fonte. Os `.ico` e `.icns` são só de desktop. No Android, o ícone adaptativo precisa de camada de primeiro plano e de fundo; essa conversão não existe no repositório e entra em M5.
- **Ícone de notificação:** o Android exige ícone monocromático (uma cor, fundo transparente). O símbolo colorido de `ui/assets/easyphone-icon.png` não serve; é preciso uma versão monocromática derivada da marca [A VERIFICAR: requisito de API na documentação oficial].
- **Toque de chamada:** `ui/assets/easyphone-ring.wav` pode ser reutilizado se a licença do asset permitir. A licença não está declarada no repositório [LOCAL]. Antes de distribuir, confirmar.
- **Modo compacto e normal:** o guia tem medidas de referência para janelas de 360 px de largura. No Android, a navegação por telas substitui as janelas, mas a largura de 360 px serve de piso de layout. Não copiar a barra lateral; usar navegação por abas ou barra inferior.
- **Regra do guia:** nunca mostrar dados ilustrativos do mockup como dados reais. O estado vazio de histórico e de contatos deve ser honesto. Vale para o Android também.
- **Regra do guia para chamadas:** transferência só mostra sucesso após confirmação do mecanismo de telefonia. O mesmo vale para o Android (ver ADR-ANDROID-SIP, seção 4).

## 14. Fontes primárias

- Baresip, repositório e licença: https://github.com/baresip/baresip
- Baresip, módulo AAudio: https://github.com/baresip/baresip/tree/main/modules/aaudio
- Baresip, LICENSE: https://raw.githubusercontent.com/baresip/baresip/main/LICENSE
- Baresip Android, guia antigo: https://github.com/baresip/baresip-android
- Baresip Studio (referência): https://github.com/juha-h/baresip-studio
- Discussão sobre build Android: https://github.com/baresip/baresip/discussions/2672
- Android, tipos de serviço em primeiro plano (Android 14): https://developer.android.com/about/versions/14/changes/fgs-types-required
- Android, restrições de início em segundo plano: https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- Android, Core-Telecom para chamadas self-managed: https://developer.android.com/develop/connectivity/telecom/selfManaged
- Android, referência ConnectionService: https://developer.android.com/reference/android/telecom/ConnectionService (lida parcialmente)
- Android, Keystore: https://developer.android.com/privacy-and-security/keystore
- Opus, COPYING: https://github.com/xiph/opus/blob/main/COPYING
- baresip_flutter (terceiro, minSdk 29): https://pub.dev/packages/baresip_flutter/changelog

## 15. Lacunas da pesquisa

Não foi possível, nesta rodada:

- Ler integralmente as referências `PhoneAccount`, `TelecomManager.addNewIncomingCall` e `Connection.PROPERTY_SELF_MANAGED`. As páginas vieram truncadas.
- Confirmar a licença de `libre` e de OpenSSL na versão fixada.
- Confirmar o comportamento do Baresip 4.12 em troca de rede e em `auth` sem string.
- Confirmar a exigência atual de `targetSdk` para publicação.

Essas lacunas estão no roteiro como itens de M0.
