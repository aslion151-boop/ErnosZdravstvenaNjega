/* Ernos Zdravstvena Njega - brand cleanup only, stability mode */
(function(){
  var timer=null;
  function $(s){return document.querySelector(s);}
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
    addNav('navTodayStable','#today','Danas');
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
  function schedule(){
    if(timer)clearTimeout(timer);
    timer=setTimeout(function(){timer=null;cleanHeader();},150);
  }
  document.addEventListener('DOMContentLoaded',schedule);
  window.addEventListener('hashchange',schedule);
  if(document.readyState!=='loading')schedule();
})();