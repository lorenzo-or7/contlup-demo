/* Dados oficiais confirmados pela ContLup (23/10/2026), usados como referência nos testes.
   Se a ContLup mudar algum destes dados, atualize aqui: os testes do site, do repertório e da interface conferem contra esta lista. */

export const CNPJ = '68.970.978/0001-10';
export const COMMERCIAL = '5519971310182';

export const BPO = {
  title: 'BPO Financeiro',
  headline: 'Sua empresa organizada, suas finanças sob controle!',
  intro: 'O BPO Financeiro é a terceirização das rotinas financeiras da empresa. A ContLup organiza e acompanha as atividades financeiras do dia a dia, proporcionando mais controle, previsibilidade e tempo para o empresário focar no crescimento do negócio.',
  activities: [
    ['Gestão de contas a pagar', 'Organização de despesas, vencimentos e programação de pagamentos.'],
    ['Gestão de contas a receber', 'Controle de recebimentos e acompanhamento de inadimplência.'],
    ['Conciliação bancária', 'Conferência das movimentações financeiras.'],
    ['Controle do fluxo de caixa', 'Acompanhamento e projeção das entradas e saídas.'],
    ['Organização financeira', 'Classificação de receitas, despesas e documentos.'],
    ['Relatórios financeiros gerenciais', 'Informações para apoiar decisões.'],
    ['Acompanhamento financeiro', 'Análise periódica e identificação de pontos de atenção.'],
  ],
  benefits: [
    'Mais tempo para cuidar do negócio.',
    'Menos erros e atrasos.',
    'Maior controle financeiro.',
    'Melhor planejamento do fluxo de caixa.',
    'Mais previsibilidade.',
    'Informações organizadas para decisões.',
    'Menor dependência de planilhas e controles manuais.',
  ],
  audience: 'Pequenas e médias empresas, prestadores de serviços, comércios e empresários que desejam profissionalizar a gestão financeira.',
  cta: 'Solicitar proposta de BPO Financeiro',
  message: 'Olá! Vim pelo site da ContLup e gostaria de solicitar uma proposta de BPO Financeiro.',
};

/** O que nunca pode aparecer sobre o BPO: preço, prazo, integração bancária ou ContLup movimentando recursos por conta própria. */
export const BPO_FORBIDDEN = /R\$|\d+\s?%|\bprazo de \d|\d+\s?(dias|horas)\b|integra(ção|do|da) (com o |ao |a )?(banco|bancos|bancária)|open finance|acesso automático|sem (a sua |sua )?aprovação do cliente/i;

/** Remove os dados oficiais que têm números (CNPJ, "100% online") antes de procurar valores inventados. */
export const stripOfficial = (s) => String(s).replaceAll(CNPJ, '').replace(/100% online/g, '');
