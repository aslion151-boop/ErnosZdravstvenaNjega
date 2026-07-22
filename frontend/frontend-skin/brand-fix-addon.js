/* Ernos Zdravstvena Njega - minimal header cleanup only */
(function(){
  var timer=null;

  function cleanHeader(){
    var badge=document.querySelector('#userBadge');
    if(badge){
      var tags=badge.querySelectorAll('.tag');
      for(var i=tags.length-1;i>=0;i--){
        var txt=(tags[i].textContent||'').trim().toLowerCase();
        if(txt.indexOf('mount sackville')>=0 || txt.indexOf('nursing home')>=0 || txt.indexOf('sackville')>=0){
          tags[i].parentNode.removeChild(tags[i]);
        }
      }
    }
  }

  function schedule(){
    if(timer)clearTimeout(timer);
    timer=setTimeout(function(){timer=null;cleanHeader();},150);
  }

  document.addEventListener('DOMContentLoaded',schedule);
  window.addEventListener('hashchange',schedule);
  if(document.readyState!=='loading')schedule();
})();
