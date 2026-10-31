# Renderer do easyphone

Interface do softphone, consumindo somente o contrato `window.phone` de `../contracts/phone-bridge.d.ts`.

## Arquivos

| Caminho | Papel |
|---|---|
| `index.html` | Estrutura: barra de título, abas superiores (Discador, Recentes, Contatos, Configurações), painel de chamada e as telas. |
| `app.js` | Lógica do renderer. Estado vem só de `snapshot()` / `onSnapshot()`. Ações chamam a ponte e mostram o erro devolvido pelo motor. |
| `../ui/styles.css` | Estilos (tokens visuais do easyphone). |
| `../ui/bridge-offline.js` | Ponte de desenvolvimento. Só é instalada se `window.phone` não existir. |
| `../ui/qa-fixtures.js` | Fixtures de QA visual, separadas da ponte. Só declara dados em `window.EASYPHONE_QA`; a ponte as usa apenas com `?fixture=`. |
| `../ui/assets/easyphone-logo-negative.png` | Logo easyphone do kit de identidade. |
| `demo/main.cjs`, `demo/preload.cjs`, `demo/package.json` | Shell Electron de demonstração: abre a janela e expõe `phoneShell.setWindowMode`. Não é o processo principal. |
| `run-demo.sh` | Abre a janela demo com o runtime Electron já instalado localmente. |
| `../qa/capture.cjs`, `../qa/capture.sh` | Gera as capturas em `../qa/screenshots/`. |

## Como iniciar localmente

