/* Ernos Zdravstvena Njega - reports addon */
(function(){
  var routeLoaded = false;

  function $(s){ return document.querySelector(s); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;}); }
  function token(){ try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';} }
  function api(path, opts){ opts=opts||{}; var h={'Content-Type':'application/json'}; var t=token(); if(t)h.Authorization='Bearer '+t; return fetch(location.origin+path,{method:opts.method||'GET',headers:h,body:opts.body?JSON.stringify(opts.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null; try{j=txt?JSON.parse(txt):null;}catch(e){} if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status)); return j||{};});}); }
  function fmt(v){ if(!v)return '-'; try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);} }
  function setTitle(t){ var c=$('#crumbs'); if(c)c.textContent=t; document.title='Ernos Zdravstvena Njega - '+t; }
  function duration(r){ return r.duration_minutes?String(r.duration_minutes)+' min':(r.finished_at?'-':'u tijeku'); }

  function addNav(){
    var nav=$('#nav'); if(!nav || $('#careReportsNav')) return;
    var a=document.createElement('a');
    a.id='careReportsNav';
    a.href='#care-reports';
    a.textContent='Izvještaji';
    nav.appendChild(a);
  }

  function updateNavActive(){
    var route=(location.hash||'').split('?')[0];
    var a=$('#careReportsNav');
    if(!a) return;
    if(route==='#care-reports') a.classList.add('active'); else a.classList.remove('active');
  }

  function row(r){
    var patient=r.patient_name||'-';
    var family=r.family_notification_status?('Obitelj: '+r.family_notification_status):'-';
    return '<tr>'+ 
      '<td><strong>'+esc(r.status||'-')+'</strong></td>'+ 
      '<td>'+esc(patient)+'<br><span class="muted">'+esc(r.address||'')+'</span></td>'+ 
      '<td>'+esc(fmt(r.started_at))+'<br><span class="muted">'+esc(r.started_by_name||'')+'</span></td>'+ 
      '<td>'+esc(r.finished_at?fmt(r.finished_at):'-')+'<br><span class="muted">'+esc(r.finished_by_name||'')+'</span></td>'+ 
      '<td>'+esc(duration(r))+'</td>'+ 
      '<td>'+esc(r.performed_procedures||'-')+(r.care_plan_done?'<br><span class="muted">Plan: '+esc(r.care_plan_done)+'</span>':'')+'</td>'+ 
      '<td>'+esc(family)+'</td>'+ 
    '</tr>';
  }

  function renderReports(){
    var route=(location.hash||'').split('?')[0];
    if(route !== '#care-reports') return false;
    var view=$('#view'); if(!view) return true;
    setTitle('Izvještaji posjeta');
    updateNavActive();
    view.innerHTML='<div class="card"><h2>Izvještaji posjeta</h2><p class="muted">Pregled zadnjih posjeta, statusa, trajanja, postupaka i obiteljskih obavijesti.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input id="reportSearch" placeholder="Pretraži pacijenta/adresu" style="max-width:320px"><button class="btn" id="reportRefresh" type="button">Osvježi</button><a class="btn ghost" id="reportCsv" href="/api/care/reports/visits.csv" target="_blank">CSV export</a></div></div><div class="card"><div id="reportRows" class="muted">Učitavanje...</div></div>';
    function load(){
      var q=$('#reportSearch')?$('#reportSearch').value:'';
      var url='/api/care/reports/visits?limit=100';
      if(q) url+='&q='+encodeURIComponent(q);
      var csv=$('#reportCsv'); if(csv) csv.href='/api/care/reports/visits.csv'+(q?('?q='+encodeURIComponent(q)):'');
      api(url).then(function(data){
        var items=data.items||[];
        var node=$('#reportRows'); if(!node) return;
        if(!items.length){ node.innerHTML='<div class="empty">Nema posjeta za prikaz.</div>'; return; }
        var html='<div class="table-wrap"><table><thead><tr><th>Status</th><th>Pacijent</th><th>Početak</th><th>Završetak</th><th>Trajanje</th><th>Postupci</th><th>Obitelj</th></tr></thead><tbody>';
        for(var i=0;i<items.length;i++) html+=row(items[i]);
        html+='</tbody></table></div>';
        node.innerHTML=html;
      }).catch(function(err){ var node=$('#reportRows'); if(node)node.innerHTML='<div class="alert err">Greška: '+esc(err.message||err)+'</div>'; });
    }
    var btn=$('#reportRefresh'); if(btn)btn.onclick=load;
    var input=$('#reportSearch'); if(input)input.onkeydown=function(e){ if(e.key==='Enter') load(); };
    load();
    routeLoaded = true;
    return true;
  }

  function run(){
    addNav();
    updateNavActive();
    renderReports();
  }

  window.addEventListener('hashchange',function(){ routeLoaded=false; setTimeout(run,80); });
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(run,250); });
  try{ new MutationObserver(function(){ setTimeout(addNav,120); }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  if(document.readyState!=='loading') setTimeout(run,250);
})();
