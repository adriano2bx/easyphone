# easyphone - identidade visual v1.0

Data: 31 de outubro de 2026. Direção: Native Premium / Conectado.

## Conceito

Software nativo para comunicação de voz, com presença discreta, precisão e simplicidade. O símbolo Conectado foi escolhido na proposta 03: um e abstrato, com uma abertura curva diagonal que articula a forma. O verde integra a identidade visual própria do produto.

## Construção da marca

- Nome: easyphone.
- Assinatura: sem endosso externo.
- Marca principal: símbolo verde + nome claro sobre grafite.
- Marca positiva: símbolo verde + nome grafite sobre fundo claro.
- Versões monocromáticas: branco e grafite.
- Versão sem assinatura: barras de título e áreas pequenas.

O símbolo e o lettering foram vetorizados a partir da prancha consolidada. Os SVG são os masters normalizados para produção. As apresentações geradas e os mockups podem conter pequenas diferenças de rasterização; não extrair novas versões a partir deles.

## Proteção e redução

Definir H como a altura visível do símbolo. Manter pelo menos H/4 de área livre ao redor do conjunto, além da área transparente do arquivo quando houver. Não alterar o espaçamento interno entre símbolo, nome e assinatura.

Largura mínima recomendada do conjunto com assinatura: 400 px; preferir 480 px ou mais. Abaixo disso, usar a versão sem assinatura. Sem assinatura: 160 px. Símbolo isolado: 16 px mínimo; preferir 24 px ou mais. Sempre verificar a leitura no contexto real. Valores em pixels lógicos de referência.

## Paleta

| Papel | HEX |
|---|---|
| Verde institucional | #38F094 |
| Fundo grafite | #202225 |
| Barra de título | #23262A |
| Navegação | #1D2023 |
| Painel | #24272B |
| Controles | #2C3034 |
| Divisores | #383D41 |
| Texto principal | #F0F1EE |
| Texto secundário | #A4ADB3 |
| Fundo claro | #F2F3F0 |
| Texto no verde | #102A1C |
| Encerrar / erro | #C83847 |

O sistema deste pacote é digital em sRGB. Não são definidas equivalências Pantone ou CMYK: produção impressa exige prova de cor e conversão conforme o perfil de saída.

## Tipografia

O wordmark é um desenho em contornos, derivado do estudo escolhido; não há uma fonte identificada para digitar a marca. Para a interface, usar fontes do sistema: Segoe UI no Windows, fonte do sistema no macOS e Noto Sans ou DejaVu Sans no Linux. Os arquivos de fonte não são distribuídos neste pacote.

Escala de referência: legenda 11 px; corpo 13 px; controle 14 px; seção 20 px; números do discador 24 px. Pesos 400, 500 e 600 conforme suporte. Espaçamentos em múltiplos de 4 px. Raio de controle 8 px.

## Ícone

Master 1024 x 1024 em SVG. Símbolo verde com cerca de 54% da largura da placa grafite; área externa transparente e cantos arredondados. ICO para Windows, ICNS para macOS, estrutura hicolor para Linux, favicon SVG/ICO e PNG de 16 a 2048 px.

## Interface

Modo completo com conta SIP, discador e histórico; modo compacto com discagem em uma coluna; estado reduzido de chamada com controles essenciais. Contatos e chamadas são ilustrativos. As imagens são mockups de referência e não entregam uma implementação funcional.

Ver `../06-Implementacao/IMPLEMENTACAO.md` para estados, dimensões, acessibilidade e orientação aos desenvolvedores.

## Usos incorretos

Não deformar, girar ou redesenhar o símbolo; mudar o verde; alterar a abertura diagonal; digitar o logotipo com uma fonte aproximada; aplicar brilho, relevo ou degradê; inserir a marca sobre fundos ruidosos; colorir toda a interface de verde; combinar o símbolo antigo de rede com o novo símbolo Conectado.

## Integridade da entrega

A referência escolhida é a base desta versão. A vetorização técnica foi inspecionada visualmente, mas não equivale a pesquisa de anterioridade ou registro de marca. O pacote não inclui análise de disponibilidade do nome easyphone. Os formatos de ícone foram verificados estruturalmente; devem ser testados no aplicativo e nos sistemas de destino.
