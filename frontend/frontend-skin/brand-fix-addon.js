/* Ernos Zdravstvena Njega - brand cleanup */
(function(){
  function $(s){return document.querySelector(s);}
  function loadScriptOnce(src,flag,label){
    if(window[flag]||document.querySelector('script[src^="'+src.split('?')[0]+'"]'))return;
    window[flag]=true;
    var s=document.createElement('script');
    s.src=src;
    s.onload=function(){window[flag]=false;};
    s.onerror=function(){window[flag]=false;console.warn('[brand-fix] '+label+' load failed');};
    document.head.appendChild(s);
  }
  function loadTasks(){loadScriptOnce('/tasks-addon.js?v=20260720-1','__ernosTasksLoading','tasks');}
  function loadFamilyOutbox(){loadScriptOnce('/family-outbox-addon.js?v=20260720-1','__ernosFamilyOutboxLoading','family outbox');}
  function loadCareLog(){loadScriptOnce('/care-log-addon.js?v=20260720-1','__ernosCareLogLoading','care log');}
  function loadIncidents(){loadScriptOnce('/incidents-addon.js?v=20260720-1','__ernosIncidentsLoading','incidents');}
  function loadSupplies(){loadScriptOnce('/supplies-addon.js?v=20260720-1','__ernosSuppliesLoading','supplies');}
  function loadFieldPrep(){loadScriptOnce('/field-prep-addon.js?v=20260720-1','__ernosFieldPrepLoading','field prep');}
  function loadTodayFocus(){loadScriptOnce('/today-focus-addon.js?v=20260720-1','__ernosTodayFocusLoading','today focus');}
  function cleanHeader(){
    loadTasks();
    loadFamilyOutbox();
    loadCareLog();
    loadIncidents();
    loadSupplies();
    loadFieldPrep();
    loadTodayFocus();
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