/* Ernos Zdravstvena Njega - therapy addon */
(function(){
  var busyKey='';
  var renderedProfileId='';
  var renderedScanId='';
  var timer=null;

  function $(s){return document.querySelector(s);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function params(){return new URLSearchParams((location.hash.split('?')[1]||''));}
  function val(id){var n=document.getElementById(id);return n?n.value:'';}

  function therapyLabel(it){
    it=it||{};
    var parts=[];
    if(it.medicine_name)parts.push(it.medicine_name);
    if(it.dose)parts.push(it.dose);
    if(it.schedule_note)parts.push(it.schedule_note);
    return parts.join(' — ') || 'Terapijska uputa';
  }

  function therapyHtml(items,editable,selectable){
    if(!items||!items.length)return '<div class="empty">Nema upisane terapije ili terapijskih uputa.</div>';
    var html='<div style="display:grid;gap:8px">';
    for(var i=0;i<items.length;i++){
      var it=items[i]||{};
      var label=therapyLabel(it);
      html+='<div style="border:1px solid var(--border);border-radius:12px;padding:10px;background:#fff">'+
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'+
          '<div style="flex:1">'+
            (selectable?'<label style="display:flex;gap:9px;align-items:flex-start;margin:0;font-weight:800"><input class="therapyDone" type="checkbox" value="'+esc(label)+'" style="width:auto;min-height:0;margin-top:4px"><span>'+esc(it.medicine_name||'Terapijska uputa')+'</span></label>':'<strong>'+esc(it.medicine_name||'Terapijska uputa')+'</strong>')+
            (it.dose?'<div><span class="muted">Doza:</span> '+esc(it.dose)+'</div>':'')+
            (it.schedule_note?'<div><span class="muted">Vrijeme:</span> '+esc(it.schedule_note)+'</div>':'')+
            (it.instructions?'<div class="muted" style="margin-top:4px">'+esc(it.instructions)+'</div>':'')+
          '</div>'+
          (editable?'<button class="btn ghost deleteTherapyItem" data-id="'+esc(it.id)+'" type="button">Ukloni</button>':'')+
        '</div></div>';
    }
    html+='</div>';
    return html;
  }

  function removeProfileCard(){var c=$('#therapyCard');if(c&&c.parentNode)c.parentNode.removeChild(c);}
  function removeScanCard(){var c=$('#scanTherapyCard');if(c&&c.parentNode)c.parentNode.removeChild(c);}

  function bindProfile(patientId){
    var add=$('#addTherapyItem');
    if(add&&!add.__bound)add.onclick=function(){
      add.disabled=true;add.textContent='Spremam...';
      api('/api/care/patients/'+encodeURIComponent(patientId)+'/therapy',{method:'POST',body:{medicine_name:val('therapyName'),dose:val('therapyDose'),schedule_note:val('therapySchedule'),instructions:val('therapyInstructions')}}).then(function(){
        renderedProfileId='';busyKey='';renderProfile(patientId,true);
      }).catch(function(err){alert('Greška: '+(err.message||err));add.disabled=false;add.textContent='Dodaj terapiju';});
    };
    if(add)add.__bound=true;
    var dels=document.querySelectorAll('.deleteTherapyItem');
    for(var i=0;i<dels.length;i++)if(!dels[i].__bound)dels[i].onclick=function(){
      var id=this.getAttribute('data-id');var btn=this;btn.disabled=true;btn.textContent='Uklanjam...';
      api('/api/care/therapy/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){renderedProfileId='';busyKey='';renderProfile(patientId,true);}).catch(function(err){alert('Greška: '+(err.message||err));btn.disabled=false;btn.textContent='Ukloni';});
    };
    for(var j=0;j<dels.length;j++)dels[j].__bound=true;
  }

  function renderProfile(patientId,force){
    var view=$('#view');if(!view||!patientId)return;
    if(!force&&renderedProfileId===patientId&&$('#therapyCard'))return;
    var active=document.activeElement;if(!force&&active&&$('#therapyCard')&&$('#therapyCard').contains(active))return;
    var key='profile:'+patientId;if(busyKey===key)return;busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/therapy').then(function(data){
      var v=$('#view');if(!v)return;removeProfileCard();
      var items=data.items||[];
      var card=document.createElement('div');card.className='card';card.id='therapyCard';
      card.innerHTML='<h3>Terapija / lijekovi</h3><p class="muted">Stalna terapija, važni lijekovi ili terapijske upute koje tehničar mora vidjeti prije njege.</p>'+ 
        '<div class="grid cols-2">'+
          '<div><label>Naziv lijeka/upute</label><input id="therapyName" placeholder="npr. Andol 100 mg ili Terapija prema listi"></div>'+ 
          '<div><label>Doza</label><input id="therapyDose" placeholder="npr. 1 tbl"></div>'+ 
          '<div><label>Vrijeme / učestalost</label><input id="therapySchedule" placeholder="npr. ujutro, navečer, po potrebi"></div>'+ 
          '<div><label>Upute</label><input id="therapyInstructions" placeholder="npr. dati nakon jela, pratiti tlak"></div>'+ 
        '</div>'+ 
        '<div style="margin-top:10px"><button class="btn" id="addTherapyItem" type="button">Dodaj terapiju</button></div>'+ 
        '<div style="margin-top:12px">'+therapyHtml(items,true,false)+'</div>';
      var plan=$('#carePlanCard');var qr=$('#realScanCard');
      if(plan&&plan.parentNode)plan.parentNode.insertBefore(card,plan.nextSibling);else if(qr&&qr.parentNode)qr.parentNode.insertBefore(card,qr.nextSibling);else v.appendChild(card);
      renderedProfileId=patientId;bindProfile(patientId);
    }).catch(function(err){console.warn('[therapy-addon] profile failed',err);}).then(function(){if(busyKey===key)busyKey='';});
  }

  function patientIdFromScanDom(){
    var a=document.querySelector('a[href^="#patient?id="]');if(!a)return '';
    try{return new URLSearchParams((a.getAttribute('href').split('?')[1]||'')).get('id')||'';}catch(e){return '';}
  }

  function renderScan(patientId,force){
    if(!patientId)return;
    if(!force&&renderedScanId===patientId&&$('#scanTherapyCard'))return;
    var key='scan:'+patientId;if(busyKey===key)return;busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/therapy').then(function(data){
      var view=$('#view');if(!view)return;removeScanCard();
      var items=data.items||[];
      var card=document.createElement('div');card.className='card';card.id='scanTherapyCard';
      card.innerHTML='<h3>Terapija / lijekovi</h3><p class="muted">Označi stavke koje su stvarno dane ili odrađene tijekom ove posjete. To se sprema u povijest posjete.</p>'+therapyHtml(items,false,true);
      var plan=$('#scanCarePlanCard');var cards=view.querySelectorAll('.card');
      if(plan&&plan.parentNode)plan.parentNode.insertBefore(card,plan.nextSibling);else if(cards.length>1)view.insertBefore(card,cards[1]);else view.appendChild(card);
      renderedScanId=patientId;
    }).catch(function(err){console.warn('[therapy-addon] scan failed',err);}).then(function(){if(busyKey===key)busyKey='';});
  }

  function run(){
    var route=(location.hash||'').split('?')[0];
    if(route==='#patient'){var id=params().get('id')||'';if(id)renderProfile(id,false);}
    if(route==='#scan'){var pid=patientIdFromScanDom();if(pid)renderScan(pid,false);}
  }
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;run();},300);}
  window.addEventListener('hashchange',function(){busyKey='';renderedProfileId='';renderedScanId='';schedule();});
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){schedule();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();
