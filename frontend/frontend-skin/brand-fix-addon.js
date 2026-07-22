/* Ernos Zdravstvena Njega - brand cleanup and lazy addon loader */
(function(){
  var booted=false;
  var lastRoute='';
  var timer=null;

  function $(s){return document.querySelector(s);}

  function loadScriptOnce(src,flag,label){
    var base=src.split('?')[0];
    if(window[flag]||document.querySelector('script[src^="'+base+'"]'))return;
    window[flag]=true;
    var s=document.createElement('script');
    s.src=src;
    s.onload=function(){window[flag]=false;};
    s.onerror=function(){window[flag]=false;console.warn('[brand-fix] '+label+' load failed');};
    document.head.appendChild(s);
  }

  function addNav(id,href,text){
    var nav=$('#nav');
    if(!nav||$('#'+id))return;
    var a=document.createElement('a');
    a.id=id;
    a.href=href;
    a.textContent=text;
    nav.appendChild(a);
  }

  function ensureNavLinks(){
    addNav('navFieldPrepStatic','#field-prep','Teren');
    addNav('navSuppliesStatic','#care-supplies','Materijali');
    addNav('navIncidentsStatic','#care-incidents','Događaji');
    addNav('navFamilyOutboxStatic','#family-outbox','Obitelj');
    addNav('navContactsStatic','#contacts','Kontakti');
    addNav('navTasksStatic','#care-tasks','Zadaci');
  }

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
      if(logo.getAttribute('src')!==wanted)logo.setAttribute('src',wanted);
      logo.setAttribute('alt','Ernos Zdravstvena Njega');
      if(logo.parentElement)logo.parentElement.classList.remove('logo-missing');
    }
    var fallback=document.querySelector('.brand-fallback');
    if(fallback)fallback.textContent='E';
    ensureNavLinks();
  }

  function route(){return (location.hash||'').split('?')[0];}

  function loadForRoute(){
    var r=route();
    if(!booted){
      // Lightweight global helpers only. Avoid loading all feature add-ons at startup.
      loadScriptOnce('/tasks-addon.js?v=20260720-1','__ernosTasksLoading','tasks');
      booted=true;
    }
    if(r===lastRoute)return;
    lastRoute=r;

    if(r==='#patient'){
      loadScriptOnce('/patient-summary-addon.js?v=20260708-1','__ernosPatientSummaryLoading','patient summary');
      loadScriptOnce('/patient-search-addon.js?v=20260708-1','__ernosPatientSearchLoading','patient search');
      loadScriptOnce('/tasks-addon.js?v=20260720-1','__ernosTasksLoading','tasks');
      loadScriptOnce('/supplies-addon.js?v=20260720-1','__ernosSuppliesLoading','supplies');
      loadScriptOnce('/incidents-addon.js?v=20260720-1','__ernosIncidentsLoading','incidents');
      loadScriptOnce('/care-log-addon.js?v=20260720-1','__ernosCareLogLoading','care log');
      loadScriptOnce('/contacts-addon.js?v=20260720-1','__ernosContactsLoading','contacts');
    }
    if(r==='#scan'){
      loadScriptOnce('/scan-context-addon.js?v=20260720-1','__ernosScanContextLoading','scan context');
      loadScriptOnce('/scan-templates-addon.js?v=20260720-1','__ernosScanTemplatesLoading','scan templates');
      loadScriptOnce('/patient-safety-addon.js?v=20260708-1','__ernosPatientSafetyLoading','patient safety');
    }
    if(r==='#today'){
      loadScriptOnce('/today-focus-addon.js?v=20260720-1','__ernosTodayFocusLoading','today focus');
      loadScriptOnce('/patient-search-addon.js?v=20260708-1','__ernosPatientSearchLoading','patient search');
    }
    if(r==='#field-prep'){
      loadScriptOnce('/field-prep-addon.js?v=20260720-1','__ernosFieldPrepLoading','field prep');
    }
    if(r==='#care-supplies'){
      loadScriptOnce('/supplies-addon.js?v=20260720-1','__ernosSuppliesLoading','supplies');
    }
    if(r==='#care-incidents'){
      loadScriptOnce('/incidents-addon.js?v=20260720-1','__ernosIncidentsLoading','incidents');
    }
    if(r==='#family-outbox'){
      loadScriptOnce('/family-outbox-addon.js?v=20260720-1','__ernosFamilyOutboxLoading','family outbox');
    }
    if(r==='#contacts'){
      loadScriptOnce('/contacts-addon.js?v=20260720-1','__ernosContactsLoading','contacts');
    }
    if(r==='#patient-summary'){
      loadScriptOnce('/patient-summary-addon.js?v=20260708-1','__ernosPatientSummaryLoading','patient summary');
      loadScriptOnce('/care-log-addon.js?v=20260720-1','__ernosCareLogLoading','care log');
    }
  }

  function schedule(){
    cleanHeader();
    if(timer)clearTimeout(timer);
    timer=setTimeout(function(){timer=null;loadForRoute();},120);
  }

  document.addEventListener('DOMContentLoaded',schedule);
  window.addEventListener('hashchange',schedule);
  try{
    new MutationObserver(function(){cleanHeader();}).observe(document.documentElement,{childList:true,subtree:true});
  }catch(e){}
  if(document.readyState!=='loading')schedule();
})();
