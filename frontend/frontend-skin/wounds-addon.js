/* Ernos Zdravstvena Njega - wound timeline addon */
(function(){
  var renderedProfileId='';
  var renderedScanId='';
  var busyKey='';
  var timer=null;

  function $(s){return document.querySelector(s);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function params(){return new URLSearchParams((location.hash.split('?')[1]||''));}
  function fmt(v){if(!v)return '-';try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);}}
  function val(id){var n=document.getElementById(id);return n?n.value:'';}

  function removeCards(){var cards=document.querySelectorAll('.card');for(var i=cards.length-1;i>=0;i--){var txt=cards[i].textContent||'';if(txt.indexOf('Rane')>=0||txt.indexOf('Aktivne rane')>=0)cards[i].parentNode.removeChild(cards[i]);}}

  function obsByWound(observations){
    var map={}; observations=observations||[];
    for(var i=0;i<observations.length;i++){var o=observations[i];var k=String(o.wound_id);if(!map[k])map[k]=[];map[k].push(o);}
    return map;
  }

  function woundListHtml(items, observations, editable){
    if(!items||!items.length)return '<div class="empty">Nema aktivnih rana za ovog pacijenta.</div>';
    var by=obsByWound(observations); var html='<div style="display:grid;gap:12px">';
    for(var i=0;i<items.length;i++){
      var w=items[i]; var obs=by[String(w.id)]||[];
      html+='<div style="border:1px solid var(--border);border-radius:14px;padding:12px;background:#fff">'+
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'+
          '<div><strong>'+esc(w.title||'Rana')+'</strong><div class="muted" style="margin-top:4px">'+esc(w.location||'-')+(w.wound_type?' · '+esc(w.wound_type):'')+'</div></div>'+
          (editable?'<button class="btn ghost closeWound" data-id="'+esc(w.id)+'" type="button">Zatvori ranu</button>':'')+
        '</div>';
      if(editable){
        html+='<div class="grid cols-3" style="margin-top:10px">'+
          '<div><label>Veličina</label><input class="wSize" data-id="'+esc(w.id)+'" placeholder="npr. 2 x 1 cm"></div>'+ 
          '<div><label>Sekrecija</label><input class="wExudate" data-id="'+esc(w.id)+'" placeholder="npr. nema / serozna"></div>'+ 
          '<div><label>Bol 0-10</label><input class="wPain" data-id="'+esc(w.id)+'" placeholder="npr. 3"></div>'+ 
        '</div><label style="margin-top:8px">Okolna koža</label><input class="wSkin" data-id="'+esc(w.id)+'" placeholder="npr. suha, crvenilo, maceracija"><label style="margin-top:8px">Zapažanje</label><textarea class="wNote" data-id="'+esc(w.id)+'" rows="2" placeholder="Opis rane, oblog, promjene, preporuke..."></textarea><button class="btn addWoundObs" data-id="'+esc(w.id)+'" type="button" style="margin-top:8px">Dodaj zapažanje</button>';
      }
      if(obs.length){
        html+='<div style="margin-top:10px"><strong>Povijest zapažanja</strong>';
        for(var j=0;j<Math.min(obs.length,5);j++){
          var o=obs[j]; var details=[];
          if(o.size_text)details.push('Veličina: '+o.size_text);
          if(o.exudate)details.push('Sekrecija: '+o.exudate);
          if(o.surrounding_skin)details.push('Koža: '+o.surrounding_skin);
          if(o.pain_score)details.push('Bol: '+o.pain_score+'/10');
          html+='<div class="muted" style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px"><strong>'+esc(fmt(o.observed_at))+'</strong>'+(o.observed_by_name?' · '+esc(o.observed_by_name):'')+'<br>'+esc(details.join(' · ')||'-')+(o.note?'<br>'+esc(o.note):'')+'</div>';
        }
        html+='</div>';
      }
      html+='</div>';
    }
    html+='</div>'; return html;
  }

  function bindProfile(patientId){
    var add=$('#addWound');
    if(add&&!add.__bound)add.onclick=function(){
      add.disabled=true; add.textContent='Spremam...';
      api('/api/care/patients/'+encodeURIComponent(patientId)+'/wounds',{method:'POST',body:{title:val('woundTitle'),location:val('woundLocation'),wound_type:val('woundType')}}).then(function(){renderedProfileId='';busyKey='';renderProfile(patientId,true);}).catch(function(e){alert('Greška: '+(e.message||e));add.disabled=false;add.textContent='Dodaj ranu';});
    };
    if(add)add.__bound=true;
    var obs=document.querySelectorAll('.addWoundObs');
    for(var i=0;i<obs.length;i++)if(!obs[i].__bound)obs[i].onclick=function(){
      var id=this.getAttribute('data-id'); var btn=this; btn.disabled=true; btn.textContent='Spremam...';
      function cls(c){var n=document.querySelector('.'+c+'[data-id="'+id+'"]');return n?n.value:'';}
      api('/api/care/wounds/'+encodeURIComponent(id)+'/observations',{method:'POST',body:{size_text:cls('wSize'),exudate:cls('wExudate'),surrounding_skin:cls('wSkin'),pain_score:cls('wPain'),note:cls('wNote')}}).then(function(){renderedProfileId='';busyKey='';renderProfile(patientId,true);}).catch(function(e){alert('Greška: '+(e.message||e));btn.disabled=false;btn.textContent='Dodaj zapažanje';});
    };
    for(var j=0;j<obs.length;j++)obs[j].__bound=true;
    var close=document.querySelectorAll('.closeWound');
    for(var k=0;k<close.length;k++)if(!close[k].__bound)close[k].onclick=function(){
      var id=this.getAttribute('data-id'); var btn=this; btn.disabled=true; btn.textContent='Zatvaram...';
      api('/api/care/wounds/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){renderedProfileId='';busyKey='';renderProfile(patientId,true);}).catch(function(e){alert('Greška: '+(e.message||e));btn.disabled=false;btn.textContent='Zatvori ranu';});
    };
    for(var m=0;m<close.length;m++)close[m].__bound=true;
  }

  function renderProfile(patientId, force){
    var view=$('#view'); if(!view||!patientId)return;
    if(!force&&renderedProfileId===patientId&&$('#woundsCard'))return;
    var active=document.activeElement; if(!force&&active&&$('#woundsCard')&&$('#woundsCard').contains(active))return;
    var key='profile:'+patientId; if(busyKey===key)return; busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/wounds').then(function(data){
      var v=$('#view'); if(!v)return; removeCards();
      var card=document.createElement('div'); card.className='card'; card.id='woundsCard';
      card.innerHTML='<h3>Rane</h3><p class="muted">Aktivne rane i kronološka zapažanja. Fotografije ćemo dodati kasnije kao poseban sigurniji korak.</p>'+ 
        '<div class="grid cols-3"><div><label>Naziv</label><input id="woundTitle" placeholder="npr. Sakrum II stupanj"></div><div><label>Lokacija</label><input id="woundLocation" placeholder="npr. sakrum, lijeva peta"></div><div><label>Tip rane</label><input id="woundType" placeholder="npr. dekubitus, kirurška, ulkus"></div></div>'+ 
        '<div style="margin-top:10px"><button class="btn" id="addWound" type="button">Dodaj ranu</button></div><div style="margin-top:12px">'+woundListHtml(data.items||[],data.observations||[],true)+'</div>';
      var therapy=$('#therapyCard'); var care=$('#carePlanCard'); var qr=$('#realScanCard');
      if(therapy&&therapy.parentNode)therapy.parentNode.insertBefore(card,therapy.nextSibling); else if(care&&care.parentNode)care.parentNode.insertBefore(card,care.nextSibling); else if(qr&&qr.parentNode)qr.parentNode.insertBefore(card,qr); else v.appendChild(card);
      renderedProfileId=patientId; bindProfile(patientId);
    }).catch(function(e){console.warn('[wounds-addon] profile failed',e);}).then(function(){if(busyKey===key)busyKey='';});
  }

  function patientIdFromScanDom(){var a=document.querySelector('a[href^="#patient?id="]');if(!a)return '';try{return new URLSearchParams((a.getAttribute('href').split('?')[1]||'')).get('id')||'';}catch(e){return '';}}

  function renderScan(patientId, force){
    var view=$('#view'); if(!view||!patientId)return;
    if(!force&&renderedScanId===patientId&&$('#scanWoundsCard'))return;
    var key='scan:'+patientId; if(busyKey===key)return; busyKey=key;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/wounds').then(function(data){
      var v=$('#view'); if(!v)return; var ex=$('#scanWoundsCard'); if(ex&&ex.parentNode)ex.parentNode.removeChild(ex);
      var card=document.createElement('div'); card.className='card'; card.id='scanWoundsCard';
      card.innerHTML='<h3>Aktivne rane</h3><p class="muted">Provjeri prije završetka njege. Detaljna zapažanja se unose na profilu pacijenta.</p>'+woundListHtml(data.items||[],data.observations||[],false);
      var cards=v.querySelectorAll('.card'); if(cards.length>1)v.insertBefore(card,cards[1]); else v.appendChild(card);
      renderedScanId=patientId;
    }).catch(function(e){console.warn('[wounds-addon] scan failed',e);}).then(function(){if(busyKey===key)busyKey='';});
  }

  function run(){var route=(location.hash||'').split('?')[0]; if(route==='#patient'){var id=params().get('id')||''; if(id)renderProfile(id,false);} if(route==='#scan'){var pid=patientIdFromScanDom(); if(pid)renderScan(pid,false);}}
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;run();},300);}
  window.addEventListener('hashchange',function(){renderedProfileId='';renderedScanId='';busyKey='';schedule();});
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){schedule();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();
