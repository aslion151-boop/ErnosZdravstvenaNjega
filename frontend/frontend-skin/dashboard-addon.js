/* Ernos Zdravstvena Njega - daily operations dashboard */
(function(){
  var rendered=false;
  var timer=null;

  function $(s){return document.querySelector(s);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function fmt(v){if(!v)return '-';try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);}}
  function patientName(x){return x.patient_name||String((x.first_name||'')+' '+(x.last_name||'')).trim()||'Pacijent';}
  function setTitle(t){var c=$('#crumbs');if(c)c.textContent=t;document.title='Ernos Zdravstvena Njega - '+t;}
  function ensureNav(){
    var nav=$('#nav'); if(!nav||$('#navToday'))return;
    var a=document.createElement('a'); a.href='#today'; a.id='navToday'; a.textContent='Danas';
    nav.insertBefore(a,nav.firstChild);
  }
  function actions(x){
    var html='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">';
    if(x.scan_url)html+='<a class="btn small" href="'+esc(x.scan_url)+'">Scan</a>';
    if(x.patient_id)html+='<a class="btn small ghost" href="#patient?id='+esc(x.patient_id)+'">Profil</a>';
    html+='</div>'; return html;
  }
  function plannedCard(x){
    return '<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff">'+
      '<strong>'+esc(patientName(x))+'</strong><div class="muted">'+esc(x.address||'')+'</div>'+ 
      '<div style="margin-top:6px"><strong>'+esc(x.visit_type||'Posjeta')+'</strong></div>'+ 
      '<div class="muted">Vrijeme: '+esc(fmt(x.planned_for))+(x.window_text?' · okvir: '+esc(x.window_text):'')+'</div>'+ 
      (x.instructions?'<div class="muted" style="margin-top:6px">'+esc(x.instructions)+'</div>':'')+actions(x)+'</div>';
  }
  function openCard(x){
    return '<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff">'+
      '<strong>'+esc(patientName(x))+'</strong><div class="muted">'+esc(x.address||'')+'</div>'+ 
      '<div style="margin-top:6px;color:var(--ok)"><strong>Njega u tijeku</strong></div>'+ 
      '<div class="muted">Početak: '+esc(fmt(x.started_at))+(x.started_by_name?' · '+esc(x.started_by_name):'')+'</div>'+ 
      (x.start_note?'<div class="muted" style="margin-top:6px">'+esc(x.start_note)+'</div>':'')+actions(x)+'</div>';
  }
  function finishedCard(x){
    var parts=[]; if(x.performed_procedures)parts.push(x.performed_procedures); if(x.care_plan_done)parts.push('Plan: '+x.care_plan_done); if(x.therapy_done)parts.push('Terapija: '+x.therapy_done);
    return '<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff">'+
      '<strong>'+esc(patientName(x))+'</strong><div class="muted">'+esc(x.address||'')+'</div>'+ 
      '<div style="margin-top:6px"><strong>Završeno</strong></div>'+ 
      '<div class="muted">Završetak: '+esc(fmt(x.finished_at))+(x.finished_by_name?' · '+esc(x.finished_by_name):'')+'</div>'+ 
      (parts.length?'<div class="muted" style="margin-top:6px">'+esc(parts.join(' · '))+'</div>':'')+actions(x)+'</div>';
  }
  function listHtml(items,fn,empty){
    if(!items||!items.length)return '<div class="empty">'+esc(empty)+'</div>';
    var html='<div style="display:grid;gap:10px">'; for(var i=0;i<items.length;i++)html+=fn(items[i]); html+='</div>'; return html;
  }
  function render(){
    ensureNav();
    var route=(location.hash||'').split('?')[0]; if(route!=='#today')return;
    var view=$('#view'); if(!view)return; setTitle('Danas'); rendered=true;
    view.innerHTML='<div class="card"><h2>Danas</h2><p class="muted">Dnevna operativna ploča: planirane posjete, otvorene njege i završene posjete danas.</p><div id="todayStatus" class="muted">Učitavanje...</div></div>';
    api('/api/care/dashboard/today').then(function(data){
      var counts=data.counts||{};
      view.innerHTML='<div class="card"><h2>Danas</h2><p class="muted">Pregled rada za današnji dan. Koristi Scan za brzi ulazak u QR/NFC workflow.</p>'+ 
        '<div class="grid cols-3" style="margin-top:12px">'+
          '<div class="tag" style="justify-content:center;font-weight:900">Planirano: '+esc(counts.planned||0)+'</div>'+ 
          '<div class="tag" style="justify-content:center;font-weight:900">U tijeku: '+esc(counts.open||0)+'</div>'+ 
          '<div class="tag" style="justify-content:center;font-weight:900">Završeno: '+esc(counts.finished||0)+'</div>'+ 
        '</div><div style="margin-top:12px"><button class="btn ghost" id="refreshToday" type="button">Osvježi</button></div></div>'+ 
        '<div class="card"><h3>Planirano danas / uskoro</h3>'+listHtml(data.planned||[],plannedCard,'Nema planiranih posjeta za danas.')+'</div>'+ 
        '<div class="card"><h3>Njega u tijeku</h3>'+listHtml(data.open||[],openCard,'Nema otvorenih posjeta.')+'</div>'+ 
        '<div class="card"><h3>Završeno danas</h3>'+listHtml(data.finished||[],finishedCard,'Još nema završenih posjeta danas.')+'</div>';
      var b=$('#refreshToday'); if(b)b.onclick=function(){rendered=false;render();};
    }).catch(function(err){view.innerHTML='<div class="alert err">Greška: '+esc(err.message||err)+'</div>';});
  }
  function schedule(){ensureNav(); if(timer)clearTimeout(timer); timer=setTimeout(function(){timer=null;render();},250);}
  window.addEventListener('hashchange',function(){rendered=false;schedule();});
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){ensureNav();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();
