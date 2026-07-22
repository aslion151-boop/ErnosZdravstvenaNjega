/* Ernos Zdravstvena Njega - scan context: tasks and supplies */
(function(){
  if(window.__ernosScanContextLoaded)return;window.__ernosScanContextLoaded=true;
  var timer=null,lastCode='';
  function $(s){return document.querySelector(s);} 
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return(window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return'';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function scanCode(){var h=location.hash||'';if(h.split('?')[0]!=='#scan')return'';return new URLSearchParams(h.split('?')[1]||'').get('t')||'';}
  function list(items,fn,empty){if(!items||!items.length)return'<div class="muted">'+esc(empty)+'</div>';var html='<ul style="margin:6px 0 0 18px">';for(var i=0;i<items.length;i++)html+='<li>'+fn(items[i])+'</li>';return html+'</ul>';}
  function renderBox(pid,patientName){
    Promise.all([
      api('/api/care/patients/'+encodeURIComponent(pid)+'/tasks').catch(function(){return{items:[]};}),
      api('/api/care/patients/'+encodeURIComponent(pid)+'/supplies').catch(function(){return{items:[]};})
    ]).then(function(all){
      if((location.hash||'').split('?')[0]!=='#scan')return;
      var tasks=((all[0]&&all[0].items)||[]).filter(function(x){return String(x.status||'open').toLowerCase()==='open';});
      var supplies=((all[1]&&all[1].items)||[]).filter(function(x){var s=String(x.status||'').toLowerCase();return s==='nisko'||s==='naručiti'||s==='naruciti';});
      var old=$('#scanContextCard');if(old)old.remove();
      if(!tasks.length&&!supplies.length)return;
      var box=document.createElement('div');box.className='card';box.id='scanContextCard';
      box.innerHTML='<h3>Prije početka njege</h3><p class="muted">Otvoreni zadaci i materijali za '+esc(patientName||'pacijenta')+'.</p>'+
        '<div class="grid cols-2">'+
          '<div><strong>Otvoreni zadaci</strong>'+list(tasks,function(t){return esc(t.priority||'')+' · '+esc(t.title||'')+(t.due_text?' · rok: '+esc(t.due_text):'')+(t.details?' — '+esc(t.details):'');},'Nema otvorenih zadataka.')+'</div>'+
          '<div><strong>Materijal nisko / naručiti</strong>'+list(supplies,function(s){return esc(s.status||'')+' · '+esc(s.item_name||'')+(s.quantity?' · '+esc(s.quantity):'')+(s.location_note?' · '+esc(s.location_note):'')+(s.note?' — '+esc(s.note):'');},'Nema označenog materijala.')+'</div>'+
        '</div><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn small ghost" href="#patient?id='+esc(pid)+'">Uredi pacijenta</a></div>';
      var target=$('#realScanCard')||document.querySelector('#view .card');
      if(target&&target.parentNode)target.parentNode.insertBefore(box,target.nextSibling);else{var view=$('#view');if(view)view.appendChild(box);}
    }).catch(function(){});
  }
  function run(){var code=scanCode();if(!code)return;var existing=$('#scanContextCard');if(code===lastCode&&existing)return;lastCode=code;api('/api/care/scan/'+encodeURIComponent(code)).then(function(data){var p=data.patient||data.item||{};var pid=p.id||data.patient_id;if(!pid)return;var nm=String((p.first_name||'')+' '+(p.last_name||'')).trim()||p.patient_name||'pacijenta';renderBox(pid,nm);}).catch(function(){});} 
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;run();},700);} 
  window.addEventListener('hashchange',function(){lastCode='';schedule();});document.addEventListener('DOMContentLoaded',schedule);try{new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}if(document.readyState!=='loading')schedule();
})();