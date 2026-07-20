/* Ernos Zdravstvena Njega - brand cleanup */
(function(){
  function $(s){return document.querySelector(s);}
  function cleanHeader(){
    var badge=$('#userBadge');
    if(badge){
      var tags=badge.querySelectorAll('.tag');
      for(var i=tags.length-1;i>=0;i--){
        var txt=(tags[i].textContent||'').trim().toLowerCase();
        if(txt.indexOf('mount sackville')>=0 || txt.indexOf('nursing home')>=0 || txt.indexOf('sackville')>=0){
          tags[i].parentNode.removeChild(tags[i]);
        }
      }
    }
    var logo=document.querySelector('.brand-logo img,.brand img');
    if(logo){
      var wanted='/skin/icons/ernos-logo.svg?v=20260720-1';
      if(logo.getAttribute('src')!==wanted){logo.setAttribute('src',wanted);}
      logo.setAttribute('alt','Ernos Zdravstvena Njega');
      if(logo.parentElement)logo.parentElement.classList.remove('logo-missing');
    }
    var fallback=document.querySelector('.brand-fallback');
    if(fallback)fallback.textContent='E';
  }
  document.addEventListener('DOMContentLoaded',cleanHeader);
  try{new MutationObserver(cleanHeader).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(e){}
  if(document.readyState!=='loading')setTimeout(cleanHeader,50);
})();
