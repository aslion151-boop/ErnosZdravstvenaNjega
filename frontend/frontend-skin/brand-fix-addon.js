/* Ernos Zdravstvena Njega - small safe UI cleanup */
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

  function removeHelperCopy(){
    var view=document.querySelector('#view');
    if(!view)return;
    var texts=[
      'Lista pacijenata je odmah dostupna. Dodavanje je odvojeno u sidebaru.',
      'Ovo je zaseban ekran. Upiši osnovno, ostalo možeš dopuniti kasnije.'
    ];
    var ps=view.querySelectorAll('p');
    for(var i=ps.length-1;i>=0;i--){
      var txt=(ps[i].textContent||'').trim();
      for(var j=0;j<texts.length;j++){
        if(txt===texts[j]){
          try{ps[i].parentNode.removeChild(ps[i]);}catch(e){}
          break;
        }
      }
    }
  }

  function run(){
    cleanHeader();
    removeHelperCopy();
  }

  function scheduleClean(){
    run();
    setTimeout(run,50);
    setTimeout(run,250);
  }

  document.addEventListener('DOMContentLoaded',scheduleClean);
  window.addEventListener('hashchange',scheduleClean);
  if(document.readyState!=='loading')scheduleClean();
})();
