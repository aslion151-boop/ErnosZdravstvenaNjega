/* Ernos Zdravstvena Njega - care alerts addon */
(function(){
  var timer=null;
  var rendered=false;

  function $(s){return document.querySelector(s);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function fmt(v){if(!v)return '-';try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);}}
  function setTitle(t){var c=$('#crumbs');if(c)c.textContent=t;document.title='Ernos Zdravstvena Njega - '+t;}

  function ensureNav(){
    var nav=$('#nav'); if(!nav||$('#navAlerts'))return;
    var a=document.createElement('a'); a.href='#care-alerts'; a.id='navAlerts'; a.textContent='Upozorenja';
    var today=$('#navToday'); if(today&&today.parentNode)today.parentNode.insertBefore(a,today.nextSibling); else nav.insertBefore(a,nav.firstChild);
  }

  function severityLabel(s){
    if(s==='high')return 'Visoko';
    if(s==='medium')return 'Srednje';
    return 'Nisko';
  }

  function severityStyle(s){
    if(s==='high')return 'border-color:#F1C9C9;background:#FDEEEE;color:#7A2A2A';
    if(s==='medium')return 'border-color:#F2D8A7;background:#FFF7E6;color:#7A4B00';
    return 'border-color:#D6E4F0;background:#F1F7FC;color:#244761';
  }

  function alertCard(a){
    var x=a.item||{};
    var html='<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff">'+
      '<div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">'+
        '<div><strong>'+esc(a.title||'Upozorenje')+'</strong><div class="muted">'+esc(x.patient_name||'Pacijent')+(x.address?' · '+esc(x.address):'')+'</div></div>'+ 
        '<span class="tag" style="'+severityStyle(a.severity)+'">'+esc(severityLabel(a.severity))+'</span>'+ 
      '</div>'+ 
      '<div style="margin-top:8px">'+esc(a.message||'')+'</div>';
    if(a.type==='overdue_planned_visit')html+='<div class="muted" style="margin-top:6px">Planirano: '+esc(fmt(x.planned_for))+(x.window_text?' · okvir: '+esc(x.window_text):'')+'</div>';
    if(a.type==='long_open_visit')html+='<div class="muted" style="margin-top:6px">Početak: '+esc(fmt(x.started_at))+(x.started_by_name?' · '+esc(x.started_by_name):'')+'</div>';
    if(a.type==='incomplete_visit_documentation')html+='<div class="muted" style="margin-top:6px">Završeno: '+esc(fmt(x.finished_at))+(x.finished_by_name?' · '+esc(x.finished_by_name):'')+'</div>';
    html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">';
    if(x.scan_url)html+='<a class="btn small" href="'+esc(x.scan_url)+'">Scan</a>';
    if(x.profile_url)html+='<a class="btn small ghost" href="'+esc(x.profile_url)+'">Profil</a>';
    if(x.patient_id)html+='<a class="btn small ghost" href="#patient-summary?id='+esc(x.patient_id)+'">Sažetak</a>';
    html+='</div></div>';
    return html;
  }

  function groupHtml(items,severity,title,emptyText){
    var arr=(items||[]).filter(function(a){return a.severity===severity;});
    if(!arr.length)return '<div class="card"><h3>'+esc(title)+'</h3><div class="empty">'+esc(emptyText)+'</div></div>';
    var html='<div class="card"><h3>'+esc(title)+' <span class="tag">'+arr.length+'</span></h3><div style="display:grid;gap:10px;margin-top:10px">';
    for(var i=0;i<arr.length;i++)html+=alertCard(arr[i]);
    return html+'</div></div>';
  }

  function render(){
    ensureNav();
    var route=(location.hash||'').split('?')[0]; if(route!=='#care-alerts')return;
    var view=$('#view'); if(!view)return; setTitle('Upozorenja'); rendered=true;
    view.innerHTML='<div class="card"><h2>Upozorenja</h2><p class="muted">Kontrola propusta: zakašnjele planirane posjete, dugo otvorene njege i nepotpuna dokumentacija.</p><div class="muted">Učitavanje...</div></div>';
    api('/api/care/alerts').then(function(data){
      var c=data.counts||{}; var alerts=data.alerts||[];
      view.innerHTML='<div class="card"><h2>Upozorenja</h2><p class="muted">Ovo nije medicinska odluka, nego operativna kontrola da se ništa ne izgubi u radu.</p>'+ 
        '<div class="grid cols-3" style="margin-top:12px">'+
          '<div class="tag" style="justify-content:center;font-weight:900">Visoko: '+esc(c.high||0)+'</div>'+ 
          '<div class="tag" style="justify-content:center;font-weight:900">Srednje: '+esc(c.medium||0)+'</div>'+ 
          '<div class="tag" style="justify-content:center;font-weight:900">Nisko: '+esc(c.low||0)+'</div>'+ 
        '</div><div style="margin-top:12px"><button class="btn ghost" id="refreshAlerts" type="button">Osvježi</button></div></div>'+ 
        groupHtml(alerts,'high','Visoka upozorenja','Nema visokih upozorenja.')+
        groupHtml(alerts,'medium','Srednja upozorenja','Nema srednjih upozorenja.')+
        groupHtml(alerts,'low','Niska upozorenja','Nema niskih upozorenja.');
      var b=$('#refreshAlerts'); if(b)b.onclick=function(){rendered=false;render();};
    }).catch(function(err){view.innerHTML='<div class="alert err">Greška: '+esc(err.message||err)+'</div>';});
  }

  function schedule(){ensureNav(); if(timer)clearTimeout(timer); timer=setTimeout(function(){timer=null;render();},250);}
  window.addEventListener('hashchange',function(){rendered=false;schedule();});
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){ensureNav();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();
