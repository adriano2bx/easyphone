# Brief visual — easyphone

## Referência de produto

Um telefone SIP de desktop compacto e confiável, semelhante em densidade e uso ao Zoiper, com identidade easyphone. É um softphone para discagem e chamadas; não é a tela de atendimento de call center e não inclui ficha de paciente, contexto de IA ou transcrição.

## Direção visual aprovada

- Usar o logo easyphone e a linguagem sóbria já aprovada como referência de contraste e acabamento.
- Superfícies claras, grafite discreto para a área de chamada, teal apenas como acento funcional, tipografia de sistema legível e divisores finos.
- Aparência de software comercial consolidado: alinhamento preciso, estados explícitos, botões com hierarquia, espaços consistentes e densidade adequada à janela pequena.
- Sem visual genérico de IA: não usar gradientes decorativos, glassmorphism, neon, sombras grandes, cartões arredondados em excesso, pílulas para cada estado, emojis, textos promocionais, imagens geradas ou formas abstratas.
- Não desenhar forma de onda ou nível de áudio sem sinal real; não mostrar dados, chamadas ou contatos inventados como se fossem reais.

## Presença de aplicativo nativo e efeitos

- A sensação deve ser de um cliente desktop instalado, não de uma página web encolhida: respeitar a moldura, controles e convenções do sistema operacional; navegação, foco por teclado e menus devem ter comportamento desktop.
- Usar movimento curto e controlado para transições entre vistas, pressionamento, hover/foco e mudança de estado de chamada. A animação deve explicar uma mudança real, ser rápida e respeitar `prefers-reduced-motion`.
- Dar presença à chamada com contraste, hierarquia e transições de estado bem compostas. Mudo, espera, registro e chamada tocando devem ter resposta visual imediata e distinguível.
- Evitar animação ambiente, brilho pulsante permanente, blur/transparência decorativos e waveform simulada. Efeito visual só entra quando comunica uma ação ou estado real.
- Manter feedback visual estável e legível em Linux, Windows e macOS; não depender de uma API exclusiva de um sistema para a identidade central.

## Modos de janela

- **Normal:** janela redimensionável, com discador como vista inicial e navegação para Contatos, Recentes e Configurações. Usar formato e densidade familiares a um softphone desktop compacto; persistir tamanho e posição permitida pelo sistema.
- **Compacto:** modo explicitamente alternável que reduz a janela para uma faixa pequena. Preservar estado/registro da conta; em chamada, preservar nome/número, estado, duração real, mute, espera/retomada e encerrar. Não sacrificar alvos clicáveis nem deixar a janela desaparecer atrás do sistema.
- Ao alternar durante uma chamada, manter o estado SIP e a sessão de áudio intocados. Restaurar o modo/tamanho anterior ao retornar.
- Medidas exatas do Zoiper não foram observadas; documentar a dimensão lógica escolhida e manter limites legíveis/responsivos.

## Estados e telas

1. **Sem conta:** chamada visualmente vazia e sóbria, orientação clara para adicionar conta SIP; nenhuma conta fictícia já registrada.
2. **Configuração:** nome, usuário SIP, usuário de autenticação opcional, domínio/registrar, porta, proxy opcional, transporte UDP/TCP/TLS e senha mascarada; estado real de validação/registro.
3. **Discador:** número/URI editável, teclado numérico e chamada pela conta selecionada.
4. **Chamada entrante:** identificação disponível, estado tocando e ações atender/recusar.
5. **Chamada ativa:** contato/número, timer real e controles essenciais (mudo, espera, teclado/DTMF, transferir, encerrar).
6. **Contatos e recentes:** conteúdo persistido ou obtido de fonte real; se ainda não conectado, mostrar estado vazio, nunca amostras fabricadas.

## Critérios de revisão visual

- Deve parecer um cliente VoIP comercial nativo e consistente com easyphone em janela pequena.
- Discagem é óbvia sem manual; estado de registro e estados da chamada são distintos e compreensíveis.
- Modo compacto é realmente mais baixo e continua útil durante uma chamada.
- Layout permanece funcional na menor dimensão suportada e com escala de tela ampliada.
- Nenhuma affordance decorativa promete operação que ainda não esteja conectada ao motor.

## Marca personalizada

- Seção **Marca** em Configurações, entre a conta SIP e o Áudio: prévia (logo easyphone ou logo do cliente), estado ("Usando o logo easyphone" / "Logo personalizado guardado neste dispositivo"), ações **Alterar logo** e **Restaurar logo easyphone** (desabilitada enquanto o logo easyphone estiver ativo).
- Texto de apoio fixo: PNG, JPEG ou WebP, até 1 MiB, guardado neste dispositivo, sem sincronização com outras instalações.
- No cabeçalho, o logo do cliente ocupa a mesma caixa do logo easyphone (110×20 px; 92×17 px no compacto) com `object-fit: contain`; o logo easyphone continua como fallback.
- Sem ponte de marca (demo/harness), as ações não aparecem e o texto informa que a personalização é do aplicativo instalado.

## Separação entre Discador e Configurações

- **Discador:** linha de status resumida ("Linha: <nome> · <estado>" ou "Linha não configurada."), teclado, número, **Ligar**, recentes/contatos e ações de chamada (atender, recusar, mudo, espera, teclado, transferir, encerrar). Sem seletor de conta e sem "Adicionar conta" na tela de operação.
- **Configurações:** seletor "Conta de ligação" (mesmo controle `account-select` de antes, agora no topo da aba Conta SIP), lista de contas com usar/registrar/remover, formulário de nova conta com transporte e proxy, Marca e dispositivos de áudio.
- No modo compacto a linha do Discador fica oculta para caber em 160 px; o estado da conta continua no cabeçalho. O modo compacto não oferece atalhos para alterações técnicas.
- **Limite desta versão:** é separação de telas para o operador não ver opções técnicas por acidente. **Não há controle de acesso** (senha, papel ou administrador); isso não foi especificado e não está implementado.
