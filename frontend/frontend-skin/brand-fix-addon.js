/* Ernos Zdravstvena Njega - small UI cleanup only */
(function(){
  if(window.__ernosMinimalBrandFixLoaded)return;
  window.__ernosMinimalBrandFixLoaded=true;

  function isLegacyTenantText(txt){
    txt=String(txt||'').trim().toLowerCase();
    return txt.indexOf('mount sackville')>=0 || txt.indexOf('nursing home')>=0 || txt.indexOf('sackville')>=0;
  }

  function cleanHeader(){
    var badge=document.querySelector('#userBadge');
    if(!badge)return;
    var tags=badge.querySelectorAll('.tag');
    for(var i=tags.length-1;i>=0;i--){
      var txt=tags[i].textContent||'';
      if(isLegacyTenantText(txt)){
        try{tags[i].parentNode.removeChild(tags[i]);}catch(e){}
      }
    }
  }

  function cleanPatientUi(){
    var navAdd=document.querySelector('#nav a[href="#patient-new"]');
    if(navAdd && navAdd.textContent.trim()!== 'Dodaj pacijenta'){
      navAdd.textContent='Dodaj pacijenta';
    }

    var route=(location.hash||'').split('?')[0];
    if(route==='#patients'){
      var view=document.querySelector('#view');
      if(view){
        var links=view.querySelectorAll('a[href="#patient-new"]');
        for(var i=links.length-1;i>=0;i--){
          var txt=(links[i].textContent||'').trim().toLowerCase();
          if(txt.indexOf('dodaj pacijenta')>=0){
            try{links[i].parentNode.removeChild(links[i]);}catch(e){}
          }
        }
      }
    }
  }

  function run(){
    cleanHeader();
    cleanPatientUi();
  }

  function scheduleClean(){
    run();
    setTimeout(run,50);
    setTimeout(run,250);
    setTimeout(run,750);
  }

  document.addEventListener('DOMContentLoaded',scheduleClean);
  window.addEventListener('hashchange',scheduleClean);
  window.addEventListener('storage',scheduleClean);

  try{
    var obs=new MutationObserver(function(){run();});
    obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  }catch(e){}

  var n=0;
  var iv=setInterval(function(){
    run();
    n++;
    if(n>40)clearInterval(iv);
  },250);

  if(document.readyState!=='loading')scheduleClean();
})();