/* Ernos Zdravstvena Njega - field preparation addon */
(function(){
  if(window.__ernosFieldPrepLoaded)return;window.__ernosFieldPrepLoaded=true;
  var timer=null,lastData=null;
  function $(s){return document.querySelector(s);} 
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return(window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return'';}}
  function api(path){var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{headers:h}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function fmt(v){if(!v)return'-';try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);}}
  function nav(){var n=$('#nav');if(!n||$('#navFieldPrep'))return;var a=document.createElement('a');a.id='navFieldPrep';a.href='#field-prep';a.textContent='Teren';n.insertBefore(a,n.firstChild);}
  function setTitle(t){var c=$('#crumbs');if(c)c.textContent=t;document.title='Ernos Zdravstvena Njega - '+t;}
  function block(title,items,fn,empty){if(!items||!items.length)return'<div class="muted"><strong>'+esc(title)+':</strong> '+esc(empty)+'</div>';var html='<div style="margin-top:8px"><strong>'+esc(title)+'</strong><ul style="margin:6px 0 0 18px">';for(var i=0;i<items.length;i++)html+='<li>'+fn(items[i])+'</li>';return html+'</ul></div>';}
  function cleanLine(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function linesForItem(x){
    var out=[];
    out.push('PACIJENT: '+cleanLine(x.patient_name||'Pacijent'));
    out.push('ADRESA: '+cleanLine(x.address||'-'));
    if(x.phone)out.push('TELEFON: '+cleanLine(x.phone));
    out.push('POSJETA: '+cleanLine((x.visit_type||'Posjeta')+' · '+fmt(x.planned_for)+(x.window_text?' · '+x.window_text:'')));
    if(x.instructions)out.push('UPUTE: '+cleanLine(x.instructions));
    if(x.safety&&x.safety.length){out.push('SIGURNOST:');for(var i=0;i<x.safety.length;i++)out.push(' - '+cleanLine((x.safety[i].label||'Napomena')+': '+(x.safety[i].text||'')));}
    if(x.tasks&&x.tasks.length){out.push('ZADACI:');for(var j=0;j<x.tasks.length;j++){var t=x.tasks[j];out.push(' - '+cleanLine((t.priority||'')+' · '+(t.title||'')+(t.due_text?' · rok: '+t.due_text:'')+(t.details?' — '+t.details:'')));}}
    if(x.supplies&&x.supplies.length){out.push('MATERIJALI:');for(var k=0;k<x.supplies.length;k++){var s=x.supplies[k];out.push(' - '+cleanLine((s.status||'')+' · '+(s.item_name||'')+(s.quantity?' · '+s.quantity:'')+(s.location_note?' · '+s.location_note:'')+(s.note?' — '+s.note:'')));}}
    if(x.scan_url)out.push('SCAN: '+location.origin+x.scan_url);
    return out;
  }
  function checklistText(){
    var data=lastData||{};var items=data.items||[];var out=[];
    out.push('ERNOS - PRIPREMA ZA TEREN');
    out.push('Generirano: '+fmt(new Date().toISOString()));
    out.push('Broj posjeta: '+items.length);
    out.push('');
    if(!items.length)out.push('Nema planiranih posjeta za pripremu.');
    for(var i=0;i<items.length;i++){out.push('----------------------------------------');out=out.concat(linesForItem(items[i]));out.push('');}
    return out.join('\n');
  }
  function copyChecklist(){var txt=checklistText();if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){var b=$('#copyFieldPrep');if(b){b.textContent='Kopirano';setTimeout(function(){b.textContent='Kopiraj listu';},1200);}}).catch(function(){fallbackCopy(txt);});}else fallbackCopy(txt);}
  function fallbackCopy(txt){var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}ta.remove();var b=$('#copyFieldPrep');if(b){b.textContent='Kopirano';setTimeout(function(){b.textContent='Kopiraj listu';},1200);}}
  function printChecklist(){var txt=checklistText();var w=window.open('','_blank');if(!w){alert('Popup je blokiran. Koristi Kopiraj listu.');return;}w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Priprema za teren</title><style>body{font-family:Arial,sans-serif;padding:24px;white-space:pre-wrap;line-height:1.35}h1{font-size:20px}</style></head><body><h1>Priprema za teren</h1><pre>'+esc(txt)+'</pre></body></html>');w.document.close();w.focus();setTimeout(function(){try{w.print();}catch(e){}},300);}
  function card(x){
    var html='<div class="card" style="border-left:5px solid '+(x.supplies&&x.supplies.length?'#B45309':'var(--border)')+'">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h3>'+esc(x.patient_name||'Pacijent')+'</h3><p class="muted">'+esc(x.address||'-')+(x.phone?' · '+esc(x.phone):'')+'</p></div><div style="display:flex;gap:8px;flex-wrap:wrap">'+(x.scan_url?'<a class="btn small" href="'+esc(x.scan_url)+'">Scan</a>':'')+'<a class="btn small ghost" href="#patient?id='+esc(x.patient_id)+'">Profil</a><a class="btn small ghost" href="#patient-summary?id='+esc(x.patient_id)+'">Sažetak</a></div></div>'+
      '<div class="tag" style="margin-top:8px">'+esc(x.visit_type||'Posjeta')+' · '+esc(fmt(x.planned_for))+(x.window_text?' · '+esc(x.window_text):'')+'</div>'+(x.instructions?'<p style="margin-top:8px"><strong>Upute:</strong> '+esc(x.instructions)+'</p>':'');
    html+=block('Sigurnosne napomene',x.safety,function(s){return'<strong>'+esc(s.label)+':</strong> '+esc(s.text);},'nema upisanih sigurnosnih napomena');
    html+=block('Otvoreni zadaci',x.tasks,function(t){return esc(t.priority||'')+' · '+esc(t.title||'')+(t.due_text?' · rok: '+esc(t.due_text):'')+(t.details?' — '+esc(t.details):'');},'nema otvorenih zadataka');
    html+=block('Materijal za ponijeti/provjeriti',x.supplies,function(s){return esc(s.status||'')+' · '+esc(s.item_name||'')+(s.quantity?' · '+esc(s.quantity):'')+(s.location_note?' · '+esc(s.location_note):'')+(s.note?' — '+esc(s.note):'');},'nema materijala označenog kao nisko/naručiti');
    return html+'</div>';
  }
  function render(){nav();var route=(location.hash||'').split('?')[0];if(route!=='#field-prep')return;var view=$('#view');if(!view)return;setTitle('Priprema za teren');view.innerHTML='<div class="card"><h2>Priprema za teren</h2><p class="muted">Učitavanje planiranih posjeta, zadataka, sigurnosnih napomena i materijala...</p></div>';api('/api/care/field-prep?days=2').then(function(data){lastData=data||{};var counts=data.counts||{};var html='<div class="card"><h2>Priprema za teren</h2><p class="muted">Planirane posjete danas/uskoro s bitnim stvarima koje treba provjeriti prije polaska.</p><div class="grid cols-4" style="margin-top:12px"><div class="tag">Posjete: '+esc(counts.visits||0)+'</div><div class="tag">Sigurnost: '+esc(counts.with_safety||0)+'</div><div class="tag">Zadaci: '+esc(counts.with_tasks||0)+'</div><div class="tag">Materijali: '+esc(counts.with_supplies||0)+'</div></div><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" id="refreshFieldPrep" type="button">Osvježi</button><button class="btn" id="copyFieldPrep" type="button">Kopiraj listu</button><button class="btn ghost" id="printFieldPrep" type="button">Print lista</button></div></div>';var items=data.items||[];if(!items.length)html+='<div class="card"><div class="empty">Nema planiranih posjeta za pripremu.</div></div>';for(var i=0;i<items.length;i++)html+=card(items[i]);view.innerHTML=html;var b=$('#refreshFieldPrep');if(b)b.onclick=render;var c=$('#copyFieldPrep');if(c)c.onclick=copyChecklist;var p=$('#printFieldPrep');if(p)p.onclick=printChecklist;}).catch(function(err){view.innerHTML='<div class="alert err">Greška: '+esc(err.message||err)+'</div>';});}
  function schedule(){nav();if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;render();},200);} 
  window.addEventListener('hashchange',schedule);document.addEventListener('DOMContentLoaded',schedule);try{new MutationObserver(function(){nav();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}if(document.readyState!=='loading')schedule();
})();