/* Lupi: chat de dúvidas frequentes. Responde por palavras-chave, sem servidor e sem guardar nada. */
(function(){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s,c=document)=>c.querySelector(s), $$=(s,c=document)=>[...c.querySelectorAll(s)];
  const chat=$('#lupi-chat'); if(!chat) return;
  const launch=$('.js-lc-open'), log=$('.js-lc-log',chat), chips=$('.js-lc-chips',chat), form=$('.js-lc-form',chat), input=$('#lc-in'), pose=$('.js-lc-pose',chat), teaser=$('.js-lc-teaser');
  const WA='https://wa.me/5519997447919?text=';
  const wa=(t,label)=>`<a href="${WA+encodeURIComponent(t)}" target="_blank" rel="noopener">${label}</a>`;
  const WA_HI='Olá! Vim pelo site da ContLup e gostaria de atendimento.';

  /* poses da Lupi (img/lupi/*.webp) */
  const POSES=['apresenta','pensando','ideia','aponta','celular','notebook','piscadinha','confiante'];

  /* ---- base de conhecimento ---- */
  const KB=[
    {id:'oi',q:'Oi, Lupi!',pose:'apresenta',k:['oi','ola','bom dia','boa tarde','boa noite','e ai','opa','hello'],
      a:'Oi! Que bom ter você por aqui. Me conta: qual é a sua dúvida? Você pode escolher um dos assuntos abaixo ou escrever do seu jeito.',
      next:['preco','mei','abrir','troca','servicos','contato']},
    {id:'lupi',q:'Quem é você?',pose:'piscadinha',k:['quem e voce','quem e a lupi','voce e robo','voce e humana','e um robo','lupi'],
      a:'Eu sou a Lupi, a personagem da ContLup que explica contabilidade sem complicação. Aqui no site eu respondo as dúvidas mais comuns de forma automática. Para o seu caso específico, quem atende é a Priscila, contadora responsável.',
      next:['priscila','contato','servicos']},
    {id:'preco',q:'Quanto custa?',pose:'ideia',k:['quanto custa','preco','precos','custo','valor','valores','preco da contabilidade','preco do servico','mensalidade','honorario','honorarios','orcamento','tabela de preco','cobram','caro','barato','proposta'],
      a:'O valor depende do porte da empresa, do regime tributário, do número de funcionários e do volume de movimento. Depois de uma conversa inicial, a ContLup envia uma proposta com escopo e valor definidos.<br><br>Você pode <a href="#proposta">pedir uma proposta pelo formulário</a> ou '+wa('Olá! Vim pelo site da ContLup e gostaria de uma proposta para a contabilidade da minha empresa.','pedir direto pelo WhatsApp')+'.',
      next:['primeira','troca','servicos']},
    {id:'troca',q:'Trocar de contador',pose:'apresenta',k:['trocar de contador','troca de contador','mudar de contador','mudar de contabilidade','trocar de contabilidade','trocar contador','novo contador','transicao','contador atual','escritorio anterior'],
      a:'É mais simples do que parece. Depois que você decide, a ContLup organiza a transição com o escritório anterior, recebe os documentos e confere o que está em andamento, para que nenhuma obrigação fique para trás.<br><br>Quer conversar sobre isso? '+wa('Olá! Vim pelo site da ContLup e estou pensando em trocar de contador. Podemos conversar?','Falar no WhatsApp')+'.',
      next:['preco','primeira','atendimento']},
    {id:'mei',q:'Sou MEI',pose:'aponta',k:['mei','microempreendedor','micro empreendedor','guia das','boleto das','das do mei','desenquadramento','desenquadrar','limite do mei','sair do mei','deixar de ser mei'],
      a:'Sim, a ContLup atende MEI! Ajudamos com a rotina e as dúvidas do dia a dia e orientamos quando chega a hora de mudar de porte, inclusive no desenquadramento.<br><br>'+wa('Olá! Sou MEI e vim pelo site da ContLup. Gostaria de tirar algumas dúvidas.','Tirar dúvidas de MEI no WhatsApp')+'.',
      next:['nota','abrir','preco']},
    {id:'abrir',q:'Abrir empresa',pose:'notebook',k:['abrir empresa','abrir minha empresa','abrir uma empresa','abertura','abrir cnpj','tirar cnpj','cnpj','formalizar','formalizacao','comecar um negocio','montar empresa','qual tipo de empresa','tipo de empresa'],
      a:'Pode contar com a gente! A ContLup orienta na escolha do tipo de empresa e do regime tributário e cuida da abertura e dos registros necessários, do primeiro passo ao CNPJ.<br><br>'+wa('Olá! Vim pelo site da ContLup e quero abrir minha empresa. Podem me ajudar?','Quero abrir minha empresa')+'.',
      next:['regime','primeira','preco']},
    {id:'primeira',q:'O que preciso para começar?',pose:'pensando',k:['primeira conversa','primeira reuniao','o que preciso','que documentos','quais documentos','documentos preciso','como comecar','como funciona para comecar','como contratar','contratar'],
      a:'Nada além de contar como está o seu negócio. Se você já tem empresa, ter em mãos o CNPJ e uma ideia do faturamento mensal ajuda a montar a proposta.<br><br>O caminho é assim: <b>1.</b> primeira conversa, sem compromisso; <b>2.</b> proposta sob medida; <b>3.</b> começo organizado, com a transição e os primeiros ajustes.',
      next:['preco','contato','troca']},
    {id:'atendimento',q:'Como é o atendimento?',pose:'celular',k:['atendimento','dia a dia','como funciona','online','a distancia','remoto','presencial','responde rapido','suporte'],
      a:'Atendimento próximo e personalizado, pelo WhatsApp e por e-mail, com explicações em linguagem simples, sem “contabilês”. Você conversa com quem acompanha a sua empresa de perto.',
      next:['contato','horario','priscila']},
    {id:'servicos',q:'Quais os serviços?',pose:'apresenta',k:['servicos','servico','o que voces fazem','o que a contlup faz','areas','area de atuacao','areas de atuacao','trabalham com'],
      a:'A ContLup atua em quatro áreas:<ul><li><a href="#svc-contabil">Contábil</a>: escrituração, balanço, DRE e relatórios.</li><li><a href="#svc-fiscal">Fiscal e Tributário</a>: impostos, obrigações e regime tributário.</li><li><a href="#svc-trabalhista">Trabalhista</a>: folha, admissões, férias e rescisões.</li><li><a href="#svc-societario">Societário</a>: abertura, alterações e encerramento.</li></ul>Sobre qual delas você quer saber mais?',
      next:['contabil','fiscal','trabalhista','societario']},
    {id:'contabil',q:'Área contábil',pose:'notebook',k:['contabil','escrituracao','balanco','balanco patrimonial','dre','demonstracao','relatorio','relatorios gerenciais','conciliacao','analise de resultado'],
      a:'Na área contábil, a ContLup cuida da escrituração, do balanço patrimonial e da DRE, das conciliações e dos relatórios gerenciais, com análise de resultados. A ideia é você enxergar a situação real da empresa e acompanhar a evolução do negócio.',
      next:['lucro','fiscal','preco']},
    {id:'fiscal',q:'Fiscal e tributário',pose:'ideia',k:['fiscal','tributario','tributaria','imposto','impostos','tributo','tributos','guia','guias','obrigacoes acessorias','pagar menos imposto','planejamento tributario','declaracao'],
      a:'No fiscal e tributário: apuração de impostos e emissão de guias, obrigações acessórias, escolha e revisão do regime tributário e orientação sobre emissão de notas fiscais. Obrigações em dia e um olhar atento para os tributos que pesam no seu negócio.',
      next:['regime','nota','preco']},
    {id:'regime',q:'Qual regime tributário?',pose:'pensando',k:['regime','regime tributario','simples nacional','lucro presumido','lucro real','enquadramento','qual regime'],
      a:'Não existe um regime “melhor” para todo mundo: depende da atividade, do faturamento, da folha e das margens do negócio. A ContLup analisa o seu caso e orienta na escolha, ou na revisão, do regime tributário.<br><br>'+wa('Olá! Vim pelo site da ContLup e gostaria de entender qual regime tributário é melhor para minha empresa.','Analisar o meu caso')+'.',
      next:['fiscal','abrir','preco']},
    {id:'nota',q:'Quando emitir nota?',pose:'aponta',k:['nota fiscal','notas fiscais','emitir nota','emissao de nota','nfe','nf e','nfs','nfse','nota'],
      a:'Depende da atividade e do tipo de empresa. Vale conversar antes de vender, para emitir do jeito certo desde a primeira nota. A ContLup orienta sobre a emissão dentro da área fiscal.',
      next:['mei','fiscal','contato']},
    {id:'trabalhista',q:'Área trabalhista',pose:'celular',k:['trabalhista','folha','folha de pagamento','funcionario','funcionarios','empregado','contratar funcionario','admissao','ferias','rescisao','demissao','esocial','fgts','pro labore','prolabore','encargos','departamento pessoal','dp','13','decimo terceiro'],
      a:'Na área trabalhista: folha de pagamento e pró-labore, admissões, férias e rescisões, eSocial, FGTS e encargos, além de orientação nas rotinas da equipe. Tudo acompanhado com cuidado para não tomar o seu tempo.',
      next:['preco','servicos','contato']},
    {id:'societario',q:'Área societária',pose:'apresenta',k:['societario','societaria','socio','socios','contrato social','alteracao contratual','alterar contrato','incluir socio','sair da sociedade','baixa','encerrar','encerramento','fechar','fecho','dar baixa','fechar empresa','fechar a empresa','fechar cnpj'],
      a:'No societário, a ContLup apoia na abertura de empresas, alterações contratuais, baixa e encerramento, e na formalização e desenquadramento de MEI. É o cuidado com a estrutura da empresa ao longo do tempo.',
      next:['abrir','mei','contato']},
    {id:'lucro',q:'Saldo em conta é lucro?',pose:'ideia',k:['lucro','saldo','extrato','sobra dinheiro','dinheiro nao sobra','fluxo de caixa','caixa','faturamento','margem'],
      a:'Nem sempre! O saldo em conta mostra o dinheiro disponível hoje. O lucro depende de tudo o que entrou, do que saiu e do que ainda vai sair no período. E faturamento alto não garante sobra no caixa: prazos de recebimento, custos e despesas contam a outra parte da história.',
      next:['precificar','contabil','contato']},
    {id:'precificar',q:'Como precificar?',pose:'pensando',k:['precificar','precificacao','formar preco','formacao de preco','preco de venda','preco do produto','preco do meu produto','meu preco','preco certo','preco correto','achismo'],
      a:'O ponto de partida é conhecer seus custos, suas despesas e a margem de que você precisa. Um preço sustentável considera tudo isso e também os tributos. Se quiser, a ContLup ajuda a olhar para os seus números.',
      next:['lucro','fiscal','contato']},
    {id:'priscila',q:'Quem é a Priscila?',pose:'confiante',k:['priscila','contadora','responsavel','quem atende','experiencia','crc','dona'],
      a:'A Priscila Petean é a contadora responsável pela ContLup, com mais de 20 anos de experiência. Ela acompanha cada empresa de perto e transforma números em informação que o empresário consegue usar no dia a dia.<br><br>'+wa('Olá, Priscila! Vim pelo site da ContLup e gostaria de conversar com você.','Conversar com a Priscila')+'.',
      next:['contato','servicos','preco']},
    {id:'contato',q:'Falar com a Priscila',pose:'celular',k:['contato','whatsapp','zap','telefone','ligar','celular','numero','email','e mail','falar com','falar com alguem','falar com a priscila','atendente','humano','pessoa'],
      a:'Claro! Você fala com a ContLup por aqui:<ul><li>WhatsApp: '+wa(WA_HI,'(19) 99744-7919')+'</li><li>E-mail: contato@contlup.com.br</li><li>Instagram: <a href="https://www.instagram.com/contlupstudiocontabil/" target="_blank" rel="noopener">@contlupstudiocontabil</a></li></ul>',
      next:['horario','endereco','preco']},
    {id:'endereco',q:'Onde fica?',pose:'aponta',k:['endereco','onde fica','onde voces ficam','localizacao','pedreira','cidade','outras cidades','atendem fora','atende minha cidade','regiao'],
      a:'O escritório fica em Pedreira/SP. Para saber se a ContLup atende a sua cidade e como fica o atendimento no seu caso, '+wa('Olá! Vim pelo site da ContLup e gostaria de saber se vocês atendem a minha cidade.','pergunte pelo WhatsApp')+'.',
      next:['atendimento','contato','horario']},
    {id:'horario',q:'Horário de atendimento',pose:'celular',k:['horario de atendimento','horario','horarios','que horas','abre','fecha','funciona sabado','sabado','domingo','feriado','expediente'],
      a:'Os dias e horários de atendimento serão publicados aqui em breve. Enquanto isso, você pode mandar sua mensagem pelo '+wa(WA_HI,'WhatsApp')+' a qualquer momento: a resposta vem no horário de atendimento.',
      next:['contato','atendimento']},
    {id:'privacidade',q:'Meus dados ficam salvos?',pose:'confiante',k:['privacidade','dados','lgpd','seguro','seguranca','cookies','armazena'],
      a:'Não. Esta conversa acontece só no seu navegador e não fica gravada no site. O site não usa cookies de rastreamento. Veja a <a href="#privacidade" class="js-lc-priv">política de privacidade</a>.',
      next:['contato','servicos']},
    {id:'obrigado',q:'Obrigado!',pose:'piscadinha',k:['obrigado','obrigada','valeu','vlw','brigado','agradeco','show','perfeito','otimo','entendi','ajudou'],
      a:'Imagina! Fico feliz em ajudar. Se surgir outra dúvida, é só chamar. E quando quiser dar o próximo passo, a Priscila está a um '+wa(WA_HI,'clique no WhatsApp')+'.',
      next:['preco','servicos']},
    {id:'tchau',q:'Tchau!',pose:'piscadinha',k:['tchau','ate mais','ate logo','falou','bye','adeus'],
      a:'Até mais! Volte sempre que precisar. 💜',next:[]}
  ];
  const START=['preco','mei','abrir','troca','servicos','contato'];
  const byId=Object.fromEntries(KB.map(e=>[e.id,e]));

  /* ---- busca por palavras-chave ---- */
  const norm=s=>' '+s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim()+' ';
  KB.forEach(e=>e._k=e.k.map(k=>norm(k)));
  function find(text){
    const t=norm(text); let best=null, top=0;
    KB.forEach(e=>{ let s=0; e._k.forEach(k=>{ if(t.includes(k)) s+=k.length }); if(s>top){top=s; best=e} });
    return top>=4?best:null;
  }

  /* ---- interface ---- */
  let shown=null;
  function setPose(name){
    if(shown===name) return; shown=name; pose.src='img/lupi/'+name+'.webp';
    if(!reduce && pose.animate) pose.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.2,.7,.2,1)'});
  }
  function add(who,html){
    const row=document.createElement('div'); row.className='lc-msg lc-'+who;
    if(who==='bot') row.innerHTML='<img class="lc-av" src="img/lupi/avatar.webp" alt="" width="32" height="32"><div class="lc-b">'+html+'</div>';
    else { const b=document.createElement('div'); b.className='lc-b'; b.textContent=html; row.appendChild(b); }
    log.appendChild(row); log.scrollTop=log.scrollHeight; return row;
  }
  function setChips(ids){
    chips.innerHTML=''; chips.scrollLeft=0;
    ids.forEach(id=>{ const e=byId[id]; const b=document.createElement('button'); b.type='button'; b.className='lc-chip'; b.textContent=e.q; b.addEventListener('click',()=>ask(e.q,e)); chips.appendChild(b) });
    chips.hidden=!ids.length;
  }
  let busy=false;
  function reply(e,html,next){
    busy=true; setPose('pensando'); chips.hidden=true;
    const dots=add('bot','<span class="lc-dots" aria-label="Lupi está digitando"><i></i><i></i><i></i></span>');
    setTimeout(()=>{ dots.remove(); add('bot',html); setPose(e?e.pose:'confiante'); setChips(next); busy=false }, reduce?150:650+Math.random()*350);
  }
  function ask(text,entry){
    if(busy) return;
    text=text.trim().slice(0,200); if(!text) return;
    add('user',text);
    const e=entry||find(text);
    if(e) reply(e,e.a,e.next.length?e.next:START);
    else reply(null,'Hmm, essa eu ainda não sei responder por aqui. 🤔 Mas a Priscila pode te ajudar: '+wa('Olá! Vim pelo site da ContLup e tenho uma dúvida: '+text,'enviar essa pergunta pelo WhatsApp')+'.<br><br>Ou escolha um dos assuntos abaixo.',START);
  }

  const mobile=()=>matchMedia('(max-width: 899px)').matches;
  let started=false, opener=null;
  function open(from){
    hideTeaser(true);
    opener=from||launch; chat.hidden=false; document.body.classList.add('lc-on');
    launch.setAttribute('aria-expanded','true');
    if(mobile()) document.body.style.overflow='hidden';
    if(!started){ started=true; POSES.forEach(p=>{ const i=new Image(); i.src='img/lupi/'+p+'.webp' });
      setPose('apresenta'); add('bot','Oi! Eu sou a <b>Lupi</b>, assistente virtual da ContLup. 💜 Respondo as dúvidas mais comuns sobre contabilidade e sobre o escritório.');
      add('bot','Escolha um assunto abaixo ou escreva sua pergunta.'); setChips(START); }
    requestAnimationFrame(()=>chat.classList.add('is-open'));
    (mobile()?$('.lc-x',chat):input).focus({preventScroll:true});
  }
  function close(){
    chat.classList.remove('is-open'); chat.hidden=true; document.body.classList.remove('lc-on');
    launch.setAttribute('aria-expanded','false'); document.body.style.overflow='';
    if(opener && opener.isConnected) opener.focus({preventScroll:true});
  }

  $$('.js-lc-open').forEach(b=>b.addEventListener('click',()=>chat.hidden?open(b):close()));
  $('.js-lc-close',chat).addEventListener('click',close);
  chat.addEventListener('keydown',e=>{ if(e.key==='Escape') close() });
  form.addEventListener('submit',e=>{ e.preventDefault(); const v=input.value; if(busy||!v.trim()) return; input.value=''; ask(v) });
  // links internos (#proposta, #svc-...) fecham o chat no celular para mostrar a seção
  log.addEventListener('click',e=>{ const a=e.target.closest('a[href^="#"]'); if(!a) return;
    if(a.classList.contains('js-lc-priv')){ const d=$('#privacidade'); if(d) d.open=true }
    if(mobile()) close();
  });

  /* ---- balão de boas-vindas (uma vez por sessão) ---- */
  function hideTeaser(remember){ if(!teaser) return; teaser.hidden=true; if(remember){ try{sessionStorage.setItem('lc-teaser','1')}catch(e){} } }
  if(teaser){
    let seen=null; try{seen=sessionStorage.getItem('lc-teaser')}catch(e){}
    if(!seen) setTimeout(()=>{ if(chat.hidden && !document.body.classList.contains('lc-on')) teaser.hidden=false }, 6000);
    $('.js-lc-teaser-x',teaser).addEventListener('click',()=>hideTeaser(true));
    $('.js-lc-teaser-go',teaser).addEventListener('click',()=>open(launch));
  }
})();
