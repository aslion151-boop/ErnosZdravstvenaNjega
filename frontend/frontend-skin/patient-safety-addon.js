/* Ernos Zdravstvena Njega - patient safety notes addon */
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
  function val(id){var n=document.getElementById(id);return n?n.value:'';}
  function full(p){return String((p.first_name||'')+' '+(p.last_name||'')).trim();}

  function patientById(id){
    return api('/api/patients').then(function(data){
      var items=data.items||[];
      for(var i=0;i<items.length;i++){if(String(items[i].id)===String(id))return items[i];}
      return null;
    });
  }

  function hasSafety(p){return !!(p&&(p.allergies||p.diagnoses||p.risks||p.mobility_note||p.access_note));}
  function safetyHtml(p,compact){
    if(!hasSafety(p))return compact?'':'<div class="empty">Nema upisanih sigurnosnih napomena.</div>';
    var html='<div style="display:grid;gap:8px">';
    if(p.allergies)html+='<div style="border:1px solid #F1C9C9;background:#FDEEEE;color:#7A2A2A;border-radius:12px;padding:10px"><strong>Alergije</strong><br>'+esc(p.allergies)+'</div>';
    if(p.risks)html+='<div style="border:1px solid #F3D7A0;background:#FFF6E0;border-radius:12px;padding:10px"><strong>Rizici / oprez</strong><br>'+esc(p.risks)+'</div>';
    if(p.diagnoses)html+='<div style="border:1px solid var(--border);background:#fff;border-radius:12px;padding:10px"><strong>Važna stanja / dijagnoze</strong><br>'+esc(p.diagnoses)+'</div>';
    if(p.mobility_note)html+='<div style="border:1px solid var(--border);background:#fff;border-radius:12px;padding:10px"><strong>Mobilnost / transfer</strong><br>'+esc(p.mobility_note)+'</div>';
    if(p.access_note)html+='<div style="border:1px solid var(--border);background:#fff;border-radius:12px;padding:10px"><strong>Ulazak / kućne upute</strong><br>'+esc(p.access_note)+'</div>';
    html+='</div>';return html;
  }

  function removeProfileCard(){var c=$('#safetyCard');if(c&&c.parentNode)c.parentNode.removeChild(c);}
  function removeScanCard(){var c=$('#scanSafetyCard');if(c&&c.parentNode)c.parentNode.removeChild(c);}

  function bindProfile(patientId,p){
    var btn=$('#saveSafetyNotes');
    if(btn&&!btn.__bound)btn.onclick=function(){
      btn.disabled=true;btn.textContent='Spremam...';
      var body={
        first_name:p.first_name||'',last_name:p.last_name||'',date_of_birth:p.date_of_birth||'',address:p.address||'',phone:p.phone||'',family_contact_name:p.family_contact_name||'',family_contact_phone:p.family_contact_phone||'',notes:p.notes||'',
        allergies:val('safetyAllergies'),diagnoses:val('safetyDiagnoses'),risks:val('safetyRisks'),mobility_note:val('safetyMobility'),access_note:val('safetyAccess')
      };
      api('/api/patients/'+encodeURIComponent(patientId),{method:'PATCH',body:body}).then(function(){renderedProfileId='';busyKey='';renderProfile(patientId,true);}).catch(function(err){alert('Greška: '+(err.message||err));btn.disabled=false;btn.textContent='Spremi sigurnosne napomene';});
    };
    if(btn)btn.__bound=true;
  }

  function renderProfile(patientId,force){
    var view=$('#view');if(!view||!patientId)return;
    if(!force&&renderedProfileId===patientId&&$('#safetyCard'))return;
    var active=document.activeElement;if(!force&&active&&$('#safetyCard')&&$('#safetyCard').contains(active))return;
    var key='profile:'+patientId;if(busyKey===key)return;busyKey=key;
    patientById(patientId).then(function(p){
      var v=$('#view');if(!v||!p)return;removeProfileCard();
      var card=document.createElement('div');card.className='card';card.id='safetyCard';
      card.innerHTML='<h3>Sigurnosne napomene</h3><p class="muted">Ovo se prikazuje na profilu, scan ekranu i sažetku pacijenta. Upisuj samo ono što je klinički ili operativno važno.</p>'+safetyHtml(p,false)+
        '<div class="grid cols-2" style="margin-top:12px">'+
          '<div><label>Alergije</label><textarea id="safetyAllergies" rows="2" placeholder="npr. penicilin, lateks">'+esc(p.allergies||'')+'</textarea></div>'+ 
          '<div><label>Rizici / oprez</label><textarea id="safetyRisks" rows="2" placeholder="npr. rizik pada, antikoagulantna terapija">'+esc(p.risks||'')+'</textarea></div>'+ 
          '<div><label>Važna stanja / dijagnoze</label><textarea id="safetyDiagnoses" rows="2" placeholder="npr. DM, KOPB, demencija">'+esc(p.diagnoses||'')+'</textarea></div>'+ 
          '<div><label>Mobilnost / transfer</label><textarea id="safetyMobility" rows="2" placeholder="npr. hoda uz pomagalo, potreban transfer 2 osobe">'+esc(p.mobility_note||'')+'</textarea></div>'+ 
          '<div><label>Ulazak / kućne upute</label><textarea id="safetyAccess" rows="2" placeholder="npr. ključ kod susjede, pas u dvorištu">'+esc(p.access_note||'')+'</textarea></div>'+ 
        '</div><div style="margin-top:10px"><button class="btn" id="saveSafetyNotes" type="button">Spremi sigurnosne napomene</button></div>';
      var edit=$('#patientEditCard');var qr=$('#realScanCard');
      if(edit&&edit.parentNode)edit.parentNode.insertBefore(card,edit.nextSibling);else if(qr&&qr.parentNode)qr.parentNode.insertBefore(card,qr);else v.insertBefore(card,v.firstChild||null);
      renderedProfileId=patientId;bindProfile(patientId,p);
    }).catch(function(err){console.warn('[patient-safety-addon] profile failed',err);}).then(function(){if(busyKey===key)busyKey='';});
  }

  function patientIdFromScanDom(){var a=document.querySelector('a[href^="#patient?id="]');if(!a)return '';try{return new URLSearchParams((a.getAttribute('href').split('?')[1]||'')).get('id')||'';}catch(e){return '';}}

  function renderScan(patientId,force){
    var view=$('#view');if(!view||!patientId)return;
    if(!force&&renderedScanId===patientId&&$('#scanSafetyCard'))return;
    var key='scan:'+patientId;if(busyKey===key)return;busyKey=key;
    patientById(patientId).then(function(p){
      var v=$('#view');if(!v||!p)return;removeScanCard();if(!hasSafety(p)){renderedScanId=patientId;return;}
      var card=document.createElement('div');card.className='card';card.id='scanSafetyCard';
      card.innerHTML='<h3>Važno prije njege</h3><p class="muted">Sigurnosne napomene za '+esc(full(p)||'pacijenta')+'.</p>'+safetyHtml(p,true);
      var cards=v.querySelectorAll('.card');if(cards.length>1)v.insertBefore(card,cards[1]);else v.appendChild(card);
      renderedScanId=patientId;
    }).catch(function(err){console.warn('[patient-safety-addon] scan failed',err);}).then(function(){if(busyKey===key)busyKey='';});
  }

  function run(){
    var route=(location.hash||'').split('?')[0];
    if(route==='#patient'){var id=params().get('id')||'';if(id)renderProfile(id,false);}
    if(route==='#scan'){var pid=patientIdFromScanDom();if(pid)renderScan(pid,false);}
  }
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;run();},300);}
  window.addEventListener('hashchange',function(){renderedProfileId='';renderedScanId='';busyKey='';schedule();});
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){schedule();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();