/* Ernos Zdravstvena Njega - planned visit schedule addon */
(function(){
  var renderedProfileId='';
  var busyKey='';
  var timer=null;

  function $(s){return document.querySelector(s);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function params(){return new URLSearchParams((location.hash.split('?')[1]||''));}
  function fmt(v){if(!v)return '-';try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);}}
  function val(id){var n=document.getElementById(id);return n?n.value:'';}
  function setTitle(t){var c=$('#crumbs');if(c)c.textContent=t;document.title='Ernos Zdravstvena Njega - '+t;}

  function addNav(){
    var nav=$('#nav'); if(!nav||$('#scheduleNav'))return;
    var a=document.createElement('a'); a.id='scheduleNav'; a.href='#schedule'; a.textContent='Raspored'; nav.appendChild(a);
  }
  function activeNav(){var a=$('#scheduleNav');if(!a)return; if((location.hash||'').split('?')[0]==='#schedule')a.classList.add('active');else a.classList.remove('active');}

  function statusText(s){if(s==='done')return 'Odrađeno'; if(s==='cancelled')return 'Otkazano'; return 'Planirano';}
  function statusColor(s){if(s==='done')return 'var(--ok)'; if(s==='cancelled')return 'var(--err)'; return 'var(--warn)';}

  function scheduleRows(items, showPatient){
    if(!items||!items.length)return '<div class="empty">Nema planiranih posjeta.</div>';
    var html='<div class="table-wrap"><table><thead><tr><th>Status</th>'+(showPatient?'<th>Pacijent</th>':'')+'<th>Vrijeme</th><th>Tip</th><th>Upute</th><th>Akcija</th></tr></thead><tbody>';
    for(var i=0;i<items.length;i++){
      var r=items[i];
      html+='<tr><td><strong style="color:'+statusColor(r.status)+'">'+esc(statusText(r.status))+'</strong></td>'+ 
        (showPatient?'<td>'+esc(r.patient_name||'-')+'<br><span class="muted">'+esc(r.address||'')+'</span></td>':'')+
        '<td>'+esc(fmt(r.planned_for))+(r.window_text?'<br><span class="muted">'+esc(r.window_text)+'</span>':'')+'</td>'+ 
        '<td>'+esc(r.visit_type||'-')+'</td>'+ 
        '<td>'+esc(r.instructions||'-')+'</td>'+ 
        '<td style="white-space:nowrap">'+(r.status==='planned'?'<button class="btn small markSchedule" data-id="'+esc(r.id)+'" data-status="done" type="button">Odrađeno</button> <button class="btn small ghost markSchedule" data-id="'+esc(r.id)+'" data-status="cancelled" type="button">Otkaži</button>':'-')+'</td></tr>';
    }
    html+='</tbody></table></div>'; return html;
  }

  function bindStatus(refresh){
    var btns=document.querySelectorAll('.markSchedule');
    for(var i=0;i<btns.length;i++)if(!btns[i].__bound){btns[i].__bound=true;btns[i].onclick=function(){
      var id=this.getAttribute('data-id'); var st=this.getAttribute('data-status'); var b=this; b.disabled=true; b.textContent='Spremam...';
      api('/api/care/schedule/'+encodeURIComponent(id),{method:'PATCH',body:{status:st}}).then(refresh).catch(function(e){alert('Greška: '+(e.message||e));b.disabled=false;});
    };}
  }

  function renderProfile(patientId, force){
    var view=$('#view'); if(!view||!patientId)return;
    if(!force&&renderedProfileId===patientId&&$('#scheduleProfileCard'))return;
    var active=document.activeElement; if(!force&&active&&$('#scheduleProfileCard')&&$('#scheduleProfileCard').contains(active))return;
    var key='profile:'+patientId; if(busyKey===key)return; busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/schedule?status=all').then(function(data){
      var v=$('#view'); if(!v)return; var old=$('#scheduleProfileCard'); if(old&&old.parentNode)old.parentNode.removeChild(old);
      var card=document.createElement('div'); card.className='card'; card.id='scheduleProfileCard';
      card.innerHTML='<h3>Planirane posjete</h3><p class="muted">Planiraj sljedeću posjetu za ovog pacijenta.</p>'+ 
        '<div class="grid cols-3"><div><label>Datum i vrijeme</label><input id="scheduleAt" type="datetime-local"></div><div><label>Vremenski okvir</label><input id="scheduleWindow" placeholder="npr. jutro / 08-10h"></div><div><label>Tip posjete</label><input id="scheduleType" placeholder="npr. previjanje, terapija"></div></div>'+ 
        '<label style="margin-top:10px">Upute</label><textarea id="scheduleInstructions" rows="2" placeholder="Što treba napraviti / na što obratiti pažnju..."></textarea>'+ 
        '<div style="margin-top:10px"><button class="btn" id="addSchedule" type="button">Dodaj planiranu posjetu</button></div>'+ 
        '<div style="margin-top:12px">'+scheduleRows(data.items||[],false)+'</div>';
      var care=$('#carePlanCard'); var therapy=$('#therapyCard'); var qr=$('#realScanCard');
      if(care&&care.parentNode)care.parentNode.insertBefore(card,care); else if(therapy&&therapy.parentNode)therapy.parentNode.insertBefore(card,therapy); else if(qr&&qr.parentNode)qr.parentNode.insertBefore(card,qr); else v.appendChild(card);
      renderedProfileId=patientId;
      var add=$('#addSchedule'); if(add)add.onclick=function(){
        add.disabled=true; add.textContent='Spremam...';
        api('/api/care/patients/'+encodeURIComponent(patientId)+'/schedule',{method:'POST',body:{planned_for:val('scheduleAt'),window_text:val('scheduleWindow'),visit_type:val('scheduleType'),instructions:val('scheduleInstructions')}}).then(function(){renderedProfileId='';renderProfile(patientId,true);}).catch(function(e){alert('Greška: '+(e.message||e));add.disabled=false;add.textContent='Dodaj planiranu posjetu';});
      };
      bindStatus(function(){renderedProfileId='';renderProfile(patientId,true);});
    }).catch(function(e){console.warn('[schedule-addon] profile failed',e);}).then(function(){if(busyKey===key)busyKey='';});
  }

  function renderSchedulePage(){
    var route=(location.hash||'').split('?')[0]; if(route!=='#schedule')return false;
    var view=$('#view'); if(!view)return true;
    setTitle('Raspored posjeta'); activeNav();
    view.innerHTML='<div class="card"><h2>Raspored posjeta</h2><p class="muted">Pregled planiranih, odrađenih i otkazanih posjeta.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><select id="scheduleStatus" style="max-width:220px"><option value="planned">Planirano</option><option value="all">Sve</option><option value="done">Odrađeno</option><option value="cancelled">Otkazano</option></select><button class="btn" id="scheduleRefresh" type="button">Osvježi</button></div></div><div class="card"><div id="scheduleRows" class="muted">Učitavanje...</div></div>';
    function load(){
      var st=val('scheduleStatus')||'planned';
      api('/api/care/schedule?status='+encodeURIComponent(st)).then(function(data){
        var node=$('#scheduleRows'); if(!node)return; node.innerHTML=scheduleRows(data.items||[],true); bindStatus(load);
      }).catch(function(e){var node=$('#scheduleRows');if(node)node.innerHTML='<div class="alert err">Greška: '+esc(e.message||e)+'</div>';});
    }
    var btn=$('#scheduleRefresh'); if(btn)btn.onclick=load; var sel=$('#scheduleStatus'); if(sel)sel.onchange=load; load(); return true;
  }

  function run(){addNav(); activeNav(); if(renderSchedulePage())return; var route=(location.hash||'').split('?')[0]; if(route==='#patient'){var id=params().get('id')||''; if(id)renderProfile(id,false);}}
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;run();},250);}
  window.addEventListener('hashchange',function(){renderedProfileId='';busyKey='';schedule();});
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){schedule();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();
