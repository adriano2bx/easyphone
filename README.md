# Easyphone

Softphone SIP de desktop, independente do console de atendimento.

## Baixar e instalar no Linux

Os instaladores publicados ficam em [Releases](https://github.com/adriano2bx/easyphone/releases). No Linux x86_64, baixe o `.deb` e instale com `sudo apt install ./easyphone_VERSION_amd64.deb`, ou baixe o `.tar.gz`, extraia e execute `./easyphone/INSTALL-LOCAL.sh`. A instalação portátil não precisa de root.

O instalador cria a entrada **Easyphone** no menu de aplicativos e um atalho na área de trabalho, quando ela existe. Para adicionar ao painel do KDE, abra o aplicativo, clique com o botão direito no ícone do Easyphone no Gerenciador de Tarefas e escolha **Fixar no Gerenciador de Tarefas**. O KDE não oferece uma forma portátil e confiável de fixar automaticamente um aplicativo no painel.

O ícone da bandeja fica disponível enquanto o processo está ativo. Minimizar ou fechar a janela oculta o aplicativo; clique no ícone para reabrir. Use **Sair do Easyphone** no menu da bandeja para encerrar também o registro SIP. A disponibilidade da bandeja depende do ambiente de desktop e do suporte a ícones de status.

Para remover a instalação portátil, execute `~/.local/opt/easyphone/UNINSTALL-LOCAL.sh`. Contas e preferências em `~/.config/Easyphone` são preservadas. O pacote `.deb` pode ser removido com `sudo apt remove easyphone`.

Atualmente os artefatos publicados são para Linux x86_64. Windows e macOS precisam de builds próprios e ainda não estão prontos para distribuição.

## Interface nativa wxWidgets

A interface operacional atual está em [`native-wx/`](native-wx/README.md). wxWidgets controla a tela; Electron mantém o cofre e o ciclo de vida; Baresip executa SIP convencional por uma ponte local.

## Requisitos de produto

- SIP convencional por UDP/TCP/TLS; **não usar WebSocket para sinalização SIP**.
- Baresip como motor de telefonia; sinalização SIP convencional, sem WebSocket.
- Alvos desktop: Linux, Windows e macOS.
- Identidade visual Easyphone: logo próprio, grafite, branco e verde contido; sem gradientes decorativos, chips redundantes, ondas falsas ou ilustrações genéricas.
- Janela de softphone compacta e redimensionável, com modos Normal e Compacto. O modo compacto preserva estado da conta e controles indispensáveis durante chamadas.
- Cadastro de conta SIP; chamadas recebidas e realizadas; keypad DTMF; mute, espera/retomada, transferência, contatos, histórico e seleção de áudio.
- Senhas protegidas por cofre do sistema. O renderer não recebe acesso direto a Node, arquivos ou socket do Baresip.

## Fronteira entre UI e telefonia

O renderer consome somente `contracts/phone-bridge.d.ts`. A camada principal faz a ponte IPC validada; o motor Baresip fica em `engine/`. O controle do motor deve ser privado ao processo local e nunca escutar interfaces externas.

## Estado atual

- A UI nativa e a integração SIP estão em execução no Linux.
- O usuário confirmou validação de chamadas reais. Os sistemas, periféricos e cenários cobertos por essa validação não estão detalhados nos registros disponíveis.
- Windows e macOS ainda não têm builds ou validação registrados; o trabalho de paridade e distribuição está em andamento.
- O motor documenta suporte a uma chamada por vez e um canal local `ctrl_tcp` sem autenticação. Essas limitações precisam de decisão/correção antes da beta comercial.

## Marca personalizada (logo do cliente)

- **Escopo:** em Configurações → Marca, o cliente escolhe um logo próprio (**Alterar logo**) ou restaura o logo Easyphone (**Restaurar logo Easyphone**). O logo aparece no cabeçalho e na prévia; o modo compacto mantém a proporção (`object-fit: contain`).
- **Formatos e limite:** PNG, JPEG ou WebP, até 1 MiB. A validação acontece no processo principal (`electron/branding.cjs`) pela assinatura real do arquivo, não pela extensão. SVG, GIF e executáveis são recusados, mesmo com extensão `.png`/`.jpg`.
- **Armazenamento:** arquivo único `custom-logo.png|jpg|webp` dentro de `<userData>/branding/`, com permissão `600` no POSIX. `userData` é `~/.config/Easyphone` no Linux, `%APPDATA%\Easyphone` no Windows e `~/Library/Application Support/Easyphone` no macOS. Escrita atômica (temporário + rename). O reset remove apenas o arquivo de logo.
- **Local por instalação:** o logo não é enviado à rede, não é sincronizado entre máquinas nem tenants e não passa pelo motor SIP. Sincronização de branding, se for desejada, fica para outra versão.
- **Fronteira:** o renderer não recebe nem envia caminhos. A ponte `window.phoneBranding` (`getLogo`, `chooseLogo`, `resetLogo`) é só para a janela confiável e o diálogo nativo escolhe o arquivo. Nenhum acesso a `fs` ou Node.
- **Demo/harness:** sem `window.phoneBranding` (demo `renderer/demo` e `bridge-offline.js`), as ações ficam ocultas com a mensagem "disponível apenas no aplicativo instalado". Não há persistência de blobs no `localStorage`.
- **Limites conhecidos:** o contraste do logo sobre o fundo branco do cabeçalho é responsabilidade de quem envia o arquivo (a prévia mostra exatamente o resultado). A validação estrutural é de assinatura e tamanho; a decodificação final é checada pelo navegador antes de exibir, e uma imagem ilegível é descartada. Diálogo nativo e comportamento de arquivos variam entre Linux, Windows e macOS; o teste visual nesses sistemas ainda não foi feito.

Verificação visual e funcional deve ser feita no sistema em que o aplicativo será usado; consulte as notas de versão e a matriz de builds antes de distribuir para outros sistemas.

## Telas do operador

O Discador mostra só o status resumido da linha, a discagem e as ações da chamada. Seleção de conta de ligação, cadastro/remoção de contas (com transporte e proxy), Marca e dispositivos de áudio ficam em Configurações. Esta separação é apenas de telas: **não há controle de acesso** (senha, papel ou administrador). Quem tem acesso ao aplicativo ainda consegue abrir as Configurações.
