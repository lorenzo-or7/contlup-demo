(function(){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const $ = (s,c=document)=>c.querySelector(s), $$=(s,c=document)=>[...c.querySelectorAll(s)];
  const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  const ease=t=>1-Math.pow(1-t,3);
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

  /* ---- theme ----
     O tema escolhido só é lembrado entre visitas (localStorage) se o visitante permitir "Preferências" no aviso de
     privacidade (js/consent.js). Sem essa permissão, o tema vale só enquanto a página estiver aberta. */
  const CONSENT_KEY='cl-consent', CONSENT_V=1; // mesmos valores de js/consent.js
  function canRemember(){ try{const c=JSON.parse(localStorage.getItem(CONSENT_KEY)||'null'); return !!(c&&c.v===CONSENT_V&&c.prefs)}catch(e){return false} }
  function setTheme(mode,save){
    if(mode==='light') root.setAttribute('data-cl','light'); else root.removeAttribute('data-cl');
    $$('.js-theme').forEach(b=>b.setAttribute('aria-pressed',mode==='light'?'true':'false'));
    if(save&&canRemember()){ try{localStorage.setItem('cl-theme',mode)}catch(e){} }
  }
  let saved=null; if(canRemember()){ try{saved=localStorage.getItem('cl-theme')}catch(e){} }
  setTheme(saved==='light'?'light':'dark',false);
  $$('.js-theme').forEach(b=>b.addEventListener('click',()=>setTheme(root.getAttribute('data-cl')==='light'?'dark':'light',true)));
  addEventListener('contlup:consent',e=>{
    try{ if(e.detail&&e.detail.prefs) localStorage.setItem('cl-theme',root.getAttribute('data-cl')==='light'?'light':'dark'); else localStorage.removeItem('cl-theme') }catch(err){}
  });

  /* ---- pixel patterns (from the logo's L trail) ---- */
  const PAT={
    logo:["......x","....lx.","..x.x..",".dxx...","x.l....","xd.....","x......"],
    up:  [".....lx","....x.x","...x..x","..l....",".x.....","x......"]
  };
  $$('[data-px]').forEach(el=>{
    const p=PAT[el.dataset.px]; el.style.gridTemplateColumns=`repeat(${p[0].length},${getComputedStyle(el).gridAutoRows})`;
    p.forEach(row=>[...row].forEach(ch=>{const i=document.createElement('i'); if(ch!=='.'){i.className='on'+(ch==='l'?' l':ch==='d'?' d':'')} el.appendChild(i)}));
  });

  /* ---- "nosso jeito" pixels: scattered → organized ---- */
  $$('.js-org').forEach((el,k)=>{const r=rng(11+k); for(let n=0;n<9;n++){const i=document.createElement('i'); i.style.setProperty('--ox',((r()-.5)*44).toFixed(1)+'px'); i.style.setProperty('--oy',((r()-.5)*36).toFixed(1)+'px'); i.style.setProperty('--or',((r()-.5)*90).toFixed(0)+'deg'); el.appendChild(i)}});
  $$('.js-glow').forEach(c=>c.addEventListener('pointermove',e=>{const b=c.getBoundingClientRect(); c.style.setProperty('--mx',(e.clientX-b.left)+'px'); c.style.setProperty('--my',(e.clientY-b.top)+'px')}));

  /* ---- calendar (trabalhista) ---- */
  const cal=$('.js-cal'); if(cal){['D','S','T','Q','Q','S','S'].forEach(d=>{const s=document.createElement('span');s.textContent=d;cal.appendChild(s)});
    for(let n=0;n<28;n++){const i=document.createElement('i'); if([5,6,12,19,26].includes(n))i.className='m'; if([9,20].includes(n))i.className='k'; cal.appendChild(i)}}

  /* ---- story: pixel bar chart ---- */
  const bars=$('.js-pxbars'); const heights=[4,5,4,6,7,6,8,9]; const months=['mar','abr','mai','jun','jul','ago','set','out'];
  const px=[]; const R=rng(7);
  if(bars){heights.forEach((h,c)=>{const col=document.createElement('div');col.className='pxcol'+(c===heights.length-1?' last':'');
      for(let n=0;n<h;n++){const i=document.createElement('i'); if(n>=h-1&&c<heights.length-1)i.className='l'; i._s={x:(R()-.5)*1100-200,y:(R()-.5)*520-60,r:(R()-.5)*200,d:R()}; col.appendChild(i); px.push(i)}
      const s=document.createElement('span');s.textContent=months[c];col.appendChild(s); bars.appendChild(col)});}

  const story=$('.js-story'), steps=$$('.js-steps li'), band=$('.js-band');
  function render(p){
    const t=clamp(p/.22), c=clamp((p-.32)/.32), d=clamp((p-.5)/.28);
    story.style.setProperty('--t',t.toFixed(3)); story.style.setProperty('--c',c.toFixed(3)); story.style.setProperty('--d',d.toFixed(3));
    px.forEach(i=>{const s=i._s; const a=ease(clamp((p-.06-s.d*.2)/.34)); const k=1-a;
      i.style.transform=k<.001?'none':`translate(${(s.x*k).toFixed(1)}px,${(s.y*k).toFixed(1)}px) rotate(${(s.r*k).toFixed(0)}deg)`; i.style.opacity=(.4+.6*a).toFixed(2)});
    const idx=p<.25?0:p<.5?1:p<.75?2:3; steps.forEach((li,n)=>li.classList.toggle('on',n<=idx));
  }
  let sticky=false;
  function mode(){
    const want = !reduce && innerWidth>=1181 && innerHeight>=720;
    sticky=want; story.classList.toggle('is-static',!want); if(band) band.classList.toggle('show',!want);
    if(!want){ if(!story._played) render(reduce?1:0); else render(1); }
  }
  function onScroll(){
    if(sticky){const b=story.getBoundingClientRect(); const span=b.height-innerHeight; render(clamp(-b.top/span));}
    parallax(); navSpy(); smartHeader();
  }
  // static mode: play once when visible
  const io0=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting && !sticky && !story._played && !reduce){story._played=true; const t0=performance.now(); (function f(now){const p=clamp((now-t0)/1800); render(p); if(p<1)requestAnimationFrame(f)})(t0)} }),{threshold:.3});
  io0.observe(story);

  /* ---- hero parallax ---- */
  const par=$('.js-par'), ring=$('.js-ring');
  function parallax(){ if(reduce)return; const y=scrollY; if(y<innerHeight*1.2){par.style.setProperty('--py',(y*.08).toFixed(1)+'px'); ring.style.setProperty('--rot',(y*.02).toFixed(2)+'deg')}}

  /* ---- navegação: item ativo conforme a seção visível ---- */
  const links=$$('.nav-list a'), secs=$$('[data-sec]'); let cur='';
  function navSpy(){
    let id=secs[0].dataset.sec; const line=innerHeight*.4;
    secs.forEach(s=>{ if(s.getBoundingClientRect().top<=line) id=s.dataset.sec });
    if(id===cur) return; cur=id;
    links.forEach(a=>{const on=a.dataset.target===id; a.classList.toggle('is-active',on); if(on) a.setAttribute('aria-current','true'); else a.removeAttribute('aria-current')});
  }

  /* ---- reveals ---- */
  if(!reduce){
    const io=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){const el=e.target; el.classList.add('rv-go'); el.classList.remove('rv-pending'); setTimeout(()=>{el.classList.remove('rv-go'); el.style.transitionDelay=''},1100); if(el.classList.contains('js-lupi')) el.classList.add('in'); if(el.classList.contains('js-cta')) el.classList.add('in'); io.unobserve(el);} }),{threshold:.12,rootMargin:'0px 0px -6% 0px'});
    let k=0; $$('.rv').forEach(el=>{ if(el.getBoundingClientRect().top>innerHeight){ el.classList.add('rv-pending'); el.style.transitionDelay=(el.parentElement.classList.contains('ways')||el.parentElement.classList.contains('svc-grid')||el.parentElement.classList.contains('auth-panel')? ([...el.parentElement.children].indexOf(el)*90):0)+'ms'; io.observe(el);} });
    // count-up
    const cnt=$('.js-count'); const io2=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){io2.disconnect(); const to=+cnt.dataset.to, t0=performance.now(); (function f(n){const p=clamp((n-t0)/900); cnt.textContent=String(Math.round(ease(p)*to)).padStart(2,'0'); if(p<1)requestAnimationFrame(f)})(t0)} }),{threshold:.6});
    if(cnt.getBoundingClientRect().top>innerHeight*.9) io2.observe(cnt);
  } else { $('.js-lupi').classList.add('in'); }

  /* ---- faixas de assuntos: a animação para quando estão fora da tela ---- */
  const mqIo=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('is-off',!e.isIntersecting)));
  $$('.marquee').forEach(m=>mqIo.observe(m));

  /* ---- touch: light up "nosso jeito" when centered ---- */
  if(matchMedia('(hover: none)').matches){
    const io3=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('is-on',e.isIntersecting)),{rootMargin:'-35% 0px -35% 0px'});
    $$('.way').forEach(w=>io3.observe(w));
  }

  /* ---- problems accordion (click + hover on desktop) ---- */
  const qbtns=$$('.q-btn');
  function openQ(b){qbtns.forEach(x=>x.setAttribute('aria-expanded',x===b?'true':'false'))}
  qbtns.forEach(b=>{
    b.addEventListener('click',()=>{const was=b.getAttribute('aria-expanded')==='true'; if(was) b.setAttribute('aria-expanded','false'); else openQ(b)});
    if(matchMedia('(hover: hover)').matches) b.addEventListener('mouseenter',()=>openQ(b));
  });

  /* ---- proposal form -> WhatsApp with ready message ---- */
  const form=$('#proposta');
  if(form){
    const f=id=>$('#'+id,form);
    const show=(inp,errId,bad)=>{inp.setAttribute('aria-invalid',bad?'true':'false'); $('#'+errId,form).hidden=!bad; if(bad) inp.setAttribute('aria-describedby',errId); else inp.removeAttribute('aria-describedby')};
    ['f-nome','f-tel'].forEach(id=>f(id).addEventListener('input',()=>{const e=id==='f-nome'?'e-nome':'e-tel'; if(f(id).getAttribute('aria-invalid')==='true') show(f(id),e,false)}));
    let lastSend=0; // dois toques seguidos não abrem duas conversas
    form.addEventListener('submit',e=>{
      e.preventDefault();
      if(Date.now()-lastSend<3000) return;
      const nome=f('f-nome').value.trim(), tel=f('f-tel').value.trim(), emp=f('f-empresa').value.trim(), ass=f('f-assunto').value, msg=f('f-msg').value.trim();
      const digits=tel.replace(/\D/g,''); const badN=nome.length<2, badT=digits.length<10||digits.length>13;
      show(f('f-nome'),'e-nome',badN); show(f('f-tel'),'e-tel',badT);
      if(badN){f('f-nome').focus();return} if(badT){f('f-tel').focus();return}
      let t=`Olá! Vim pelo site da ContLup e gostaria de solicitar uma proposta.\n\n*Nome:* ${nome}`;
      if(emp) t+=`\n*Empresa:* ${emp}`;
      t+=`\n*Telefone:* ${tel}\n*Assunto:* ${ass}`;
      if(msg) t+=`\n\n${msg}`;
      const url='https://wa.me/5519971310182?text='+encodeURIComponent(t);
      const link=$('#form-link',form); link.href=url; $('#form-ok',form).hidden=false;
      lastSend=Date.now();
      try{window.open(url,'_blank','noopener')}catch(err){}
    });
  }
  /* ---- privacy link opens the policy ---- */
  /* ---- política de privacidade: um único botão no rodapé abre e fecha o texto; links para #privacidade também abrem ---- */
  const priv=$('#privacidade'), pbtn=$('.js-priv-toggle');
  function setPriv(open){ if(!priv) return; priv.hidden=!open; pbtn?.setAttribute('aria-expanded',String(open)) }
  pbtn?.addEventListener('click',()=>{ const open=priv.hidden; setPriv(open); if(open) priv.focus({preventScroll:true}) });
  document.addEventListener('click',e=>{ const a=e.target.closest('a[href="#privacidade"]'); if(!a) return;
    e.preventDefault(); setPriv(true); priv.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'}); priv.focus({preventScroll:true}) });
  addEventListener('contlup:privacy',()=>setPriv(true));

  /* ---- copy buttons ---- */
  const live=document.createElement('p'); live.className='sr'; live.setAttribute('aria-live','polite'); document.body.appendChild(live);
  $$('button.copy').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.copy; const done=()=>{b.textContent='Copiado'; live.textContent='Copiado: '+v; setTimeout(()=>b.textContent='Copiar',1600)};
    try{navigator.clipboard.writeText(v).then(done,()=>sel(b))}catch(e){sel(b)}}));
  function sel(b){const t=b.closest('li').querySelector('a'); const r=document.createRange(); r.selectNodeContents(t); const s=getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent='Selecionado'; live.textContent='Texto selecionado. Use o comando de copiar do aparelho.'}

  /* ---- cabeçalho compacto (abaixo de 1024 px): menu suspenso e barra que some ao rolar para baixo ---- */
  const nav=$('.js-nav'), burger=$('.js-burger'), menu=$('#nav-menu'), scrim=$('.js-nav-scrim');
  const compact=matchMedia('(max-width: 1023px)');
  let menuOpen=false, lockY=0;
  function lockScroll(on){
    const b=document.body;
    if(on){ lockY=scrollY; b.style.position='fixed'; b.style.top=(-lockY)+'px'; b.style.left='0'; b.style.right='0'; b.style.width='100%' }
    else if(b.style.position==='fixed'){ b.style.position=''; b.style.top=''; b.style.left=''; b.style.right=''; b.style.width=''; scrollTo({top:lockY,left:0,behavior:'instant'}) }
  }
  function setMenu(open,{focus=true}={}){
    if(open===menuOpen) return;
    menuOpen=open;
    nav.classList.toggle('is-open',open); nav.classList.remove('is-hidden');
    burger.setAttribute('aria-expanded',String(open)); burger.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
    scrim.hidden=!open; lockScroll(open);
    if(open&&focus) menu.querySelector('a').focus({preventScroll:true});
  }
  burger.addEventListener('click',()=>setMenu(!menuOpen));
  scrim.addEventListener('click',()=>setMenu(false));
  // escolher uma seção: destrava a rolagem antes de o navegador ir até a âncora
  menu.addEventListener('click',e=>{ if(e.target.closest('a')&&menuOpen) setMenu(false) });
  document.addEventListener('pointerdown',e=>{ if(menuOpen&&!nav.contains(e.target)&&e.target!==scrim) setMenu(false) });
  addEventListener('keydown',e=>{ if(e.key==='Escape'&&menuOpen){ setMenu(false); burger.focus() } });
  nav.addEventListener('focusout',e=>{ if(menuOpen&&e.relatedTarget&&!nav.contains(e.relatedTarget)) setMenu(false,{focus:false}) });
  // ao virar o aparelho ou passar para o layout de desktop, nada fica travado
  const resetMenu=()=>{ if(menuOpen) setMenu(false,{focus:false}); nav.classList.remove('is-hidden') };
  compact.addEventListener('change',resetMenu); addEventListener('orientationchange',resetMenu);

  let lastY=scrollY, acc=0;
  function smartHeader(){
    const y=scrollY, dy=y-lastY; lastY=y;
    if(!compact.matches||menuOpen||nav.contains(document.activeElement)){ nav.classList.remove('is-hidden'); acc=0; return }
    if(y<80){ nav.classList.remove('is-hidden'); acc=0; return }
    acc=(Math.sign(dy)===Math.sign(acc))?acc+dy:dy;          // movimentos mínimos não fazem a barra piscar
    if(acc>24) nav.classList.add('is-hidden'); else if(acc<-16) nav.classList.remove('is-hidden');
  }

  /* ---- fit hero headline to the available width ---- */
  const title=$('.hero-title'), hero=$('.hero');
  function fitTitle(){
    if(innerWidth<900){title.style.fontSize='';return}
    title.style.fontSize='100px';
    const w=Math.max(...[...title.children].map(c=>c.offsetWidth));
    const cs=getComputedStyle(hero); const avail=hero.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
    title.style.fontSize=Math.min(100*avail*.96/w,196).toFixed(1)+'px';
  }
  fitTitle(); if(document.fonts&&document.fonts.ready) document.fonts.ready.then(fitTitle);
  addEventListener('resize',fitTitle);

  /* ---- 04 áreas: hover (desktop) / toque e teclado ---- */
  const areas=$('.js-areas'), abtn=$('.areas-btn',areas);
  const hoverMode=()=>matchMedia('(hover: hover) and (min-width: 900px)').matches;
  function setAreas(open){areas.classList.toggle('is-open',open); abtn.setAttribute('aria-expanded',String(open)); $$('.areas-list a',areas).forEach(a=>a.tabIndex=open?0:-1)}
  setAreas(false);
  abtn.addEventListener('click',e=>{ if(hoverMode()&&e.detail>0){setAreas(true);return} setAreas(!areas.classList.contains('is-open')) });
  areas.addEventListener('mouseenter',()=>{ if(hoverMode()) setAreas(true) });
  areas.addEventListener('mouseleave',()=>{ if(hoverMode()&&!areas.contains(document.activeElement)) setAreas(false) });
  areas.addEventListener('focusout',e=>{ if(!areas.contains(e.relatedTarget)&&!areas.matches(':hover')) setAreas(false) });
  areas.addEventListener('keydown',e=>{ if(e.key==='Escape'){setAreas(false); abtn.focus()} });
  $$('.areas-list a',areas).forEach(a=>a.addEventListener('click',e=>{
    e.preventDefault(); const card=document.getElementById(a.dataset.svc); if(!card) return;
    card.classList.remove('rv-pending'); card.style.transitionDelay='0ms';
    card.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'});
    setTimeout(()=>{card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); card.setAttribute('tabindex','-1'); card.focus({preventScroll:true})}, reduce?0:650);
  }));

  /* ---- BPO Financeiro: painel lateral. <dialog> modal: foco preso, fundo inerte e Escape são nativos;
         aqui ficam a animação, o clique fora, a rolagem travada e a volta do foco ao botão que abriu ---- */
  const bpo=$('#bpo-painel');
  if(bpo&&bpo.showModal){
    const bBody=$('.bpo-body',bpo); let opener=null, tClose=0;
    function openBpo(from){
      opener=from; clearTimeout(tClose); bpo.classList.remove('is-closing');
      if(!bpo.open) bpo.showModal();
      document.body.classList.add('bpo-lock'); bBody.scrollTop=0;
      $('.js-bpo-close',bpo).focus({preventScroll:true});
      requestAnimationFrame(()=>requestAnimationFrame(()=>bpo.classList.add('is-open')));
    }
    function closeBpo(){
      if(!bpo.open||bpo.classList.contains('is-closing')) return;
      bpo.classList.remove('is-open'); bpo.classList.add('is-closing');
      tClose=setTimeout(()=>bpo.close(), reduce?0:480);
    }
    bpo.addEventListener('close',()=>{
      clearTimeout(tClose); bpo.classList.remove('is-open','is-closing'); document.body.classList.remove('bpo-lock');
      if(opener&&opener.isConnected) opener.focus({preventScroll:true});
    });
    bpo.addEventListener('cancel',e=>{ e.preventDefault(); closeBpo() });
    bpo.addEventListener('click',e=>{ if(!e.target.closest('.bpo-panel')) closeBpo() });
    // Tab dá a volta dentro do painel (sem isso o foco sai para a barra do navegador)
    bpo.addEventListener('keydown',e=>{
      if(e.key!=='Tab') return;
      const f=$$('button,a[href]',bpo).filter(x=>x.offsetParent!==null); if(!f.length) return;
      const first=f[0], last=f[f.length-1];
      if(e.shiftKey&&(document.activeElement===first||!bpo.contains(document.activeElement))){e.preventDefault(); last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault(); first.focus()}
    });
    $$('.js-bpo-close',bpo).forEach(b=>b.addEventListener('click',closeBpo));
    $$('.js-bpo-open').forEach(b=>b.addEventListener('click',()=>openBpo(b)));
  }

  mode(); onScroll();
  addEventListener('scroll',()=>requestAnimationFrame(onScroll),{passive:true});
  addEventListener('resize',()=>{mode(); cur=''; onScroll()});
})();
