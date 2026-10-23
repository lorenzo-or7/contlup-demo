# Poses da Lupi (Lupi 3.0)

As poses usadas no chat ficam em `img/lupi/poses/`. Foram recortadas da arte com 12 poses enviada pela ContLup,
com fundo transparente (nenhuma ilustração foi redesenhada), em duas resoluções:

- `<nome>.webp`: 2x, para telas de alta densidade (~300 px de altura);
- `<nome>-1x.webp`: 1x, para telas comuns (170 px de altura).

| Pose | Estado visual | Quando aparece |
|---|---|---|
| `tablet` | `idle` | chat aberto, aguardando |
| `acenando` | `welcome`, `goodbye` | ao abrir o chat (uma vez por abertura) e no "tchau" |
| `pensando` | `thinking`, `doubt` | enquanto a resposta aparece; pergunta ambígua, assunto em revisão ou sem resposta |
| `apontando` | `explaining` | explicação geral |
| `grafico` | `finance` | BPO Financeiro, fluxo de caixa, margem, preço e outras rotinas financeiras |
| `checklist` | `organize` | planos e indicação de plano |
| `ideia` | `idea` | menu, assuntos e sugestões |
| `notebook` | `notes` | perguntas dos atendimentos guiados |
| `ok` | `stepDone` | etapa de um atendimento guiado respondida |
| `headset` | `handoff` | mensagem para o WhatsApp comercial |
| `comemorando` | `celebrate` | atendimento guiado concluído |
| `carinho` | `thanks` | agradecimento |

O mapa fica em `js/lupi/visual.js` (`STATES`). Para trocar uma pose, substitua os dois arquivos com o mesmo nome
e atualize as dimensões em `POSES`.

`img/lupi/avatar.webp` continua sendo usado no botão "Pergunte à Lupi", nas mensagens e como último fallback, se nenhuma pose carregar.
As 8 ilustrações antigas da Lupi 2.0 (aponta, apresenta, celular, confiante, ideia, notebook, pensando, piscadinha) foram removidas por não terem mais uso.
