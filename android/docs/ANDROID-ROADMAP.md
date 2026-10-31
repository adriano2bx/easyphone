# Roteiro Android — easyphone

- **Decisão de arquitetura:** [ADR-ANDROID-SIP.md](ADR-ANDROID-SIP.md)
- **Data:** 2026-10-31
- **Estado:** nenhum marco foi executado. Este roteiro define o que precisa acontecer e como provar que aconteceu.

## Regras deste roteiro

1. **Nenhum marco é "feito" sem evidência.** Evidência é um comando com saída registrada, um log de aparelho, uma captura de chamada ou um relatório de teste. Afirmação sem evidência não conta.
2. **Não usar o PBX de produção.** Os testes usam um FreePBX de laboratório, com ramais e fila próprios. O `operator-desktop` aponta para o PBX de produção e não serve de alvo de teste [LOCAL: `qa/QA_PLAN.md`, seção 2].
3. **Não usar credenciais reais em logs, capturas ou repositório.**
4. **Desktop intocado.** Nenhum marco altera `phone-desktop/` fora de `android/`. Mudanças em `contracts/` exigem decisão separada e revisão dos dois lados.
5. **Versões fixadas.** Baresip e libre no commit da 4.12.0 usado pelo desktop (ver ADR, seção 1). NDK, CMake e libopus fixados em script de build.

## Visão geral dos marcos

| Marco | Nome | Entrega principal | Depende de |
|---|---|---|---|
| M0 | Fundação e decisões abertas | Pontos do ADR fechados; ambiente de build definido | — |
| M1 | Build nativo reproduzível | `libeasyphone_sip.so` para `arm64-v8a` e `x86_64` | M0 |
| M2 | Ponte JNI e thread do motor | API nativa estreita, fila de comandos, eventos ao Kotlin | M1 |
| M3 | Registro SIP real | Conta registrada, UDP/TCP/TLS, falha de autenticação tratada | M2 |
| M4 | Chamada em primeiro plano com áudio | Discar, atender, recusar, encerrar, mudo, espera, DTMF, áudio nos dois sentidos | M3 |
| M5 | Serviço em primeiro plano e permissões | Serviço `phoneCall` + `microphone`, notificações, fluxo de permissões | M4 |
| M6 | Armazenamento seguro | Senha cifrada pelo Keystore, nunca em texto ou log | M3 |
| M7 | Chamada recebida em segundo plano | Atendimento com app fora da tela, pelo Telecom | M5 |
| M8 | Codecs, TLS e rede móvel | Opus, TLS com CA, troca de rede com re-registro | M4 |
| M9 | Licenças e distribuição | Lista de componentes, avisos no app, checagem de licença | M1 |
| M10 | Beta funcional | Aceite do conjunto, com matriz de aparelhos | M5–M9 |

---

## M0 — Fundação e decisões abertas

**Objetivo:** fechar as perguntas que bloqueiam o build e o desenho.

**Entregas**

- Decidir o caminho de áudio: quem decide a rota, Telecom ou Baresip (ADR §7).
- Decidir S1 (registro no serviço) ou S2 (push) para chamada recebida (ADR §5). Para o beta, o padrão é S1.
- Decidir a CA para TLS: sistema ou empacotada (ADR §9).
- Decidir `minSdk`, `targetSdk` e ABIs. Proposta: `minSdk` 29, `targetSdk` o mais recente exigido pela publicação, ABIs `arm64-v8a` e `x86_64`. Confirmar a exigência de `targetSdk` vigente na publicação.
- Ler na fonte primária o que ficou truncado na pesquisa: `PhoneAccount`, `TelecomManager.addNewIncomingCall`, `Connection.PROPERTY_SELF_MANAGED`, licença de `libre` e de OpenSSL.
- Descobrir se o libbaresip 4.12 aceita autenticação sem string `uanew` (ADR §8).
- Escolher a versão do NDK e do CMake e registrar no script de build.

**Aceite**

- Documento de decisões com cada item marcado como decidido, com data, responsável e link de fonte.
- Lista de versões fixadas (NDK, CMake, libopus, libre, Baresip, OpenSSL).

**Evidência:** atualização do ADR com as decisões e os links de fonte lidos.

---

## M1 — Build nativo reproduzível

**Objetivo:** compilar o motor para Android de forma repetível, a partir de um script, sem passos manuais.

**Entregas**

- Script de build equivalente a `phone-desktop/packaging/scripts/build-baresip-isolated.sh`, para Android. Baixa fontes em commit fixado, verifica o commit depois do checkout e não instala pacotes do sistema.
- Compilação de libre, libopus e Baresip 4.12 com os módulos da lista de M0, incluindo `aaudio`, `opensles`, `g711`, `auconv`, `auresamp`, `menu`, `account`, `stun`, `ice`, `turn`, `srtp`, `dtls_srtp`.
- Módulo `ctrl_tcp` **fora** da lista para Android.
- Saída: `libeasyphone_sip.so` por ABI, com lista de dependências dinâmicas.
- Relatório de tamanho por ABI.

