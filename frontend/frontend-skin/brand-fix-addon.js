/* Ernos Zdravstvena Njega - safe UI cleanup */
(function(){
  if(window.__ernosSafeUiCleanupLoaded)return;
  window.__ernosSafeUiCleanupLoaded=true;

  function norm(v){return String(v||'').replace(/\s+/g,' ').trim().toLowerCase();}

  function isLegacyTenantText(txt){
    txt=norm(txt);
    return txt.indexOf('mount sackville')>=0 || txt.indexOf('nursing home')>=0 || txt.indexOf('sackville')>=0;
  }

  function cleanHeader(){
    var badge=document.querySelector('#userBadge');
    if(!badge)return;
    var tags=badge.querySelectorAll('.tag');
    for(var i=tags.length-1;i>=0;i--){
      if(isLegacyTenantText(tags[i].textContent||'')){
        try{tags[i].remove();}catch(e){}
      }
    }
  }

  function shouldRemoveParagraph(txt){
    txt=norm(txt);
    return txt.indexOf('lista pacijenata je odmah dostupna')>=0 ||
           txt.indexOf('dodavanje je odvojeno u sidebaru')>=0 ||
           txt.indexOf('ovo je zaseban ekran')>=0 ||
           txt.indexOf('upiši osnovno')>=0 ||
           txt.indexOf('upisi osnovno')>=0 ||
           txt.indexOf('ostalo možeš dopuniti kasnije')>=0 ||
           txt.indexOf('ostalo mozes dopuniti kasnije')>=0;
  }

  function cleanPatientCopy(){
    var view=document.querySelector('#view');
    if(!view)return;
    var ps=view.querySelectorAll('p');
    for(var i=ps.length-1;i>=0;i--){
      if(shouldRemoveParagraph(ps[i].textContent||'')){
        try{ps[i].remove();}catch(e){}
      }
    }
  }

  function run(){
    cleanHeader();
    cleanPatientCopy();
  }

  function schedule(){
    run();
    setTimeout(run,0);
    setTimeout(run,50);
    setTimeout(run,250);
    setTimeout(run,750);
  }

  document.addEventListener('DOMContentLoaded',schedule);
  window.addEventListener('hashchange',schedule);
  window.addEventListener('load',schedule);

  try{
    var target=document.querySelector('#view')||document.body||document.documentElement;
    var queued=false;
    var obs=new MutationObserver(function(){
      if(queued)return;
      queued=true;
      setTimeout(function(){queued=false;run();},30);
    });
    obs.observe(target,{childList:true,subtree:true});
  }catch(e){}

  var n=0;
  var iv=setInterval(function(){
    run();
    n++;
    if(n>40)clearInterval(iv);
  },250);

  if(document.readyState!=='loading')schedule();
})();