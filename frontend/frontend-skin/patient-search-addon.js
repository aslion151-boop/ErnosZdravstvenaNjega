/* Ernos Zdravstvena Njega - global patient search addon */
(function(){
  var patients=[];
  var loaded=false;
  var loading=false;
  var lastQuery='';
  var timer=null;

  function $(s){return document.querySelector(s);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]||ch;});}
  function token(){try{return (window.state&&window.state.token)||sessionStorage.getItem('ernosToken')||localStorage.getItem('ernosToken')||'';}catch(e){return '';}}
  function api(path,opt){opt=opt||{};var h={'Content-Type':'application/json'};var t=token();if(t)h.Authorization='Bearer '+t;return fetch(location.origin+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.text().then(function(txt){var j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}if(!r.ok)throw new Error((j&&(j.error||j.detail||j.message))||txt||('HTTP '+r.status));return j||{};});});}
  function full(p){return String((p.first_name||'')+' '+(p.last_name||'')).trim()||('Pacijent #'+p.id);}
  function norm(v){return String(v==null?'':v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

  function ensureShell(){
    var header=document.querySelector('.skin-header');
    if(!header||$('#patientSearchBox'))return;
    var wrap=document.createElement('div');
    wrap.id='patientSearchBox';
    wrap.style.cssText='position:relative;min-width:240px;max-width:420px;flex:1';
    wrap.innerHTML='<input id="patientQuickSearch" placeholder="Pretraži pacijenta..." autocomplete="off" style="min-height:38px;padding-right:36px"><div id="patientSearchResults" style="display:none;position:absolute;left:0;right:0;top:44px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);z-index:60;max-height:420px;overflow:auto"></div>';
    var left=header.querySelector('.header-left');
    if(left&&left.parentNode)left.parentNode.insertBefore(wrap,left.nextSibling);else header.appendChild(wrap);
    var input=$('#patientQuickSearch');
    if(input){
      input.addEventListener('focus',function(){loadPatients();renderResults();});
      input.addEventListener('input',function(){lastQuery=input.value;loadPatients();renderResults();});
      input.addEventListener('keydown',function(e){
        if(e.key==='Escape'){hideResults();input.blur();}
        if(e.key==='Enter'){
          var first=document.querySelector('#patientSearchResults a[data-primary="1"]');
          if(first){e.preventDefault();location.hash=first.getAttribute('href');hideResults();input.value='';lastQuery='';}
        }
      });
    }
    document.addEventListener('click',function(e){var box=$('#patientSearchBox');if(box&&!box.contains(e.target))hideResults();});
  }

  function loadPatients(force){
    if(loading)return;
    if(loaded&&!force)return;
    if(!token())return;
    loading=true;
    api('/api/patients').then(function(data){patients=data.items||[];loaded=true;renderResults();}).catch(function(e){console.warn('[patient-search-addon] failed',e);}).then(function(){loading=false;});
  }

  function matchPatients(q){
    q=norm(q).trim();
    if(!q)return [];
    var words=q.split(/\s+/).filter(Boolean);
    var out=[];
    for(var i=0;i<patients.length;i++){
      var p=patients[i];
      var hay=norm([full(p),p.address,p.phone,p.family_contact_name,p.family_contact_phone,p.notes].join(' '));
      var ok=true;for(var j=0;j<words.length;j++){if(hay.indexOf(words[j])<0){ok=false;break;}}
      if(ok)out.push(p);
      if(out.length>=8)break;
    }
    return out;
  }

  function renderResults(){
    var res=$('#patientSearchResults');var input=$('#patientQuickSearch');if(!res||!input)return;
    var q=input.value||lastQuery||'';
    if(!q.trim()){res.style.display='none';res.innerHTML='';return;}
    if(loading&&!loaded){res.style.display='block';res.innerHTML='<div class="muted" style="padding:12px">Učitavanje pacijenata...</div>';return;}
    var items=matchPatients(q);
    if(!items.length){res.style.display='block';res.innerHTML='<div class="muted" style="padding:12px">Nema rezultata.</div>';return;}
    var html='';
    for(var i=0;i<items.length;i++){
      var p=items[i];
      html+='<div style="padding:10px 12px;border-bottom:1px solid var(--border)">'+
        '<div><strong>'+esc(full(p))+'</strong></div>'+ 
        '<div class="muted" style="font-size:13px">'+esc(p.address||'-')+(p.phone?' · '+esc(p.phone):'')+'</div>'+ 
        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">'+
          '<a class="btn small" data-primary="1" href="#patient?id='+encodeURIComponent(p.id)+'">Profil</a>'+ 
          '<button class="btn small ghost searchScanBtn" data-id="'+esc(p.id)+'" type="button">Scan</button>'+ 
        '</div>'+ 
      '</div>';
    }
    res.style.display='block';res.innerHTML=html;
    var links=res.querySelectorAll('a');for(var a=0;a<links.length;a++)links[a].onclick=function(){hideResults();if(input){input.value='';lastQuery='';}};
    var btns=res.querySelectorAll('.searchScanBtn');for(var b=0;b<btns.length;b++)btns[b].onclick=function(){
      var id=this.getAttribute('data-id');var btn=this;btn.disabled=true;btn.textContent='Otvaram...';
      api('/api/care/patients/'+encodeURIComponent(id)+'/code').then(function(data){hideResults();if(input){input.value='';lastQuery='';}location.hash='#scan?t='+encodeURIComponent(data.code||'');}).catch(function(e){btn.disabled=false;btn.textContent='Scan';alert('Greška: '+(e.message||e));});
    };
  }

  function hideResults(){var r=$('#patientSearchResults');if(r){r.style.display='none';r.innerHTML='';}}
  function schedule(){if(timer)clearTimeout(timer);timer=setTimeout(function(){timer=null;ensureShell();if(token())loadPatients(false);},300);}
  window.addEventListener('hashchange',schedule);
  document.addEventListener('DOMContentLoaded',schedule);
  try{new MutationObserver(function(){schedule();}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
  if(document.readyState!=='loading')schedule();
})();