**Aceite**

- Script roda do zero em máquina limpa, com comando documentado.
- `file` e `readelf -d` mostram ABI correta e dependências esperadas.
- Nenhum símbolo de `ctrl_tcp` no binário final.
- Tamanho por ABI registrado.

**Evidência:** log de build, saída de `readelf` e de `nm` filtrado por `ctrl_tcp`, tamanho por ABI.

---

## M2 — Ponte JNI e thread do motor

**Objetivo:** expor ao Kotlin uma API nativa pequena, com um único dono do loop SIP.

**Entregas**

- `SipEngine` em Kotlin com a mesma superfície lógica do `PhoneBridge` (`phone-desktop/contracts/phone-bridge.d.ts`), sem recursos de contatos e histórico até o contrato ser ampliado (ADR I-14).
- Thread nativo dono de `re_main()`. Comandos entram em fila e são executados nesse thread.
- Eventos voltam ao Kotlin por callback JNI com referência global. Sem chamada direta de outra thread.
- Parada limpa: `re_main` sai, memória é liberada, nenhuma referência JNI vaza.
- Testes de unidade para a fila e o parser de eventos, sem SIP real.

**Aceite**

- Ciclo `start → stop → start` 50 vezes sem crash e sem vazamento (medido com `dumpsys meminfo` antes e depois, com diferença registrada).
- Nenhuma chamada JNI em thread errada (verificado com `-Xcheck:jni` ou CheckJNI ligado no build de teste).
- Testes de unidade passam, com saída registrada.

**Evidência:** log do teste de ciclo, saída de CheckJNI, relatório de teste de unidade.

---

## M3 — Registro SIP real

**Objetivo:** provar que uma conta SIP registra no PBX de laboratório pelos três transportes.

**Entregas**

- Cadastro de conta (campos do contrato) com validação equivalente a `validation.cjs`.
- REGISTER via UDP, TCP e TLS.
- Estados `registering`, `registered`, `authentication-failed`, `error` mapeados a partir dos eventos nativos.
- Falha de autenticação e falha de rede tratadas separadamente.

**Aceite**

- No PBX de laboratório, a conta aparece como registrada nos três transportes, com captura de sinalização (`tcpdump` ou log do PBX).
- Senha errada → `authentication-failed` em até 10 s, sem repetir tentativa em loop.
- Queda de rede → estado de erro, e recuperação automática ao voltar a rede (M8 completa a parte de re-registro).
- Nenhuma senha aparece em log, em captura de sinalização redigida ou em arquivo do app.

**Evidência:** captura de sinalização anexada, log do PBX mostrando REGISTER 200 OK, registro de falha de autenticação.

---

## M4 — Chamada em primeiro plano com áudio

**Objetivo:** provar uma chamada completa, com áudio nos dois sentidos, com o app em primeiro plano.

**Entregas**

- Discar, atender, recusar (486 e 603), encerrar, mudo, espera e retomada, DTMF, transferência cega.
- Driver `aaudio` com fallback para `opensles`, escolhido por teste em aparelho.
- Segunda chamada entrante recusada com 486 e aviso na UI (ADR I-8).
- Mapeamento de código SIP para motivo de encerramento (ADR I-12).

**Aceite**

- Chamada ida e volta com áudio, em pelo menos dois aparelhos físicos com Android diferentes e um emulador.
- Mudo: o outro lado não ouve; ao desmutar, volta a ouvir.
- Espera: o outro lado ouve música de espera ou silêncio, conforme configuração do PBX.
- DTMF: dígitos chegam ao URA do PBX.
- Segunda chamada recebida: 486 enviado, aviso exibido, chamada original preservada.
- Chamada encerrada libera o estado para uma nova discagem sem reiniciar o app (regressão do QA-01 do desktop, ver `phone-desktop/qa/QA-RESULTS.md`).

**Evidência:** captura de sinalização, gravação de áudio curta de cada sentido (ou verificação de RTP), registro da matriz de testes por aparelho.

---

## M5 — Serviço em primeiro plano e permissões

**Objetivo:** a chamada sobrevive a troca de tela, rotação e bloqueio, e o usuário pode conceder as permissões sem confusão.

**Entregas**

