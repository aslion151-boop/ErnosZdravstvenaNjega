/* Ernos Zdravstvena Njega - scan note templates */
(function(){
  if(window.__ernosScanTemplatesLoaded)return;window.__ernosScanTemplatesLoaded=true;
  var timer=null;
  function $(s){return document.querySelector(s);} 
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  var templates=[
    'Pacijent stabilan tijekom posjete.',
    'Terapija primijenjena prema planu.',
    'Vitalni znakovi provjereni.',
    'Njega/previjanje odrađeno bez komplikacija.',
    'Obitelj obaviještena o stanju i provedenoj njezi.',
    'Pacijent educiran o daljnjoj njezi.',
    'Materijal nedostaje ili je pri kraju - potrebno nadopuniti.',
    'Potrebno obavijestiti liječnika / nadležnu osobu.',
    'Pacijent odbija dio postupka.',
    'Nema novih tegoba prema navodu pacijenta.'
  ];
  function insertText(t,txt){
    var cur=t.value||'';
    if(cur&&cur.slice(-1)!=='\n')cur+='\n';
    t.value=cur+txt;
    try{t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}
    t.focus();
  }
  function addForTextarea(t,idx){
    if(!t||t.dataset.ernosTemplates==='1')return;
    var route=(location.hash||'').split('?')[0]; if(route!=='#scan')return;
    t.dataset.ernosTemplates='1';
    var box=document.createElement('div'); box.className='card'; box.id='scanTemplateBox'+idx; box.style.padding='10px'; box.style.margin='8px 0';
    var html='<div style="font-weight:800;margin-bottom:6px">Brze napomene</div><div style="display:flex;gap:6px;flex-wrap:wrap">';
    for(var i=0;i<templates.length;i++)html+='<button class="btn ghost small" type="button" data-scan-template="'+i+'">'+esc(templates[i].slice(0,34))+(templates[i].length>34?'...':'')+'</button>';
    html+='</div>';
    box.innerHTML=html;
    t.parentNode.insertBefore(box,t);
    box.addEventListener('click',function(ev){var b=ev.target&&ev.target.closest?ev.target.closest('[data-scan-template]'):null;if(!b)return;var i=Number(b.getAttribute('data-scan-template'));if(Number.isFinite(i)&&templates[i])insertText(t,templates[i]);});
  }
  function run(){
    var route=(location.hash||'').split('?')[0]; if(route!=='#scan')return;
    var areas=document.querySelectorAll('#view textarea');
    for(var i=0;i<areas.length;i++)addForTextarea(areas[i],i);
  }
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;run();},250);} 
  window.addEventListener('hashchange',schedule);document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();