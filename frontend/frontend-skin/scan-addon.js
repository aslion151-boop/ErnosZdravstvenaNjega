/* Ernos Zdravstvena Njega - QR/NFC scan addon */
(function(){
  var pendingProfileId = '';
  var applyingCard = false;
  var qrLibLoading = false;
  var qrLibReadyCallbacks = [];
  var renderedVisitsId = '';
  var visitsLoading = false;

  function $(s){ return document.querySelector(s); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;}); }
  function token(){ try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';} }
  function api(path, opts){ opts=opts||{}; var h={'Content-Type':'application/json'}; var t=token(); if(t)h.Authorization='Bearer '+t; return fetch(location.origin+path,{method:opts.method||'GET',headers:h,body:opts.body?JSON.stringify(opts.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null; try{j=txt?JSON.parse(txt):null;}catch(e){} if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status)); return j||{};});}); }
  function params(){return new URLSearchParams((location.hash.split('?')[1]||''));}
  function full(p){return String((p.first_name||'')+' '+(p.last_name||'')).trim();}
  function fmt(v){if(!v)return '-'; try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);} }
  function setTitle(t){ var c=$('#crumbs'); if(c)c.textContent=t; document.title='Ernos Zdravstvena Njega - '+t; }

  var PROCEDURES=['Vitalni znakovi','Terapija / lijekovi','Previjanje rane','Injekcija','Kateter','Stoma','Higijena','Edukacija obitelji','Procjena boli','Drugo'];

  function procedureChecklist(){
    var html='<div id="procedureBox" style="margin-top:12px"><label>Obavljeni postupci</label><div class="grid cols-3" style="gap:8px">';
    for(var i=0;i<PROCEDURES.length;i++){
      html+='<label style="display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:10px;padding:8px;background:#fff;font-weight:650"><input class="careProc" type="checkbox" value="'+esc(PROCEDURES[i])+'" style="width:auto;min-height:0"> '+esc(PROCEDURES[i])+'</label>';
    }
    html+='</div></div>';
    return html;
  }

  function procedureDescriptionField(){
    return '<div style="margin-top:12px"><label>Opis postupaka od strane tehničara</label><textarea id="procedureNote" rows="4" placeholder="Opiši što je točno učinjeno, npr. rana očišćena fiziološkom, postavljen novi sterilni oblog, pacijent educiran o znakovima infekcije..."></textarea></div>';
  }

  function clinicalFields(){
    return '<div id="clinicalBox" style="margin-top:12px"><h3 style="margin-top:0">Klinička zapažanja</h3><div class="grid cols-3">'+
      '<div><label>Tlak</label><input id="visitBp" placeholder="npr. 130/80"></div>'+ 
      '<div><label>Puls</label><input id="visitPulse" placeholder="npr. 78/min"></div>'+ 
      '<div><label>Temperatura</label><input id="visitTemp" placeholder="npr. 36.8"></div>'+ 
      '<div><label>SpO₂</label><input id="visitSpo2" placeholder="npr. 97%"></div>'+ 
      '<div><label>Bol 0-10</label><input id="visitPain" placeholder="npr. 3"></div>'+ 
      '<div><label>Rana</label><input id="visitWound" placeholder="npr. suha, sekrecija, crvenilo"></div>'+ 
    '</div></div>';
  }

  function familyNotifyField(patient){
    var contact=String(((patient&&patient.family_contact_name)||'')+' '+((patient&&patient.family_contact_phone)||'')).trim();
    if(!contact) return '';
    return '<div style="margin-top:12px;border:1px solid var(--border);border-radius:12px;padding:10px;background:#fff">'+
      '<label style="display:flex;align-items:flex-start;gap:10px;margin:0;font-weight:750"><input id="notifyFamily" type="checkbox" checked style="width:auto;min-height:0;margin-top:3px"> <span>Pripremi obavijest obitelji<span class="muted" style="display:block;margin-top:4px;font-weight:500">Kontakt: '+esc(contact)+'. Ovo još ne šalje SMS/email, nego sprema pripremljenu poruku i status u evidenciju.</span></span></label>'+ 
    '</div>';
  }

  function plannedVisitCard(data,isOpen){
    var pv=(data&&data.planned_visit)||null;
    var open=(data&&data.open_visit)||null;
    var id=(open&&open.planned_visit_id)||(pv&&pv.id)||'';
    if(!pv && !id) return '';
    var title=pv?(pv.visit_type||'Planirana posjeta'):'Planirana posjeta';
    var when=pv?fmt(pv.planned_for):'';
    var windowText=pv&&pv.window_text?pv.window_text:'';
    var instructions=pv&&pv.instructions?pv.instructions:'';
    return '<div style="margin-top:12px;border:1px solid var(--border);border-radius:12px;padding:10px;background:#fff" id="plannedVisitBox" data-id="'+esc(id)+'">'+
      '<h3 style="margin-top:0">Planirana posjeta</h3>'+ 
      '<p><strong>'+esc(title)+'</strong>'+((when&&when!=='-')?'<br><span class="muted">Vrijeme: '+esc(when)+'</span>':'')+(windowText?'<br><span class="muted">Okvir: '+esc(windowText)+'</span>':'')+'</p>'+ 
      (instructions?'<p class="muted">'+esc(instructions)+'</p>':'')+
      '<label style="display:flex;align-items:flex-start;gap:10px;margin:0;font-weight:750"><input id="usePlannedVisit" type="checkbox" checked style="width:auto;min-height:0;margin-top:3px"> <span>'+(isOpen?'Označi ovu planiranu posjetu kao odrađenu kod završetka njege':'Poveži početak njege s ovom planiranom posjetom')+'</span></label>'+ 
    '</div>';
  }

  function selectedProcedures(){
    var out=[]; var nodes=document.querySelectorAll('.careProc:checked');
    for(var i=0;i<nodes.length;i++) out.push(nodes[i].value);
    return out.join(', ');
  }

  function selectedCarePlanDone(){
    var out=[]; var nodes=document.querySelectorAll('.carePlanDone:checked');
    for(var i=0;i<nodes.length;i++) out.push(nodes[i].value);
    return out.join(', ');
  }

  function selectedTherapyDone(){
    var out=[]; var nodes=document.querySelectorAll('.therapyDone:checked');
    for(var i=0;i<nodes.length;i++) out.push(nodes[i].value);
    return out.join(', ');
  }

  function selectedPlannedVisitId(){
    var box=$('#plannedVisitBox'); var cb=$('#usePlannedVisit');
    if(!box || (cb && !cb.checked)) return null;
    var id=Number(box.getAttribute('data-id')||0);
    return id||null;
  }

  function val(id){ var n=document.getElementById(id); return n?n.value:''; }
  function checked(id){ var n=document.getElementById(id); return !!(n&&n.checked); }

  function ensureQrLib(cb){
    if(window.QRCode){ cb(); return; }
    qrLibReadyCallbacks.push(cb);
    if(qrLibLoading) return;
    qrLibLoading = true;
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    s.onload=function(){ var list=qrLibReadyCallbacks.slice(); qrLibReadyCallbacks=[]; for(var i=0;i<list.length;i++){ try{list[i]();}catch(e){} } };
    s.onerror=function(){ console.warn('[scan-addon] QR library failed to load'); };
    document.head.appendChild(s);
  }

  function drawQr(nodeId, url){
    ensureQrLib(function(){
      var node=document.getElementById(nodeId);
      if(!node || !window.QRCode) return;
      node.innerHTML='';
      new QRCode(node,{ text:url, width:180, height:180 });
    });
  }

  function renderScan(){
    if((location.hash||'').split('?')[0] !== '#scan') return false;
    var code=params().get('t')||'';
    var view=$('#view');
    if(!view) return true;
    setTitle('QR/NFC scan');
    if(!code){ view.innerHTML='<div class="alert err">Nedostaje scan kod.</div>'; return true; }
    function load(){
      view.innerHTML='<div class="card"><h2>QR/NFC scan</h2><p class="muted">Učitavanje...</p></div>';
      api('/api/care/scan/'+encodeURIComponent(code)).then(function(data){
        var p=data.patient||{}; var open=data.open_visit; var isOpen=!!open;
        var plannedHtml=plannedVisitCard(data,isOpen);
        var procHtml=isOpen?procedureChecklist():'';
        var procDesc=isOpen?procedureDescriptionField():'';
        var clinicalHtml=isOpen?clinicalFields():'';
        var familyHtml=isOpen?familyNotifyField(p):'';
        view.innerHTML='<div class="card"><h2>'+esc(full(p))+'</h2><p class="muted">'+esc(p.address||'')+'</p></div>'+ 
          '<div class="card"><h3>Status njege</h3><p>'+(isOpen?'<strong style="color:var(--ok)">Njega je započeta</strong><br><span class="muted">Početak: '+esc(fmt(open.started_at))+' · '+esc(open.started_by_name||'')+'</span>':'<strong>Njega nije započeta</strong>')+'</p>'+ 
          plannedHtml+procHtml+procDesc+clinicalHtml+familyHtml+
          '<label style="margin-top:12px">Dodatna napomena</label><textarea id="visitNote" rows="3" placeholder="Opcionalno"></textarea>'+ 
          '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="toggleVisit" type="button">'+(isOpen?'Završetak njege':'Početak njege')+'</button><a class="btn ghost" href="#patient?id='+esc(p.id)+'">Profil pacijenta</a></div><div id="scanMsg" class="muted" style="margin-top:8px"></div></div>';
        var btn=$('#toggleVisit');
        if(btn)btn.onclick=function(){
          var note=$('#visitNote')?$('#visitNote').value:''; var msg=$('#scanMsg'); var procedures=isOpen?selectedProcedures():''; var carePlanDone=isOpen?selectedCarePlanDone():''; var therapyDone=isOpen?selectedTherapyDone():''; var plannedVisitId=selectedPlannedVisitId();
          btn.disabled=true; btn.textContent=isOpen?'Završavam...':'Započinjem...';
          api('/api/care/scan/'+encodeURIComponent(code)+'/toggle',{method:'POST',body:{note:note,planned_visit_id:plannedVisitId,procedures:procedures,procedure_note:val('procedureNote'),care_plan_done:carePlanDone,therapy_done:therapyDone,notify_family:checked('notifyFamily'),bp:val('visitBp'),pulse:val('visitPulse'),temperature:val('visitTemp'),spo2:val('visitSpo2'),pain_score:val('visitPain'),wound_note:val('visitWound')}}).then(function(r){ if(msg)msg.textContent=(r.action==='IN'?'Njega započeta.':'Njega završena.'); load(); }).catch(function(err){ if(msg)msg.textContent='Greška: '+(err.message||err); btn.disabled=false; btn.textContent=isOpen?'Završetak njege':'Početak njege'; });
        };
      }).catch(function(err){ view.innerHTML='<div class="alert err">Greška: '+esc(err.message||err)+'</div>'; });
    }
    load();
    return true;
  }

  function isQrCard(card){
    var txt=card.textContent||'';
    return txt.indexOf('QR/NFC link')>=0 || txt.indexOf('QR/NFC tag')>=0 || txt.indexOf('privremeni link')>=0 || txt.indexOf('Početak njege - sljedeći korak')>=0;
  }

  function isVisitHistoryCard(card){
    var txt=card.textContent||'';
    return txt.indexOf('Povijest posjeta')>=0 || txt.indexOf('Nema evidentiranih posjeta')>=0;
  }

  function removeQrCards(view){
    var cards=view.querySelectorAll('.card');
    for(var i=cards.length-1;i>=0;i--){ if(isQrCard(cards[i])) cards[i].parentNode.removeChild(cards[i]); }
  }

  function removeVisitCards(view){
    var cards=view.querySelectorAll('.card');
    for(var i=cards.length-1;i>=0;i--){ if(isVisitHistoryCard(cards[i])) cards[i].parentNode.removeChild(cards[i]); }
  }

  function durationText(started, finished){
    if(!started || !finished) return 'u tijeku';
    try{
      var ms=new Date(finished).getTime()-new Date(started).getTime();
      if(!isFinite(ms) || ms<0) return '-';
      var min=Math.round(ms/60000);
      if(min<60) return min+' min';
      var h=Math.floor(min/60); var m=min%60;
      return h+' h '+m+' min';
    }catch(e){ return '-'; }
  }

  function clinicalText(v){
    var parts=[];
    if(v.bp) parts.push('TA '+v.bp);
    if(v.pulse) parts.push('P '+v.pulse);
    if(v.temperature) parts.push('T '+v.temperature);
    if(v.spo2) parts.push('SpO₂ '+v.spo2);
    if(v.pain_score) parts.push('Bol '+v.pain_score+'/10');
    if(v.wound_note) parts.push('Rana: '+v.wound_note);
    return parts.join(' · ');
  }

  function familyText(v){
    if(!v.family_notification_requested) return '-';
    var status=v.family_notification_status==='prepared'?'Pripremljeno':'Zabilježeno';
    var html='<div><strong>'+esc(status)+'</strong>'+(v.family_notification_to?'<br><span class="muted">Za: '+esc(v.family_notification_to)+'</span>':'')+(v.family_notification_at?'<br><span class="muted">'+esc(fmt(v.family_notification_at))+'</span>':'')+'</div>';
    if(v.family_notification_message) html+='<div class="muted" style="margin-top:4px">'+esc(v.family_notification_message)+'</div>';
    return html;
  }

  function procedureCell(v){
    var procs=v.performed_procedures||'';
    var desc=v.procedure_note||'';
    var plan=v.care_plan_done||'';
    var therapy=v.therapy_done||'';
    var html='<div>'+esc(procs||'-')+'</div>';
    if(plan) html+='<div class="muted" style="margin-top:4px"><strong>Iz plana odrađeno:</strong> '+esc(plan)+'</div>';
    if(therapy) html+='<div class="muted" style="margin-top:4px"><strong>Terapija odrađena:</strong> '+esc(therapy)+'</div>';
    if(v.planned_visit_id) html+='<div class="muted" style="margin-top:4px"><strong>Planirana posjeta:</strong> #'+esc(v.planned_visit_id)+'</div>';
    if(desc) html+='<div class="muted" style="margin-top:4px"><strong>Opis:</strong> '+esc(desc)+'</div>';
    return html;
  }

  function visitRow(v){
    var open=!v.finished_at;
    var note=(v.finish_note||v.start_note||'');
    var clinical=clinicalText(v);
    return '<tr>'+ 
      '<td><strong>'+(open?'<span style="color:var(--ok)">U tijeku</span>':'Završeno')+'</strong></td>'+ 
      '<td>'+esc(fmt(v.started_at))+'<br><span class="muted">'+esc(v.started_by_name||'')+'</span></td>'+ 
      '<td>'+esc(v.finished_at?fmt(v.finished_at):'-')+'<br><span class="muted">'+esc(v.finished_by_name||'')+'</span></td>'+ 
      '<td>'+esc(durationText(v.started_at,v.finished_at))+'</td>'+ 
      '<td>'+procedureCell(v)+'</td>'+ 
      '<td>'+esc(clinical||'-')+'</td>'+ 
      '<td>'+familyText(v)+'</td>'+ 
      '<td>'+esc(note||'-')+'</td>'+ 
    '</tr>';
  }

  function renderVisitHistory(patientId,force){
    if(!patientId) return;
    if(!force && renderedVisitsId===patientId && $('#visitHistoryCard')) return;
    if(visitsLoading) return;
    var active=document.activeElement;
    if(!force && active && $('#carePlanCard') && $('#carePlanCard').contains(active)) return;
    visitsLoading=true;
    api('/api/care/patients/'+encodeURIComponent(patientId)+'/visits').then(function(data){
      var v=$('#view'); if(!v) return;
      removeVisitCards(v);
      var items=data.items||[];
      var card=document.createElement('div'); card.className='card'; card.id='visitHistoryCard';
      if(!items.length){
        card.innerHTML='<h3>Povijest posjeta</h3><div class="empty">Nema evidentiranih posjeta za ovog pacijenta.</div>';
      } else {
        var rows=''; for(var i=0;i<items.length;i++) rows+=visitRow(items[i]);
        card.innerHTML='<h3>Povijest posjeta</h3><p class="muted">Zadnjih '+items.length+' posjeta. Otvorena njega prikazuje se kao “U tijeku”.</p><div class="table-wrap"><table><thead><tr><th>Status</th><th>Početak</th><th>Završetak</th><th>Trajanje</th><th>Postupci i opis</th><th>Klinički podaci</th><th>Obitelj</th><th>Napomena</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
      }
      v.appendChild(card);
      renderedVisitsId=patientId;
    }).catch(function(err){ console.warn('[scan-addon] visits failed',err); }).then(function(){ visitsLoading=false; });
  }

  function enhancePatientProfile(){
    var r=(location.hash||'').split('?')[0];
    if(r !== '#patient') return;
    var id=params().get('id'); if(!id) return;
    var view=$('#view'); if(!view) return;
    renderVisitHistory(id,false);
    if(applyingCard && pendingProfileId===id) return;
    if($('#realScanCard') && pendingProfileId===id) return;
    pendingProfileId=id;
    applyingCard=true;
    api('/api/care/patients/'+encodeURIComponent(id)+'/code').then(function(data){
      var current=(location.hash||'').split('?')[0];
      var currentId=params().get('id')||'';
      var v=$('#view');
      if(current !== '#patient' || currentId !== id || !v) return;
      var link=location.origin+(data.url||('/#scan?t='+encodeURIComponent(data.code||'')));
      removeQrCards(v);
      var card=document.createElement('div'); card.className='card'; card.id='realScanCard';
      card.innerHTML='<h3>QR/NFC tag</h3><p class="muted">Ovo je pravi Ernos workflow: isti link za QR i NFC. Prvi tap = početak njege, drugi tap = završetak njege.</p>'+ 
        '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;margin-top:12px">'+
          '<div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:12px;width:206px;text-align:center"><div id="realQrCode" style="width:180px;height:180px;margin:0 auto"></div><div class="muted" style="font-size:12px;margin-top:8px">Skeniraj QR</div></div>'+ 
          '<div style="flex:1;min-width:240px"><label>Scan code</label><input id="realScanCode" readonly value="'+esc(data.code||'')+'"><label style="margin-top:10px">QR/NFC link</label><input id="realScanLink" readonly value="'+esc(link)+'"><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="copyRealScan" type="button">Kopiraj link</button><button class="btn ghost" id="printRealQr" type="button">Print QR</button><a class="btn ghost" href="#scan?t='+encodeURIComponent(data.code||'')+'">Testiraj scan</a></div></div>'+ 
        '</div>';
      v.appendChild(card);
      drawQr('realQrCode', link);
      var b=$('#copyRealScan'); if(b)b.onclick=function(){var inp=$('#realScanLink'); if(inp){inp.select(); document.execCommand('copy'); b.textContent='Kopirano'; setTimeout(function(){b.textContent='Kopiraj link';},1200);}};
      var pbtn=$('#printRealQr'); if(pbtn)pbtn.onclick=function(){window.print();};
    }).catch(function(err){ console.warn('[scan-addon] code failed',err); }).then(function(){ applyingCard=false; });
  }

  var tries=0;
  function run(){
    if(renderScan()) return;
    enhancePatientProfile();
    tries++;
    if(tries<12) setTimeout(run,300);
  }
  window.addEventListener('hashchange',function(){ tries=0; pendingProfileId=''; applyingCard=false; renderedVisitsId=''; visitsLoading=false; setTimeout(run,50); });
  document.addEventListener('DOMContentLoaded',function(){ tries=0; setTimeout(run,150); });
  try{ new MutationObserver(function(){ if((location.hash||'').indexOf('#patient')===0) setTimeout(enhancePatientProfile,120); }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  if(document.readyState!=='loading') setTimeout(run,150);
})();