- `SipForegroundService` com `foregroundServiceType` `phoneCall` no manifesto, e `microphone` apenas durante chamada.
- Notificação com `CallStyle` publicada em até 5 s após a chamada entrar no sistema.
- Canais de notificação: registro e chamada.
- Fluxo de permissão de `RECORD_AUDIO` e `POST_NOTIFICATIONS` com explicação e caminho para configurações quando negado.
- Tratamento de `SecurityException` e `ForegroundServiceStartNotAllowedException` com mensagem ao usuário.
- Marca no Android (ADR §13-A): tokens de `phone-desktop/branding/easyphone/design-tokens.json` traduzidos para tema Android; ícone adaptativo gerado a partir de `easyphone-app.svg`; ícone de notificação monocromático; licença do `easyphone-ring.wav` confirmada antes de distribuir.

**Aceite**

- Chamada ativa sobrevive a bloqueio de tela por 10 minutos.
- Chamada ativa sobrevive a rotação e a sair e voltar ao app.
- Sem `RECORD_AUDIO`: a chamada não é atendida e a UI mostra o motivo.
- Negação permanente: UI leva às configurações do app.
- Logcat sem `ForegroundServiceStartNotAllowedException` nem `MissingForegroundServiceTypeException` nos cenários testados, em Android 14 e Android 15 (ou os que estiverem disponíveis).

**Evidência:** logcat de cada cenário, captura de notificação, relatório de teste de permissão.

---

## M6 — Armazenamento seguro

**Objetivo:** senhas SIP protegidas pelo Keystore, sem vazamento em disco, log, backup ou snapshot.

**Entregas**

- Chave AES-GCM não exportável no `AndroidKeyStore`, StrongBox quando disponível, TEE como alternativa, com nível real verificado por `KeyInfo`.
- Senha cifrada no diretório privado do app. Backup excluído.
- Descriptografia só ao registrar conta; plaintext fora do heap pelo menor tempo possível.
- Caminho para remover conta: apaga o blob e a entrada, depois `uareg 0` e remoção do UA (ver ADR I-13 sobre o formato do AOR).
**Aceite**

- Busca por senha-canário no diretório de dados, em `adb backup` (quando permitido), em logs de release e em capturas de memória: nenhum achado.
- Remover a conta apaga o blob e desregistra no PBX.
- Trocar de aparelho ou restaurar backup não expõe a senha.

**Evidência:** relatório da busca por canário com comandos e saída, teste de remoção com captura de registro no PBX.

---

## M7 — Chamada recebida em segundo plano

**Objetivo:** o usuário atende uma chamada com o app fora da tela.

**Entregas**

- Caminho S1 (padrão): registro mantido pelo serviço `phoneCall`. Chamada entra, Telecom mostra tela de chamada, atendimento retoma o áudio.
- Integração com Core-Telecom (`androidx.core:core-telecom:1.0.0`, decisão de M0) ou `ConnectionService` direto, conforme o resultado de leitura da referência.
- Registro das decisões de rota de áudio (ADR §7).
- Documentação do comportamento com otimização de bateria ativa e desativada.
- Se S2 for escolhido, o marco vira planejamento separado. Não entra no beta.

**Aceite**

- Com a tela bloqueada e o app em segundo plano, chamada recebida mostra tela de chamada e toca em até 3 s do INVITE, em pelo menos dois aparelhos.
- Atender pela tela de chamada conecta áudio nos dois sentidos.
- Recusar pela tela de chamada envia 603 (ou 486, conforme decisão), e o PBX registra o encerramento.
- Com otimização de bateria ativa, o comportamento é documentado com a taxa de sucesso observada em 20 chamadas de teste.
- Chamada encerrada pelo PBX enquanto o app está em segundo plano remove a tela de chamada.

**Evidência:** vídeo ou captura de cada cenário, log de Telecom, registro das 20 chamadas de teste com horário de INVITE e de exibição.

---

## M8 — Codecs, TLS e rede móvel

**Objetivo:** qualidade e robustez em rede móvel e com TLS.

**Entregas**

- libopus compilado e habilitado; ordem de codecs Opus, PCMU, PCMA.
- TLS com verificação de certificado. Sem CA válida, falha fechada.
- Re-REGISTER após troca de rede (Wi-Fi para dados e o contrário).
- Reconexão com backoff e estado "tentando de novo" (ADR I-11).
- Expiração de REGISTER configurável por conta (ADR I-10).
- Política de RTP definida (ADR §9).

**Aceite**

- Chamada com Opus negociado, confirmada na sinalização (`a=rtpmap:... opus`).
- TLS com CA correta: registra. TLS com CA errada ou ausente: falha com erro claro.
- Troca de Wi-Fi para dados durante chamada de 2 minutos: chamada se mantém ou encerra com motivo, nunca trava.
- Queda de rede: estado de tentativa visível, retomada sem duplicar conta.

**Evidência:** captura de SDP, logs de TLS, teste de troca de rede com registro de horários.

