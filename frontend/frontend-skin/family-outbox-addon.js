/* Ernos Zdravstvena Njega - family notification outbox */
(function(){
  var timer=null;
  function $(s){return document.querySelector(s);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function fmt(v){if(!v)return '-';try{return new Date(v).toLocaleString('hr-HR');}catch(e){return String(v);}}
  function setTitle(t){var c=$('#crumbs');if(c)c.textContent=t;document.title='Ernos Zdravstvena Njega - '+t;}

  function ensureNav(){var nav=$('#nav');if(!nav||$('#navFamilyOutbox'))return;var a=document.createElement('a');a.href='#family-outbox';a.id='navFamilyOutbox';a.textContent='Obitelj';nav.appendChild(a);}
  function statusLabel(s){if(s==='sent')return 'Poslano';if(s==='prepared')return 'Pripremljeno';return s||'Zabilježeno';}

  function card(x){
    var sent=x.family_notification_status==='sent';
    return '<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">'+
        '<div><h3 style="margin-bottom:4px">'+esc(x.patient_name||'Pacijent')+'</h3><div class="muted">'+esc(x.address||'')+'</div><div class="muted">Kontakt: '+esc(x.family_notification_to||x.family_contact_phone||'-')+'</div></div>'+
        '<div class="tag" style="font-weight:900">'+esc(statusLabel(x.family_notification_status))+'</div>'+
      '</div>'+
      '<div class="muted" style="margin-top:8px">Pripremljeno: '+esc(fmt(x.family_notification_at))+(x.family_notification_sent_at?' · Poslano: '+esc(fmt(x.family_notification_sent_at)):'')+'</div>'+
      '<textarea readonly rows="5" id="familyMsg'+esc(x.id)+'" style="margin-top:10px">'+esc(x.family_notification_message||'')+'</textarea>'+
      (x.family_notification_sent_note?'<div class="muted" style="margin-top:6px"><strong>Napomena slanja:</strong> '+esc(x.family_notification_sent_note)+'</div>':'')+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+
        '<button class="btn small copyFamilyMsg" data-id="'+esc(x.id)+'" type="button">Kopiraj poruku</button>'+
        (!sent?'<button class="btn small ghost markFamilySent" data-id="'+esc(x.id)+'" type="button">Označi kao poslano</button>':'<button class="btn small ghost markFamilyPrepared" data-id="'+esc(x.id)+'" type="button">Vrati u pripremljeno</button>')+
        '<a class="btn small ghost" href="'+esc(x.profile_url||('#patient?id='+x.patient_id))+'">Profil</a>'+
        '<a class="btn small ghost" href="'+esc(x.summary_url||('#patient-summary?id='+x.patient_id))+'">Sažetak</a>'+
      '</div></div>';
  }

  function bind(){
    var copies=document.querySelectorAll('.copyFamilyMsg');
    for(var i=0;i<copies.length;i++)if(!copies[i].__bound){copies[i].__bound=true;copies[i].onclick=function(){var id=this.getAttribute('data-id');var t=$('#familyMsg'+id);if(t){t.select();document.execCommand('copy');this.textContent='Kopirano';var b=this;setTimeout(function(){b.textContent='Kopiraj poruku';},1200);}};}
    var sent=document.querySelectorAll('.markFamilySent');
    for(var j=0;j<sent.length;j++)if(!sent[j].__bound){sent[j].__bound=true;sent[j].onclick=function(){var id=this.getAttribute('data-id');var note=prompt('Kako je poslano? npr. WhatsApp, SMS, poziv, email','WhatsApp');if(note===null)return;this.disabled=true;api('/api/care/family-outbox/'+encodeURIComponent(id),{method:'PATCH',body:{status:'sent',note:note}}).then(render).catch(function(e){alert('Greška: '+(e.message||e));});};}
    var prep=document.querySelectorAll('.markFamilyPrepared');
    for(var k=0;k<prep.length;k++)if(!prep[k].__bound){prep[k].__bound=true;prep[k].onclick=function(){var id=this.getAttribute('data-id');this.disabled=true;api('/api/care/family-outbox/'+encodeURIComponent(id),{method:'PATCH',body:{status:'prepared',note:''}}).then(render).catch(function(e){alert('Greška: '+(e.message||e));});};}
  }

  function render(){
    ensureNav();
    var route=(location.hash||'').split('?')[0];if(route!=='#family-outbox')return;
    var view=$('#view');if(!view)return;setTitle('Obavijesti obitelji');
    view.innerHTML='<div class="card"><h2>Obavijesti obitelji</h2><p class="muted">Pripremljene poruke nakon završetka njege. Ovo još ne šalje automatski SMS/email — poruku kopiraš i označiš kao poslanu.</p><div class="muted">Učitavanje...</div></div>';
    api('/api/care/family-outbox?status=all').then(function(data){
      var items=data.items||[];var counts=data.counts||{};
      var html='<div class="card"><h2>Obavijesti obitelji</h2><p class="muted">Outbox pripremljenih poruka za obitelj.</p><div class="grid cols-3" style="margin-top:12px"><div class="tag" style="justify-content:center;font-weight:900">Pripremljeno: '+esc(counts.prepared||0)+'</div><div class="tag" style="justify-content:center;font-weight:900">Poslano: '+esc(counts.sent||0)+'</div><div class="tag" style="justify-content:center;font-weight:900">Ostalo: '+esc(counts.other||0)+'</div></div><div style="margin-top:12px"><button class="btn ghost" id="refreshFamilyOutbox" type="button">Osvježi</button></div></div>';
      if(!items.length)html+='<div class="empty">Nema pripremljenih obavijesti obitelji.</div>';else for(var i=0;i<items.length;i++)html+=card(items[i]);
      view.innerHTML=html;var r=$('#refreshFamilyOutbox');if(r)r.onclick=render;bind();
    }).catch(function(e){view.innerHTML='<div class="alert err">Greška: '+esc(e.message||e)+'</div>';});
  }
  function schedule(){ensureNav();if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;render();},250);}
  window.addEventListener('hashchange',schedule);
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){ensureNav();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();
