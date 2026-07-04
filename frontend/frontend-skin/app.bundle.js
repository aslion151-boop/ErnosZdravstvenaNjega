/* Ernos Zdravstvena Njega loader */
(function(){
  function add(src, cb){
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = function(){ if (cb) cb(); };
    document.head.appendChild(s);
  }
  add('/app.bundle.legacy.js?v=20260704-2', function(){
    add('/hr-rebrand.js?v=20260704-2');
  });
})();