---

## M9 — Licenças e distribuição

**Objetivo:** o pacote pode ser distribuído com as obrigações cumpridas.

**Entregas**

- Lista de componentes com versão, licença e fonte, gerada pelo script de build.
- `THIRD-PARTY-NOTICES` incluído no app e exibido na tela "Sobre".
- Verificação de que `ctrl_tcp` e módulos de licença incompatível não estão no binário.
- Conferência da licença de libre, OpenSSL, libopus e AndroidX (ADR §10).

**Aceite**

- Lista gerada automaticamente, sem edição manual.
- Todo `.so` distribuído aparece na lista com texto de licença.
- Tela "Sobre" mostra os avisos.

**Evidência:** arquivo de componentes gerado, saída do script, captura da tela "Sobre".

---

## M10 — Beta funcional

**Objetivo:** aceitar o aplicativo para uso de beta por usuários reais, dentro de limites declarados.

### Critérios de aceite do beta

Todos os itens abaixo precisam de evidência registrada. Quando um item não puder ser provado, o beta não é aceito, ou o limite é declarado no comunicado de beta.

| # | Critério | Evidência exigida |
|---|---|---|
| B-01 | Conta SIP registra em UDP, TCP e TLS no PBX de laboratório | Captura de sinalização e log do PBX (M3) |
| B-02 | Chamada de saída e de entrada com áudio nos dois sentidos, em primeiro plano | Captura e verificação de RTP (M4) |
| B-03 | Mudo, espera, retomada e DTMF funcionam | Teste por aparelho (M4) |
| B-04 | Segunda chamada recebida recebe 486 e avisa o usuário | Captura de sinalização (M4) |
| B-05 | Chamada sobrevive a bloqueio de tela por 10 min | Logcat e relatório (M5) |
| B-06 | Permissão de microfone é pedida com explicação e tratada quando negada | Teste manual com registro (M5) |
| B-07 | Chamada recebida com a tela bloqueada toca e atende, em pelo menos dois aparelhos | Vídeo e log Telecom (M7) |
| B-08 | Senha não aparece em disco, log ou backup | Relatório da busca por canário (M6) |
| B-09 | Opus negociado em pelo menos uma chamada de teste | Captura de SDP (M8) |
| B-10 | Troca de rede durante chamada não trava o app | Teste de rede com registro (M8) |
| B-11 | Licenças e avisos incluídos | Lista gerada e captura da tela Sobre (M9) |
| B-12 | Build reproduzível do zero por script | Log de build (M1) |

### Matriz mínima de aparelhos

| Aparelho | Versão Android | Papel no teste |
|---|---|---|
| Aparelho A (físico) | Android 14 | Principal |
| Aparelho B (físico) | Android 10 (minSdk) | Piso de compatibilidade |
| Aparelho C (físico, fabricante diferente) | Android 15 | Regressão de foreground service |
| Emulador x86_64 | Android 14 | Build e CheckJNI, sem áudio real |

**Observação:** esta matriz é proposta. Ela não foi executada. Se não houver aparelho físico disponível para algum item, o item fica "não validado" e o beta declara a limitação.

### Limites do beta (declarar no comunicado)

- Uma chamada por vez.
- Sem contatos nem histórico, até o contrato ser ampliado.
- Sem transferência assistida, apenas transferência cega.
- Chamada recebida em segundo plano depende de S1; sem push, pode haver atraso se o aparelho estiver em economia de bateria agressiva.
- Sem Bluetooth validado, a menos que B-03 e B-07 incluam esse caso.

### Não entra no beta

- Push (S2), vídeo, SRTP obrigatório, ZRTP, distribuição pela loja, iOS.

**Evidência final:** relatório único de aceite, com a tabela B-01 a B-12, cada linha apontando para a evidência correspondente, e os limites assinados pelo responsável.

---

## Riscos e o que destrava cada um

| Risco | Impacto | Destrava com |
|---|---|---|
| Telecom e Baresip disputam a rota de áudio | Áudio mudo ou rota errada | M0 (decisão) e M4/M7 (teste em aparelho) |
| Serviço em primeiro plano bloqueado em segundo plano | Chamada não toca | M5 (logcat), M7 (teste) |
| Baresip 4.12 sem API de auth sem string | Restrição de senha permanece | M0 (leitura do header) e M6 |
| TLS sem CA no Android | Registro impossível em TLS | M0 (decisão) e M8 |
| Build NDK sem versão fixada | Build não reproduzível | M1 |
| Documentação Android truncada na pesquisa | Decisão sobre `addNewIncomingCall` pode estar errada | M0 (leitura integral) |
| Sem aparelho físico disponível | Áudio e chamada em segundo plano não validados | Matriz mínima (M10) |
