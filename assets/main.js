/* SovereignMan OÜ — shared page behavior */
(function(){
  const yearNow = new Date().getFullYear();

  function applyLang(lang){
    if(!SM_TRANSLATIONS[lang]) return;
    document.documentElement.lang = lang;
    const dict = SM_TRANSLATIONS[lang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if(dict[key] !== undefined) el.innerHTML = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if(dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
    });
    const fc = document.getElementById('footerCopy');
    if(fc && dict.footer_copy) fc.textContent = dict.footer_copy.replace('{year}', yearNow);
    document.querySelectorAll('.lang-switch button').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });
    try{ sessionStorage.setItem('sm_lang', lang); }catch(e){}
  }
  window.SM_applyLang = applyLang;

  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('.lang-switch button').forEach(btn => {
      btn.addEventListener('click', () => applyLang(btn.getAttribute('data-lang')));
    });

    let startLang = 'en';
    try{
      const saved = sessionStorage.getItem('sm_lang');
      if(saved && SM_TRANSLATIONS[saved]) startLang = saved;
    }catch(e){}
    applyLang(startLang);

    const navToggle = document.getElementById('navToggle');
    const navList = document.getElementById('navlist');
    if(navToggle && navList){
      navToggle.addEventListener('click', () => navList.classList.toggle('open'));
      navList.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navList.classList.remove('open')));
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if(e.isIntersecting){ e.target.style.opacity = 1; e.target.style.transform='translateY(0)'; } });
    }, {threshold:0.1});
    document.querySelectorAll('.card, .step').forEach(el => {
      el.style.opacity = 0; el.style.transform = 'translateY(16px)'; el.style.transition = '.6s ease';
      io.observe(el);
    });

    const canvas = document.getElementById('matrix');
    if(canvas){
      const ctx = canvas.getContext('2d');
      let w, h, columns, drops;
      const glyphs = "01SOVEREIGNMANOSINT<>[]{}#$%&*/\\;:.,~^ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ";
      const colors = ['#14e0ff','#2d6bff','#8b2fff'];

      function resize(){
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        const fontSize = 15;
        columns = Math.floor(w / fontSize);
        drops = new Array(columns).fill(1);
      }
      window.addEventListener('resize', resize);
      resize();

      function draw(){
        ctx.fillStyle = 'rgba(5,5,15,0.07)';
        ctx.fillRect(0,0,w,h);
        ctx.font = '15px monospace';
        for (let i=0; i<drops.length; i++){
          const text = glyphs[Math.floor(Math.random()*glyphs.length)];
          ctx.fillStyle = colors[i % colors.length];
          ctx.fillText(text, i*15, drops[i]*15);
          if (drops[i]*15 > h && Math.random() > 0.975){
            drops[i] = 0;
          }
          drops[i]++;
        }
      }
      setInterval(draw, 45);
    }
  });
})();
