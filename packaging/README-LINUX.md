# easyphone para Linux

Easyphone 0.4.0 para Linux amd64. A interface é wxWidgets nativa; Electron mantém Baresip, o cofre cifrado de contas e a bandeja. O pacote não inclui dados de conta nem senha. Windows e macOS ainda precisam de builds próprios.

## Instalação portátil por usuário

```sh
tar -xzf easyphone-linux-x86_64-v0.4.0.tar.gz
./easyphone/INSTALL-LOCAL.sh
```

Abra **Easyphone** pelo menu ou execute `~/.local/bin/easyphone`. Para atualizar, rode novamente `INSTALL-LOCAL.sh`. Contas e preferências ficam em `~/.config/Easyphone`.

Fechar a janela mantém o app na bandeja. Use o ícone para reabrir ou **Sair do easyphone** para desligar o motor SIP.

## Pacote Debian

```sh
sudo apt install ./easyphone_0.4.0_amd64.deb
```

No computador desta entrega, a conta SIP existente é reutilizada e o app tenta registrá-la ao iniciar. O pacote abriu a janela nativa; o registro no FreePBX e chamadas com áudio precisam de validação operacional após a atualização.
