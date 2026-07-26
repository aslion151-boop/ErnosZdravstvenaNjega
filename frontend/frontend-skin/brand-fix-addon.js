/* Ernos Zdravstvena Njega - remove legacy tenant badge only */
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

  function scheduleClean(){
    cleanHeader();
    setTimeout(cleanHeader,50);
    setTimeout(cleanHeader,250);
    setTimeout(cleanHeader,750);
  }

  document.addEventListener('DOMContentLoaded',scheduleClean);
  window.addEventListener('hashchange',scheduleClean);
  window.addEventListener('storage',scheduleClean);

  try{
    var obs=new MutationObserver(function(){cleanHeader();});
    obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  }catch(e){}

  var n=0;
  var iv=setInterval(function(){
    cleanHeader();
    n++;
    if(n>40)clearInterval(iv);
  },250);

  if(document.readyState!=='loading')scheduleClean();
})();