# Plataformas e distribuição

| Plataforma | Estado | Formato |
|---|---|---|
| Linux x86_64 | Empacotado para esta versão | `.tar.gz` portátil e `.deb` |
| Windows | Não preparado | Build, integração de áudio, instalador e validação pendentes |
| macOS | Não preparado | Build, integração de áudio, assinatura/notarização e validação pendentes |

O código da interface usa wxWidgets; o motor SIP é Baresip. O código compartilhado não substitui builds nativos: cada plataforma precisa de seus próprios binários, bibliotecas, integração de áudio e ciclo de bandeja. Não anuncie compatibilidade de um sistema operacional até publicar e validar seu pacote nele.

## Requisitos do pacote Linux

O empacotador `build-linux-package.sh` espera:

- runtime Electron Linux x86_64 em `EASYPHONE_ELECTRON_DIST`;
- Baresip e módulo PulseAudio no prefixo isolado `~/.cache/easyphone-build/prefix`;
- wxWidgets 3.2, compilador C++17 e bibliotecas de runtime identificadas pelo CMake da interface;
- `dpkg-deb` para gerar também o instalador Debian.

Use `packaging/scripts/build-baresip-isolated.sh` para construir o motor no prefixo privado. O processo não instala pacotes do sistema. O arquivo `.deb` requer privilégios para instalação; o `.tar.gz` usa instalação por usuário.

## Bandeja e inicialização

O processo cria um ícone de bandeja quando o ambiente desktop oferece suporte. Minimizar e fechar ocultam a janela; o menu da bandeja reabre o app ou encerra o processo e o registro SIP. A instalação não inicia automaticamente com a sessão do usuário. KDE, GNOME e outros ambientes têm políticas próprias para bandejas e fixação no painel; esses comportamentos precisam ser validados em cada desktop.

## Próximos alvos antes da distribuição comercial multiplataforma

1. Build e smoke funcional em Windows e macOS, incluindo SIP, áudio e bandeja.
2. Assinatura de código em Windows e assinatura/notarização em macOS.
3. Pipeline de CI por sistema e publicação de checksums dos artefatos.
4. Revisão das licenças do conjunto final de módulos Baresip incluídos no pacote.
