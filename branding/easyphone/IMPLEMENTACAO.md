# easyphone - handoff de interface v1.0

## Fonte de verdade

- Logotipos e símbolo: SVG de `01-Logotipos` e `02-Simbolo`.
- Ícone do aplicativo: `03-Icones/easyphone-app.svg`.
- Cores, medidas e papéis semânticos: `design-tokens.json`.
- As imagens em `05-Aplicacao` são conceitos visuais de referência. Não são capturas de uma aplicação implementada; os contatos, números, horários e estados são ilustrativos.
- Este pacote entrega ativos e especificações visuais; não contém o código do softphone nem implementa SIP, histórico ou controles de chamada.

## Marca e arquitetura

Nome do produto: **easyphone**, sempre em minúsculas no logotipo. A identidade visual não inclui marcas ou endossos externos.

A proposta 03 / Conectado substitui o antigo símbolo de rede por decisão do cliente. A cor verde faz parte da identidade visual própria do produto. Nunca misturar os dois símbolos no mesmo produto.

## Tipografia

O wordmark foi vetorizado a partir do estudo escolhido. Não corresponde a uma fonte comercial identificada. Usar o SVG fornecido; não reconstruir digitando o nome. A assinatura também está em contornos.

Texto da interface: fontes do sistema, sem redistribuir arquivos proprietários. Windows: Segoe UI; macOS: fonte de sistema; Linux: Noto Sans ou DejaVu Sans. Usar números tabulares no cronômetro e nas durações quando a fonte suportar. Não forçar a fonte do wordmark em títulos e controles.

## Estrutura expandida

- Barra de título integrada: logotipo pequeno, controle de modo compacto e controles nativos da janela.
- Navegação lateral estreita: chamadas, contatos, recentes e configurações.
- Painel de discagem: seletor da conta SIP, estado real de registro, campo de número, teclado 3 x 4, ação Ligar e seletor de áudio.
- Histórico: lista de linhas compactas, grupos Hoje/Ontem, filtros Todas/Perdidas e ação de retorno.
- Rodapé: estado da telefonia e dispositivos de áudio.
- A ausência de histórico deve gerar um estado vazio honesto; nunca renderizar os dados ilustrativos do mockup como dados reais.

## Modo compacto

- Discagem: janela estreita, uma coluna, sem o painel de histórico ou a navegação lateral expandida.
- Durante chamada: contato/número, cronômetro, Mudo, Espera, Transferir, Teclado e Encerrar.
- Preservar chamada, conta selecionada e campo digitado ao alternar o tamanho da janela. Não recriar a sessão SIP ao trocar o modo visual.
- A janela menor de chamada é uma proposta de estado visual. Não redimensionar a janela abruptamente durante uso sem uma interação ou preferência explícita.
- Teclado DTMF deve abrir sem esconder Encerrar. Transferência deve pedir o destino e apresentar o resultado real; não indicar sucesso antes da confirmação do mecanismo de telefonia.

## Estados e comportamento

| Estado | Comunicação visual |
|---|---|
| Conectado | Ponto verde + texto Conectado |
| Conectando | Indicador de progresso discreto + Conectando |
| Desconectado | Ponto neutro + Desconectado; Ligar indisponível |
| Erro de registro | Mensagem curta com ação de correção; não expor senha |
| Discando | Número/contato + Discando; botão de cancelar |
| Chamando | Identificador + Chamando; Encerrar disponível |
| Em chamada | Cronômetro + indicação de áudio + controles |
| Em espera | Estado Em espera + controle para retomar |
| Microfone silenciado | Estado selecionado em Mudo + descrição acessível |
| Chamada encerrada | Retorno ao discador ou ao histórico; sem cronômetro ativo |

A interface deve refletir os eventos reais do mecanismo de chamada. Este guia não atesta que essas funções estejam implementadas no software atual.

## Escala e navegação

Dimensões do JSON são referências em pixels lógicos, não pixels das imagens. Validar 100%, 125%, 150% e 200%, foco por teclado, textos longos e nomes de contas maiores. A barra de título deve seguir o comportamento do sistema operacional.

Enter liga somente quando o campo de discagem está em contexto e a ação está habilitada. Escape fecha diálogos sem encerrar uma chamada em andamento. Foco visível com contorno de 2 px. Controles só com ícone precisam de nome acessível e dica. O status não pode depender apenas da cor.

## Cores e contraste

- Verde #38F094 para marca, ação principal e indicadores.
- Texto do botão verde: #102A1C.
- Texto comum: #F0F1EE sobre grafite #202225.
- Texto secundário: #A4ADB3.
- Encerrar: #C83847 com texto branco.
- Verde sobre fundo claro deve ficar restrito ao símbolo e a indicadores acompanhados de texto escuro; não usar como texto pequeno.
- Não adicionar gradientes, glow, azul de destaque, sombras metálicas ou avatares multicoloridos.

## Instalação de ícones

Windows: usar o .ico multirresolução; Linux: copiar os arquivos hicolor para a estrutura apropriada da distribuição/empacotador; macOS: associar easyphone.icns no bundle. Testar a integração no sistema de destino: conversão de formato não equivale a validação da aplicação empacotada.

Os SVG são caminhos vetoriais reais, sem imagens incorporadas ou dependência de fontes. PNG têm transparência. O ícone tem fundo grafite e cantos arredondados incorporados. Não acrescentar uma segunda placa ou outra margem sem avaliar o encaixe da plataforma.
