/* Ernos Zdravstvena Njega - care plan addon */
(function(){
  var busyKey = '';

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

  function renderProfilePlan(patientId){
    var view=$('#view'); if(!view || !patientId) return;
    var key='profile:'+patientId;
    if(busyKey===key) return;
    busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/plan').then(function(data){
      var v=$('#view'); if(!v) return;
      removeCarePlanCards();
      var items=data.items||[];
      var card=document.createElement('div'); card.className='card'; card.id='carePlanCard';
      card.innerHTML='<h3>Plan njege</h3><p class="muted">Stalne upute i očekivani postupci za ovog pacijenta. Ovo tehničar vidi prije ili tijekom posjete.</p>'+ 
        '<div class="grid cols-2" style="align-items:end"><div><label>Naziv stavke</label><input id="planTitle" placeholder="npr. Previjanje kronične rane"></div><div><label>Kratki opis</label><input id="planDesc" placeholder="npr. kontrola sekrecije, zamjena obloga, edukacija"></div></div>'+ 
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="addPlanItem" type="button">Dodaj u plan njege</button></div>'+ 
        '<div id="planItems" style="margin-top:12px">'+planListHtml(items,true)+'</div>';
      var qr=document.getElementById('realScanCard');
      if(qr && qr.parentNode) qr.parentNode.insertBefore(card, qr.nextSibling); else v.appendChild(card);
      var add=$('#addPlanItem');
      if(add)add.onclick=function(){
        var title=$('#planTitle')?$('#planTitle').value:'';
        var description=$('#planDesc')?$('#planDesc').value:'';
        add.disabled=true; add.textContent='Spremam...';
        api('/api/care/patients/'+encodeURIComponent(patientId)+'/plan',{method:'POST',body:{title:title,description:description}}).then(function(){ busyKey=''; renderProfilePlan(patientId); }).catch(function(err){ alert('Greška: '+(err.message||err)); add.disabled=false; add.textContent='Dodaj u plan njege'; });
      };
      var dels=document.querySelectorAll('.deletePlanItem');
      for(var i=0;i<dels.length;i++) dels[i].onclick=function(){
        var id=this.getAttribute('data-id');
        var btn=this; btn.disabled=true; btn.textContent='Uklanjam...';
        api('/api/care/plan/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){ busyKey=''; renderProfilePlan(patientId); }).catch(function(err){ alert('Greška: '+(err.message||err)); btn.disabled=false; btn.textContent='Ukloni'; });
      };
    }).catch(function(err){ console.warn('[careplan-addon] profile plan failed',err); }).then(function(){ if(busyKey===key) busyKey=''; });
  }

  function patientIdFromScanDom(){
    var a=document.querySelector('a[href^="#patient?id="]');
    if(!a) return '';
    try{ return new URLSearchParams((a.getAttribute('href').split('?')[1]||'')).get('id')||''; }catch(e){ return ''; }
  }

  function renderScanPlan(patientId){
    if(!patientId) return;
    var key='scan:'+patientId;
    if(busyKey===key || $('#scanCarePlanCard')) return;
    busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/plan').then(function(data){
      var view=$('#view'); if(!view) return;
      if($('#scanCarePlanCard')) return;
      var items=data.items||[];
      var card=document.createElement('div'); card.className='card'; card.id='scanCarePlanCard';
      card.innerHTML='<h3>Plan njege</h3><p class="muted">Očekivani postupci/upute za ovu posjetu.</p>'+planListHtml(items,false);
      var statusCards=view.querySelectorAll('.card');
      if(statusCards.length>1) view.insertBefore(card,statusCards[1]); else view.appendChild(card);
    }).catch(function(err){ console.warn('[careplan-addon] scan plan failed',err); }).then(function(){ if(busyKey===key) busyKey=''; });
  }

  function run(){
    var route=(location.hash||'').split('?')[0];
    if(route==='#patient'){
      var id=params().get('id')||'';
      if(id) renderProfilePlan(id);
    }
    if(route==='#scan'){
      var pid=patientIdFromScanDom();
      if(pid) renderScanPlan(pid);
    }
  }

  window.addEventListener('hashchange',function(){ busyKey=''; setTimeout(run,150); });
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(run,300); });
  try{ new MutationObserver(function(){ setTimeout(run,120); }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  if(document.readyState!=='loading') setTimeout(run,300);
})();
