/* Ernos Zdravstvena Njega - patient edit addon */
(function(){
  var renderedPatientId='';
  var busy=false;
  var timer=null;

  function $(s){ return document.querySelector(s); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;}); }
  function token(){ try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function params(){return new URLSearchParams((location.hash.split('?')[1]||''));}
  function dateOnly(v){ if(!v)return ''; return String(v).slice(0,10); }
  function val(id){ var n=document.getElementById(id); return n?n.value:''; }

  function removeCard(){ var c=$('#patientEditCard'); if(c&&c.parentNode)c.parentNode.removeChild(c); }

  function render(){
    var route=(location.hash||'').split('?')[0];
    if(route!=='#patient') return;
    var id=params().get('id')||'';
    var view=$('#view');
    if(!id||!view) return;
    if(renderedPatientId===id && $('#patientEditCard')) return;
    var active=document.activeElement;
    if(active && $('#patientEditCard') && $('#patientEditCard').contains(active)) return;
    if(busy) return;
    busy=true;
    api('/api/patients').then(function(data){
      var items=data.items||[]; var p=null;
      for(var i=0;i<items.length;i++){ if(String(items[i].id)===String(id)){ p=items[i]; break; } }
      if(!p) return;
      removeCard();
      var card=document.createElement('div'); card.className='card'; card.id='patientEditCard';
      card.innerHTML='<h3>Uredi podatke pacijenta</h3><p class="muted">Ovdje naknadno mijenjaš adresu, telefon i kontakt obitelji bez brisanja pacijenta.</p>'+ 
        '<div class="grid cols-2">'+
          '<div><label>Ime</label><input id="editFirstName" value="'+esc(p.first_name||'')+'"></div>'+ 
          '<div><label>Prezime</label><input id="editLastName" value="'+esc(p.last_name||'')+'"></div>'+ 
          '<div><label>Datum rođenja</label><input id="editDob" type="date" value="'+esc(dateOnly(p.date_of_birth))+'"></div>'+ 
          '<div><label>Telefon pacijenta</label><input id="editPhone" value="'+esc(p.phone||'')+'"></div>'+ 
          '<div><label>Kontakt obitelji</label><input id="editFamilyName" value="'+esc(p.family_contact_name||'')+'"></div>'+ 
          '<div><label>Telefon obitelji</label><input id="editFamilyPhone" value="'+esc(p.family_contact_phone||'')+'"></div>'+ 
        '</div>'+ 
        '<label style="margin-top:12px">Adresa</label><input id="editAddress" value="'+esc(p.address||'')+'">'+ 
        '<label style="margin-top:12px">Napomene</label><textarea id="editNotes" rows="3">'+esc(p.notes||'')+'</textarea>'+ 
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="savePatientEdit" type="button">Spremi promjene</button><span id="patientEditMsg" class="muted" style="align-self:center"></span></div>';
      var qr=$('#realScanCard');
      if(qr&&qr.parentNode) qr.parentNode.insertBefore(card, qr); else view.insertBefore(card, view.firstChild);
      renderedPatientId=id;
      var btn=$('#savePatientEdit');
      if(btn)btn.onclick=function(){
        var msg=$('#patientEditMsg');
        btn.disabled=true; btn.textContent='Spremam...'; if(msg)msg.textContent='';
        api('/api/patients/'+encodeURIComponent(id),{method:'PATCH',body:{first_name:val('editFirstName'),last_name:val('editLastName'),date_of_birth:val('editDob'),address:val('editAddress'),phone:val('editPhone'),family_contact_name:val('editFamilyName'),family_contact_phone:val('editFamilyPhone'),notes:val('editNotes')}}).then(function(){
          if(msg)msg.textContent='Spremljeno.';
          btn.disabled=false; btn.textContent='Spremi promjene';
          renderedPatientId='';
        }).catch(function(err){
          if(msg)msg.textContent='Greška: '+(err.message||err);
          btn.disabled=false; btn.textContent='Spremi promjene';
        });
      };
    }).catch(function(err){ console.warn('[patient-edit-addon] failed',err); }).then(function(){ busy=false; });
  }

  function schedule(){ if(timer)clearTimeout(timer); timer=setTimeout(function(){timer=null;render();},250); }
  window.addEventListener('hashchange',function(){ renderedPatientId=''; schedule(); });
  document.addEventListener('DOMContentLoaded',schedule);
  try{ new MutationObserver(function(){ schedule(); }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  if(document.readyState!=='loading') schedule();
})();