Usa o runtime Electron indicado por \`EASYPHONE_ELECTRON_HOME\`:

```sh
EASYPHONE_ELECTRON_HOME=/caminho/do/runtime sh phone-desktop/renderer/run-demo.sh
```

Sem argumentos, a janela abre no estado real atual: nenhuma conta, nenhuma chamada, nenhum contato.

Para regenerar as capturas Normal e Compacto:

```sh
sh phone-desktop/qa/capture.sh
```

## Modos de janela

- **Normal:** 380 × 680 lógicos, mínimo 340 × 560. Discador inicial. Abas superiores abaixo da marca (Discador, Recentes, Contatos, Configurações), em texto, com 36 px de altura e indicador teal na aba ativa. Não há barra inferior.
- **Compacto:** 380 × 184 lógicos, mínimo 340 × 160. Mostra estado da conta, chamada (nome/número, estado, timer real, mudo, espera, encerrar) e discagem simples. Sem abas: Configurações abre pelo atalho do modo normal.
- O modo é escolhido pelo botão da barra superior e lembrado por `localStorage` (com try/catch). Alternar não altera estado SIP: o renderer só muda a apresentação e pede o redimensionamento via `phoneShell.setWindowMode`.
- Sem a ponte `phoneShell.setWindowMode` (fora da demo), o botão de modo compacto fica oculto e a janela usa só o modo normal. Assim não há layout compacto dentro de janela grande.
- No modo compacto, quando não há conta registrada, a linha de dica tem o atalho "Configurar", que abre Configurações no modo normal.
- Os tamanhos são escolhas de projeto. As medidas do Zoiper não foram observadas (ADR 0003).

## Movimento

- Microinterações de 120 ms (cor, borda e pressionamento) em botões, teclas, abas e ícones; 160 ms para troca de vista e entrada de painel ou de ações de chamada.
- Pulso discreto só enquanto a chamada está tocando (`data-call="incoming"`). Nada anima em repouso.
- `prefers-reduced-motion: reduce` remove animações e transições (regra no fim de `ui/styles.css`). Verificado em `qa/screenshots/normal-14-*` e `compact-03b-*` pela emulação do Chromium, em `metrics.json` (`motion`).
- Mudo e Espera: o pressionamento responde na hora (escala e cor em 120 ms), mas o estado trocado só aparece quando o motor confirma o snapshot. Não há troca otimista: o renderer não mostra um estado que o motor ainda não confirmou.

## Teclado: dois contextos, um componente

Há dois teclados numéricos porque servem a dois momentos distintos, mas usam o mesmo componente visual (`.key`):

- **Discador (antes da chamada):** fundo claro, letras do telefone (ABC, DEF...) sob os dígitos, para discar por nome ou número.
- **DTMF (durante a chamada):** mesma grade plana, sem letras, porque o destino já está estabelecido, sobre o grafite (dígitos brancos, ≈16:1). Serve para responder menus (URA).

Teclado em grade plana, sem cartão por tecla: sem caixa, sem raio e sem borda externa; só divisões finas de 1 px entre as teclas. No discador a grade cresce com a janela (até 80 px por tecla, com mínimo de 44 px de altura); no DTMF a altura é fixa em 48 px. A posição do dígito é a mesma nos dois. As letras ficam fora do fluxo, na base da tecla, então o dígito fica centralizado com ou sem letras (teclas 1, * e #). Medidas: `qa/screenshots/metrics.json` (`dialKeys`, `dtmfKeys`, `dialGeom`) e `qa/design-round-c4.md`.

## Chamada em modo normal

Durante a chamada, na aba Discador, a seleção de conta e o discador saem de cena e o painel de chamada ocupa a área restante: identificação e timer centralizados no espaço livre (com DTMF ou transferência abertos, sobem para o topo e o teclado fica logo abaixo), e Mudo, Espera, Teclado e Transferir em grade de 4 com "Encerrar" em largura total na base. Chamada recebida mostra Atender e Recusar na base. Em outras abas, o painel fica no topo, e o conteúdo da aba aparece abaixo. O modo compacto não muda (ver "Modos de janela").

## Limitações da ponte

- **Contrato sem modo de janela.** O `PhoneBridge` não tem método para redimensionar. A demo usa `window.phoneShell` (fora do contrato). O processo principal de produção precisa implementar a mesma troca de tamanho, ou o modo compacto muda só o layout interno.
- **Contatos e recentes não existem no contrato** (QA F-P1-01). As telas mostram estado vazio e não exibem exemplos.
- **Sem motor.** A ponte offline devolve snapshot vazio e rejeita todas as ações com "Motor de telefonia não conectado". Nada é enviado ao SIP.
- **Mudo:** o estado aparece em três sinais, em Normal e Compacto: cor (âmbar quando ligado), ícone (microfone cortado) e texto ("ativo" / "inativo"). `aria-pressed` leva o mesmo estado a leitores de tela.
- **Fixtures de QA** (`?fixture=registered|incoming|active-muted|active-unmuted|auth-failed`) existem só para capturas visuais. `active-muted` e `active-unmuted` são as duas chamadas ativas separadas, uma com Mudo ligado e outra com Mudo desligado. `active` foi removido: `?fixture=active` cai no estado vazio com a faixa de QA. Usam domínio `example.invalid` e nomes de teste ("Conta de teste", "Contato de teste"); a página mostra a faixa "Modo de QA" enquanto houver fixture. O título da janela só muda com fixture. Não são telefonia real. A demo aberta sem fixture não mostra nenhum deles.
- **Campos ausentes no snapshot:** porta, proxy e usuário de autenticação não voltam após salvar; a edição de conta existente não está implementada. Excluir conta pede confirmação em dois cliques.
- **Dispositivos de áudio** aparecem só se `snapshot().audioDevices` vier preenchido.
- **Timer** usa `startedAt` do snapshot (epoch em ms). Sem `startedAt`, mostra `--:--`.
- **DTMF** aceita só o que o teclado da chamada envia (`0-9 * #`).

## Segurança

- O renderer não usa `require`, Node, `ipcRenderer` cru, `innerHTML` com dados do motor, nem `style=`/handlers inline (CSP `script-src 'self'`, `style-src 'self'`).
- Senhas: o formulário envia a senha uma vez e a limpa após sucesso. Não há exibição de volta.
- Nenhuma referência a SIP.js, WebSocket ou `wss://` no renderer.
