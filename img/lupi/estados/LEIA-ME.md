# Expressões da Lupi

Hoje a Lupi 2.0 usa as ilustrações originais recortadas da arte enviada (`img/lupi/*.webp`):

| Estado | Quando aparece | Arquivo atual |
|---|---|---|
| `idle` | parada, ouvindo | `img/lupi/confiante.webp` |
| `welcome` | saudação (com aceno) | `img/lupi/apresenta.webp` |
| `thinking` | processando / dúvida que pede análise | `img/lupi/pensando.webp` |
| `explaining` | explicando um conteúdo | `img/lupi/ideia.webp` |
| `success` | fluxo concluído / agradecimento | `img/lupi/piscadinha.webp` |

Para usar artes dedicadas no futuro, coloque PNGs transparentes nesta pasta (ex.: `welcome.png`)
e troque o caminho correspondente em `js/lupi/expressions.js`. Nenhuma arte nova foi criada:
esta pasta só prepara a estrutura.
