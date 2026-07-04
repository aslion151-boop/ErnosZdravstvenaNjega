/* Ernos Zdravstvena Njega - QR/NFC scan addon */
(function(){
  var pendingProfileId = '';
  var applyingCard = false;
  var qrLibLoading = false;
  var qrLibReadyCallbacks = [];

  function $(s){ return document.querySelector(s); }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;}); }
  function token(){ try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';} }
  function api(path, opts){ opts=opts||{}; var h={'Content-Type':'application/json'}; var t=token(); if(t)h.Authorization='Bearer '+t; return fetch(location.origin+path,{method:opts.method||'GET',headers:h,body:opts.body?JSON.stringify(opts.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null; try{j=txt?JSON.parse(txt):null;}catch(e){} if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status)); return j||{};});}); }
  function params(){return new URLSearchParams((location.hash.split('?')[1]||''));}
  function full(p){return String((p.first_name||'')+' '+(p.last_name||'')).trim();}
  function fmt(v){if(!v)return '-'; try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);} }
  function setTitle(t){ var c=$('#crumbs'); if(c)c.textContent=t; document.title='Ernos Zdravstvena Njega - '+t; }

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
        view.innerHTML='<div class="card"><h2>'+esc(full(p))+'</h2><p class="muted">'+esc(p.address||'')+'</p></div>'+ 
          '<div class="card"><h3>Status njege</h3><p>'+(isOpen?'<strong style="color:var(--ok)">Njega je započeta</strong><br><span class="muted">Početak: '+esc(fmt(open.started_at))+' · '+esc(open.started_by_name||'')+'</span>':'<strong>Njega nije započeta</strong>')+'</p>'+ 
          '<label>Napomena</label><textarea id="visitNote" rows="3" placeholder="Opcionalno"></textarea>'+ 
          '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="toggleVisit" type="button">'+(isOpen?'Završetak njege':'Početak njege')+'</button><a class="btn ghost" href="#patient?id='+esc(p.id)+'">Profil pacijenta</a></div><div id="scanMsg" class="muted" style="margin-top:8px"></div></div>';
        var btn=$('#toggleVisit');
        if(btn)btn.onclick=function(){
          var note=$('#visitNote')?$('#visitNote').value:''; var msg=$('#scanMsg');
          btn.disabled=true; btn.textContent=isOpen?'Završavam...':'Započinjem...';
          api('/api/care/scan/'+encodeURIComponent(code)+'/toggle',{method:'POST',body:{note:note}}).then(function(r){ if(msg)msg.textContent=(r.action==='IN'?'Njega započeta.':'Njega završena.'); load(); }).catch(function(err){ if(msg)msg.textContent='Greška: '+(err.message||err); btn.disabled=false; btn.textContent=isOpen?'Završetak njege':'Početak njege'; });
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

  function removeQrCards(view){
    var cards=view.querySelectorAll('.card');
    for(var i=cards.length-1;i>=0;i--){ if(isQrCard(cards[i])) cards[i].parentNode.removeChild(cards[i]); }
  }

  function enhancePatientProfile(){
    var r=(location.hash||'').split('?')[0];
    if(r !== '#patient') return;
    var id=params().get('id'); if(!id) return;
    var view=$('#view'); if(!view) return;
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
  window.addEventListener('hashchange',function(){ tries=0; pendingProfileId=''; applyingCard=false; setTimeout(run,50); });
  document.addEventListener('DOMContentLoaded',function(){ tries=0; setTimeout(run,150); });
  try{ new MutationObserver(function(){ if((location.hash||'').indexOf('#patient')===0) setTimeout(enhancePatientProfile,80); }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  if(document.readyState!=='loading') setTimeout(run,150);
})();
