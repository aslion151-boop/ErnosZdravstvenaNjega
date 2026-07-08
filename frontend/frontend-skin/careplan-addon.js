/* Ernos Zdravstvena Njega - care plan addon */
(function(){
  var busyKey = '';
  var renderedProfileId = '';
  var renderedScanId = '';
  var runTimer = null;

  function $(s){ return document.querySelector(s); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;}); }
  function token(){ try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';} }
  function api(path, opts){ opts=opts||{}; var h={'Content-Type':'application/json'}; var t=token(); if(t)h.Authorization='Bearer '+t; return fetch(location.origin+path,{method:opts.method||'GET',headers:h,body:opts.body?JSON.stringify(opts.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null; try{j=txt?JSON.parse(txt):null;}catch(e){} if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status)); return j||{};});}); }
  function params(){ return new URLSearchParams((location.hash.split('?')[1]||'')); }

  function removeCarePlanCards(){
    var cards=document.querySelectorAll('.card');
    for(var i=cards.length-1;i>=0;i--){
      var txt=cards[i].textContent||'';
      if(txt.indexOf('Plan njege')>=0) cards[i].parentNode.removeChild(cards[i]);
    }
  }

  function planListHtml(items, editable){
    if(!items || !items.length) return '<div class="empty">Nema upisanog plana njege za ovog pacijenta.</div>';
    var html='<div style="display:grid;gap:8px">';
    for(var i=0;i<items.length;i++){
      var it=items[i]||{};
      html+='<div style="border:1px solid var(--border);border-radius:12px;padding:10px;background:#fff">'+
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'+
          '<div><strong>'+esc(it.title||'Stavka plana njege')+'</strong>'+(it.description?'<div class="muted" style="margin-top:4px">'+esc(it.description)+'</div>':'')+'</div>'+
          (editable?'<button class="btn ghost deletePlanItem" data-id="'+esc(it.id)+'" type="button">Ukloni</button>':'')+
        '</div></div>';
    }
    html+='</div>';
    return html;
  }

  function planChecklistHtml(items){
    if(!items || !items.length) return '<div class="empty">Nema upisanog plana njege za ovog pacijenta.</div>';
    var html='<div style="display:grid;gap:8px">';
    for(var i=0;i<items.length;i++){
      var it=items[i]||{};
      var label=(it.title||'Stavka plana njege')+(it.description?' - '+it.description:'');
      html+='<label style="display:flex;align-items:flex-start;gap:10px;border:1px solid var(--border);border-radius:12px;padding:10px;background:#fff;font-weight:650">'+
        '<input class="carePlanDone" type="checkbox" value="'+esc(label)+'" style="width:auto;min-height:0;margin-top:3px">'+
        '<span><strong>'+esc(it.title||'Stavka plana njege')+'</strong>'+(it.description?'<span class="muted" style="display:block;margin-top:4px">'+esc(it.description)+'</span>':'')+'</span>'+ 
      '</label>';
    }
    html+='</div>';
    return html;
  }

  function bindPlanButtons(patientId){
    var add=$('#addPlanItem');
    if(add && !add.__bound)add.onclick=function(){
      var title=$('#planTitle')?$('#planTitle').value:'';
      var description=$('#planDesc')?$('#planDesc').value:'';
      add.disabled=true; add.textContent='Spremam...';
      api('/api/care/patients/'+encodeURIComponent(patientId)+'/plan',{method:'POST',body:{title:title,description:description}}).then(function(){
        renderedProfileId=''; busyKey=''; renderProfilePlan(patientId,true);
      }).catch(function(err){ alert('Greška: '+(err.message||err)); add.disabled=false; add.textContent='Dodaj u plan njege'; });
    };
    if(add) add.__bound=true;
    var dels=document.querySelectorAll('.deletePlanItem');
    for(var i=0;i<dels.length;i++) if(!dels[i].__bound) dels[i].onclick=function(){
      var id=this.getAttribute('data-id');
      var btn=this; btn.disabled=true; btn.textContent='Uklanjam...';
      api('/api/care/plan/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){
        renderedProfileId=''; busyKey=''; renderProfilePlan(patientId,true);
      }).catch(function(err){ alert('Greška: '+(err.message||err)); btn.disabled=false; btn.textContent='Ukloni'; });
    };
    for(var j=0;j<dels.length;j++) dels[j].__bound=true;
  }

  function renderProfilePlan(patientId, force){
    var view=$('#view'); if(!view || !patientId) return;
    if(!force && renderedProfileId===patientId && $('#carePlanCard')) return;
    var active=document.activeElement;
    if(!force && active && $('#carePlanCard') && $('#carePlanCard').contains(active)) return;
    var key='profile:'+patientId;
    if(busyKey===key) return;
    busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/plan').then(function(data){
      var v=$('#view'); if(!v) return;
      removeCarePlanCards();
      var items=data.items||[];
      var card=document.createElement('div'); card.className='card'; card.id='carePlanCard'; card.setAttribute('data-patient-id', patientId);
      card.innerHTML='<h3>Plan njege</h3><p class="muted">Stalne upute i očekivani postupci za ovog pacijenta. Ovo tehničar vidi prije ili tijekom posjete.</p>'+ 
        '<div class="grid cols-2" style="align-items:end"><div><label>Naziv stavke</label><input id="planTitle" placeholder="npr. Previjanje kronične rane"></div><div><label>Kratki opis</label><input id="planDesc" placeholder="npr. kontrola sekrecije, zamjena obloga, edukacija"></div></div>'+ 
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="addPlanItem" type="button">Dodaj u plan njege</button></div>'+ 
        '<div id="planItems" style="margin-top:12px">'+planListHtml(items,true)+'</div>';
      var qr=document.getElementById('realScanCard');
      if(qr && qr.parentNode) qr.parentNode.insertBefore(card, qr.nextSibling); else v.appendChild(card);
      renderedProfileId=patientId;
      bindPlanButtons(patientId);
    }).catch(function(err){ console.warn('[careplan-addon] profile plan failed',err); }).then(function(){ if(busyKey===key) busyKey=''; });
  }

  function patientIdFromScanDom(){
    var a=document.querySelector('a[href^="#patient?id="]');
    if(!a) return '';
    try{ return new URLSearchParams((a.getAttribute('href').split('?')[1]||'')).get('id')||''; }catch(e){ return ''; }
  }

  function renderScanPlan(patientId, force){
    if(!patientId) return;
    if(!force && renderedScanId===patientId && $('#scanCarePlanCard')) return;
    var key='scan:'+patientId;
    if(busyKey===key) return;
    busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/plan').then(function(data){
      var view=$('#view'); if(!view) return;
      var existing=$('#scanCarePlanCard'); if(existing) existing.parentNode.removeChild(existing);
      var items=data.items||[];
      var isOpen=!!document.getElementById('toggleVisit') && (document.getElementById('toggleVisit').textContent||'').indexOf('Završetak')>=0;
      var card=document.createElement('div'); card.className='card'; card.id='scanCarePlanCard'; card.setAttribute('data-patient-id', patientId);
      card.innerHTML='<h3>Plan njege</h3><p class="muted">Očekivani postupci/upute za ovu posjetu.'+(isOpen?' Označi što je stvarno odrađeno prije završetka njege.':'')+'</p>'+(isOpen?planChecklistHtml(items):planListHtml(items,false));
      var statusCards=view.querySelectorAll('.card');
      if(statusCards.length>1) view.insertBefore(card,statusCards[1]); else view.appendChild(card);
      renderedScanId=patientId;
    }).catch(function(err){ console.warn('[careplan-addon] scan plan failed',err); }).then(function(){ if(busyKey===key) busyKey=''; });
  }

  function run(){
    var route=(location.hash||'').split('?')[0];
    if(route==='#patient'){
      var id=params().get('id')||'';
      if(id) renderProfilePlan(id,false);
    }
    if(route==='#scan'){
      var pid=patientIdFromScanDom();
      if(pid) renderScanPlan(pid,false);
    }
  }

  function scheduleRun(delay){
    if(runTimer) clearTimeout(runTimer);
    runTimer=setTimeout(function(){ runTimer=null; run(); }, delay||200);
  }

  window.addEventListener('hashchange',function(){ busyKey=''; renderedProfileId=''; renderedScanId=''; scheduleRun(150); });
  document.addEventListener('DOMContentLoaded',function(){ scheduleRun(300); });
  try{ new MutationObserver(function(){ scheduleRun(350); }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  if(document.readyState!=='loading') scheduleRun(300);
})();
