# easyphone nativo — wxWidgets

easyphone usa os ativos e tokens do brand kit em `phone-desktop/branding/easyphone/`. A interface operacional usa controles nativos wxWidgets, sem HTML, CSS ou WebView. O processo principal Electron continua responsável pelo motor Baresip, pelo cofre cifrado de contas e pela bandeja. A UI nativa conversa com ele por linhas JSON em stdin/stdout; senhas de conta passam somente por esse pipe local e são persistidas pelo `safeStorage` do Electron.

## Estado

- Tela grafite/verde da direção Native Premium, com discador, recentes, painel de chamada e dois layouts compactos (discagem e chamada).
- Contas SIP: adicionar, selecionar, registrar, desregistrar e remover.
- Telefonia: chamadas recebidas e realizadas, atender, rejeitar, desligar, mudo, espera, DTMF e transferência.
- Áudio: seleção de microfone e saída PulseAudio/PipeWire, atualização de dispositivos e preferência salva por usuário; outros sistemas usam o dispositivo padrão até o enumerador nativo correspondente ser integrado.
- Fecha para a bandeja do processo principal; o menu da bandeja abre ou encerra o easyphone.
- Ícones lineares da navegação e dos controles são desenhados em memória com wxWidgets, em vez de depender de glyphs da fonte ou de rasterizações externas.
- O pacote Linux inclui executável wxWidgets e bibliotecas wx principais. GTK, `pactl` e integração de áudio continuam dependências do sistema.
- A integração foi compilada no ambiente Debian 13. O usuário confirmou que já validou chamadas reais; os sistemas, periféricos e fluxos cobertos não estão detalhados no registro. Builds e validação de Windows e macOS continuam pendentes.

## Compilar no Debian

Dependências: `build-essential`, `cmake`, `libwxgtk3.2-dev` e `nlohmann-json3-dev`.

```sh
cmake -S phone-desktop/native-wx -B phone-desktop/native-wx/build -DCMAKE_BUILD_TYPE=Release
cmake --build phone-desktop/native-wx/build
```

O empacotamento de produção usa `phone-desktop/packaging/build-linux-package.sh` e habilita a interface nativa no launcher.

## Portabilidade

wxWidgets oferece backends GTK no Linux, Win32 no Windows e Cocoa no macOS. O código da interface é compartilhado, mas cada alvo precisa de seu build, empacotamento, integração de áudio e adaptação do ciclo da bandeja/cofre. A versão atual comprova compilação Linux, não paridade multiplataforma.
