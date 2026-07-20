/* Ernos Zdravstvena Njega - patient handover / print summary */
(function(){
  var timer=null;
  var renderedKey='';

  function $(s){return document.querySelector(s);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function params(){return new URLSearchParams((location.hash.split('?')[1]||''));}
  function fmt(v){if(!v)return '-';try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);}}
  function dateOnly(v){if(!v)return '-';try{return new Date(v).toLocaleDateString('hr-HR');}catch(e){return String(v);}}
  function full(p){return String((p.first_name||'')+' '+(p.last_name||'')).trim()||'Pacijent';}
  function setTitle(t){var c=$('#crumbs');if(c)c.textContent=t;document.title='Ernos Zdravstvena Njega - '+t;}
  function loadAddon(src,flag,label){if(window[flag]||document.querySelector('script[src^="'+src.split('?')[0]+'"]'))return;window[flag]=true;var s=document.createElement('script');s.src=src;s.onload=function(){window[flag]=false;};s.onerror=function(){window[flag]=false;console.warn('[patient-summary-addon] '+label+' load failed');};document.head.appendChild(s);}
  function ensureSafetyLoaded(){loadAddon('/patient-safety-addon.js?v=20260708-1','__ernosPatientSafetyLoading','safety');}
  function ensureAlertsLoaded(){loadAddon('/alerts-addon.js?v=20260708-1','__ernosAlertsLoading','alerts');}
  function ensureAddons(){ensureSafetyLoaded();ensureAlertsLoaded();}

  function ensureProfileButton(){
    ensureAddons();
    var route=(location.hash||'').split('?')[0]; if(route!=='#patient')return;
    var id=params().get('id')||''; if(!id||$('#patientSummaryBtn'))return;
    var target=$('#realScanCard')||$('#patientEditCard')||$('#therapyCard')||$('#carePlanCard');
    var view=$('#view'); if(!view)return;
    var box=document.createElement('div'); box.className='card'; box.id='patientSummaryCard';
    box.innerHTML='<h3>Sažetak pacijenta</h3><p class="muted">Brzi sažetak za ispis, predaju smjene ili pregled prije terena.</p><a class="btn" id="patientSummaryBtn" href="#patient-summary?id='+esc(id)+'">Otvori sažetak</a>';
    if(target&&target.parentNode)target.parentNode.insertBefore(box,target);else view.appendChild(box);
  }

  function section(title,body){return '<section class="card"><h3>'+esc(title)+'</h3>'+body+'</section>';}
  function empty(txt){return '<div class="empty">'+esc(txt)+'</div>';}
  function simpleList(items,fn,none){if(!items||!items.length)return empty(none);var html='<div style="display:grid;gap:8px">';for(var i=0;i<items.length;i++)html+=fn(items[i]);return html+'</div>';}

  function patientBlock(p){
    return '<div class="grid cols-2">'+
      '<div><strong>Ime i prezime</strong><br>'+esc(full(p))+'</div>'+ 
      '<div><strong>Datum rođenja</strong><br>'+esc(dateOnly(p.date_of_birth))+'</div>'+ 
      '<div><strong>Adresa</strong><br>'+esc(p.address||'-')+'</div>'+ 
      '<div><strong>Telefon</strong><br>'+esc(p.phone||'-')+'</div>'+ 
      '<div><strong>Kontakt obitelji</strong><br>'+esc(String((p.family_contact_name||'')+' '+(p.family_contact_phone||'')).trim()||'-')+'</div>'+ 
      '<div><strong>Napomene</strong><br>'+esc(p.notes||'-')+'</div>'+ 
    '</div>';
  }
  function safetyBlock(p){
    var parts=[];
    if(p.allergies)parts.push('<div style="border:1px solid #F1C9C9;background:#FDEEEE;color:#7A2A2A;border-radius:12px;padding:10px"><strong>Alergije</strong><br>'+esc(p.allergies)+'</div>');
    if(p.risks)parts.push('<div style="border:1px solid #F3D7A0;background:#FFF6E0;border-radius:12px;padding:10px"><strong>Rizici / oprez</strong><br>'+esc(p.risks)+'</div>');
    if(p.diagnoses)parts.push('<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><strong>Važna stanja / dijagnoze</strong><br>'+esc(p.diagnoses)+'</div>');
    if(p.mobility_note)parts.push('<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><strong>Mobilnost / transfer</strong><br>'+esc(p.mobility_note)+'</div>');
    if(p.access_note)parts.push('<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><strong>Ulazak / kućne upute</strong><br>'+esc(p.access_note)+'</div>');
    return parts.length?'<div style="display:grid;gap:8px">'+parts.join('')+'</div>':empty('Nema upisanih sigurnosnih napomena.');
  }

  function carePlanBlock(data){return simpleList((data&&data.items)||[],function(x){return '<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><strong>'+esc(x.title||'-')+'</strong>'+(x.description?'<div class="muted">'+esc(x.description)+'</div>':'')+'</div>';},'Nema plana njege.');}
  function therapyBlock(data){return simpleList((data&&data.items)||[],function(x){return '<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><strong>'+esc(x.medicine_name||'Terapijska uputa')+'</strong>'+(x.dose?'<div>Doza: '+esc(x.dose)+'</div>':'')+(x.schedule_note?'<div>Vrijeme: '+esc(x.schedule_note)+'</div>':'')+(x.instructions?'<div class="muted">'+esc(x.instructions)+'</div>':'')+'</div>';},'Nema terapije/uputa.');}
  function scheduleBlock(data){return simpleList(((data&&data.items)||[]).slice(0,8),function(x){return '<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><strong>'+esc(x.visit_type||'Posjeta')+'</strong><div class="muted">'+esc(fmt(x.planned_for))+(x.window_text?' · '+esc(x.window_text):'')+' · '+esc(x.status||'planned')+'</div>'+(x.instructions?'<div>'+esc(x.instructions)+'</div>':'')+'</div>';},'Nema planiranih posjeta.');}
  function woundsBlock(data){
    var obs=(data&&data.observations)||[]; var by={}; for(var i=0;i<obs.length;i++){var k=String(obs[i].wound_id);if(!by[k])by[k]=[];by[k].push(obs[i]);}
    return simpleList((data&&data.items)||[],function(w){var last=(by[String(w.id)]||[])[0];return '<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><strong>'+esc(w.title||'Rana')+'</strong><div class="muted">'+esc(w.location||'-')+(w.wound_type?' · '+esc(w.wound_type):'')+'</div>'+(last?'<div style="margin-top:6px"><strong>Zadnje zapažanje:</strong> '+esc(fmt(last.observed_at))+'<br><span class="muted">'+esc([last.size_text?('Veličina: '+last.size_text):'',last.exudate?('Sekrecija: '+last.exudate):'',last.surrounding_skin?('Koža: '+last.surrounding_skin):'',last.pain_score?('Bol: '+last.pain_score+'/10'):''].filter(Boolean).join(' · ')||'-')+'</span>'+(last.note?'<div>'+esc(last.note)+'</div>':'')+(last.photo_url?'<img src="'+esc(last.photo_url)+'" alt="Fotografija rane" style="margin-top:8px;max-width:160px;border-radius:10px;border:1px solid var(--border)">':'')+'</div>':'')+'</div>';},'Nema aktivnih rana.');
  }
  function visitsBlock(data){return simpleList(((data&&data.items)||[]).slice(0,8),function(v){var status=v.finished_at?'Završeno':'U tijeku';var parts=[];if(v.performed_procedures)parts.push(v.performed_procedures);if(v.care_plan_done)parts.push('Plan: '+v.care_plan_done);if(v.therapy_done)parts.push('Terapija: '+v.therapy_done);if(v.wound_note)parts.push('Rana: '+v.wound_note);return '<div style="border:1px solid var(--border);border-radius:12px;padding:10px"><strong>'+esc(status)+'</strong><div class="muted">Početak: '+esc(fmt(v.started_at))+' · Završetak: '+esc(fmt(v.finished_at))+'</div>'+(parts.length?'<div>'+esc(parts.join(' · '))+'</div>':'')+(v.finish_note||v.start_note?'<div class="muted">'+esc(v.finish_note||v.start_note)+'</div>':'')+'</div>';},'Nema evidentiranih posjeta.');}

  function renderSummary(id){
    ensureAddons();
    var view=$('#view'); if(!view||!id)return; setTitle('Sažetak pacijenta'); renderedKey=id;
    view.innerHTML='<div class="card"><h2>Sažetak pacijenta</h2><p class="muted">Učitavanje...</p></div>';
    Promise.all([
      api('/api/patients'),
      api('/api/care/patients/'+encodeURIComponent(id)+'/plan').catch(function(){return {items:[]};}),
      api('/api/care/patients/'+encodeURIComponent(id)+'/therapy').catch(function(){return {items:[]};}),
      api('/api/care/patients/'+encodeURIComponent(id)+'/wounds').catch(function(){return {items:[],observations:[]};}),
      api('/api/care/patients/'+encodeURIComponent(id)+'/schedule?status=all').catch(function(){return {items:[]};}),
      api('/api/care/patients/'+encodeURIComponent(id)+'/visits').catch(function(){return {items:[]};})
    ]).then(function(all){
      var patients=(all[0]&&all[0].items)||[]; var p=null; for(var i=0;i<patients.length;i++){if(String(patients[i].id)===String(id)){p=patients[i];break;}}
      if(!p)throw new Error('Pacijent nije pronađen');
      view.innerHTML='<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><h2>'+esc(full(p))+'</h2><p class="muted">Sažetak za ispis / predaju smjene · generirano '+esc(fmt(new Date().toISOString()))+'</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="printSummary" type="button">Print</button><a class="btn ghost" href="#patient?id='+esc(id)+'">Natrag na profil</a></div></div></div>'+ 
        section('Osnovni podaci',patientBlock(p))+section('Sigurnosne napomene',safetyBlock(p))+section('Plan njege',carePlanBlock(all[1]))+section('Terapija / lijekovi',therapyBlock(all[2]))+section('Rane',woundsBlock(all[3]))+section('Planirane posjete',scheduleBlock(all[4]))+section('Zadnje posjete',visitsBlock(all[5]));
      var b=$('#printSummary'); if(b)b.onclick=function(){window.print();};
    }).catch(function(err){view.innerHTML='<div class="alert err">Greška: '+esc(err.message||err)+'</div>';});
  }

  function run(){ensureAddons();ensureProfileButton();var route=(location.hash||'').split('?')[0];if(route==='#patient-summary'){var id=params().get('id')||'';if(id&&renderedKey!==id)renderSummary(id);}}
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;run();},250);}
  window.addEventListener('hashchange',function(){renderedKey='';schedule();});
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){schedule();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();
