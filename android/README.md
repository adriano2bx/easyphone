# easyphone Android

Projeto Android nativo em Kotlin e Jetpack Compose. A interface adapta a identidade do easyphone para toque e telas menores; não usa WebView nem o executável Electron do desktop.

## Estado atual

Esta é a primeira base de interface e arquitetura. Inclui discador, navegação para Contatos, Recentes e Configurações, estados de chamada e o contrato `SipRepository`.

O mecanismo SIP Android ainda não está integrado. A implementação atual (`UnavailableSipRepository`) mantém registro, discagem e controles indisponíveis de forma explícita. Não há chamadas simuladas. Contatos e histórico também aguardam armazenamento e integração.

A decisão proposta para a telefonia é compilar libbaresip com Android NDK e expor uma API nativa estreita por JNI, integrada ao framework Telecom. Consulte [`docs/ADR-ANDROID-SIP.md`](docs/ADR-ANDROID-SIP.md) e [`docs/ANDROID-ROADMAP.md`](docs/ANDROID-ROADMAP.md) antes de implementar o motor.

## Ambiente de build

O projeto requer JDK 17+ e Android SDK com API 36. O Gradle Wrapper 9.1.0 e seu checksum estão versionados; não é necessário instalar Gradle globalmente. Neste computador, o toolchain fica em `~/.local/share`; carregue as variáveis locais e compile:

```sh
source ~/.local/share/easyphone-android-toolchain/env.sh
cd android
./gradlew :app:assembleDebug
```

O Gradle JDK do Android Studio deve apontar para JDK 17. O build `:app:assembleDebug` foi concluído com sucesso neste computador. O APK de depuração fica em `app/build/outputs/apk/debug/app-debug.apk` (cerca de 59 MB); ele é gerado localmente e não é versionado. Ainda não foi aberto em emulador ou aparelho. O workflow do GitHub Actions compila o APK em cada push e pull request e publica o arquivo como artefato da execução.

## Próximos marcos

1. Fechar as decisões M0 do roteiro e validar a interface em emulador ou aparelho.
2. Compilar libbaresip para `arm64-v8a` e `x86_64` e criar a ponte JNI.
3. Integrar conta SIP, áudio, chamadas e ciclo de vida via Telecom.
4. Validar chamadas reais em aparelhos e PBX de laboratório antes de distribuir APK.
