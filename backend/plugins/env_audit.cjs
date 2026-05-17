// backend/plugins/env_audit.cjs
// Environmental Audit TAP + mobile runner pages

module.exports = function setupEnvAudit(opts = {}) {
  const {
    app,
    PUBLIC_API_URL = "",
  } = opts;

  if (!app) throw new Error("[env_audit] Missing { app }");

  const apiBase = (PUBLIC_API_URL || "").trim();

  // Small helper: disable caching for TAP pages
  function nocache(res) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }

  // ----------------------------------------------------
  // Mobile-friendly audit runner UI
  // GET /audit/:auditId
  // ----------------------------------------------------
  app.get("/audit/:auditId", (req, res) => {
    const api = apiBase || "";
    const auditId = String(req.params.auditId || "").trim();

    res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Ernos • Audit #${auditId}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  /* Use skin variables so this page matches your current theme */
  *{box-sizing:border-box}
  :root{
    /* Ernos sidebar-themed runner */
    --bg:#4E6E81;         /* same as --sidebar-gray */
    --panel:#FFFFFF;      /* white cards on colored background */
    --text:#EAF1F4;       /* same as --sidebar-link */
    --muted:#D7E3E8;      /* same as --sidebar-link-muted */
    --border:#3E5967;     /* same as --sidebar-gray-darker */
    --accent:#7BA297;     /* existing accent color */
  }
  body{margin:0;background:var(--bg);color:var(--text);font:15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif}
  header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border)}
  header img{height:40px}
  main{max-width:720px;margin:0 auto;padding:0 12px 100px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:12px;margin:12px 0}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  select,button{font:inherit}
  select{width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--text)}
  .q{padding:10px;border-radius:12px;border:1px solid var(--border);margin:8px 0;background:#fff}
  .sec{font-weight:700;color:var(--muted);margin-bottom:4px}
  .txt{margin:4px 0 10px;color:var(--text)}
  .btns{display:flex;gap:8px}
  .btn{flex:1;padding:10px 12px;border-radius:10px;border:1px solid var(--border);cursor:pointer;font-weight:700;transition:background .12s ease, transform .05s ease;background:#fff;color:var(--text)}
  .btn:active{transform:scale(.98)}
  .yes.active{background:#e9f5ef;border-color:#cfe8db}
  .no.active{background:#fdeeee;border-color:#f1c9c9}
  .muted{color:var(--muted)}
  .sticky{position:fixed;left:0;right:0;bottom:0;background:linear-gradient(180deg, rgba(255,255,255,0), var(--bg) 24px);padding:16px}
  .action{max-width:720px;margin:0 auto;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:10px;display:flex;gap:10px;align-items:center}
  .action .submit{flex:1;padding:12px;border-radius:10px;border:0;background:var(--accent);color:white;font-weight:800}
  .score{font-weight:700}
  #msg{margin:8px 0;padding:10px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--muted);display:none}
  .ok{border-color:#CFE8DB;background:#E9F5EF;color:#1D5C45}
  .err{border-color:#F1C9C9;background:#FDEEEE;color:#7A2A2A}
</style>

<body>
  <header>
    <img src="/skin/icons/logo.png" onerror="this.src='/icons/icon.svg'">
    <h2 style="margin:0">Environmental Audit</h2>
    <button id="btnCsv" style="margin-left:auto;padding:8px 10px;border-radius:10px;border:0;background:#2e8af6;color:#fff;font-weight:700">
      Download CSV
    </button>
  </header>
  <main>
    <div id="msg"></div>
    <div class="card">
      <div class="row">
        <label for="locSel" class="muted">Audit #${auditId} • Location</label>
        <select id="locSel"></select>
      </div>
      <div class="muted" id="locHint">Tip: scan a location tag first if the list is empty.</div>
    </div>
    <div id="qWrap"></div>
  </main>
  <div class="sticky">
    <div class="action">
      <div class="muted">Overall: <span id="overall" class="score">–</span></div>
      <button class="submit" id="btnSubmit">Submit Audit</button>
    </div>
  </div>
<script>
(function(){
  const API = ${JSON.stringify(api)} || location.origin;
  const AUDIT_ID = ${JSON.stringify(auditId)};
  const $ = (id)=>document.getElementById(id);
  const msg = (t, cls='')=>{ const el=$('msg'); if(!t){ el.style.display='none'; el.textContent=''; el.className=''; return; } el.textContent=t; el.className=cls; el.style.display=''; };

  // CSV download (runner page)
  (function(){
    const btn = $('btnCsv');
    if(!btn) return;
    let JWT = ""; try{ JWT = localStorage.getItem('ernosToken') || ""; }catch(_){}
    btn.onclick = function(){
      if(!JWT){ alert("Sign in first in the app, then reload."); return; }
      fetch((API||location.origin) + "/env/audits/" + encodeURIComponent(AUDIT_ID) + "/csv", {
        headers: { "Authorization": "Bearer " + JWT }
      })
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.blob(); })
      .then(function(b){
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "audit_" + AUDIT_ID + ".csv";
        document.body.appendChild(a); a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
      })
      .catch(function(e){ alert(e && e.message ? e.message : String(e)); });
    };
  })();

  // Keep Android/iOS back inside the app when opened directly
  (function(){
    const cameFromApp = /\\/app\\.html/i.test(document.referrer || "");
    if (cameFromApp) return;
    try {
      history.pushState({stub:1}, "", "#audit");
      window.addEventListener("popstate", function(){
        const api = (API || location.origin);
        location.replace("/?api=" + encodeURIComponent(api) + "&nosw=1");
      });
    } catch(_){}
  })();

  // Get JWT from app
  let JWT = ''; try{ JWT = localStorage.getItem('ernosToken') || ''; }catch(_){}
  if(!JWT){ msg('You are not signed in. Open the Ernos app, sign in (Auditor/Admin), then reload.', 'err'); }

  function authFetch(url, opts){
    opts = opts || {}; opts.headers = Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + JWT });
    return fetch(url, opts).then(r => r.json().then(j => { if(!r.ok) throw new Error(j && j.error || ('HTTP '+r.status)); return j; }));
  }

  function renderQuestions(auditLocId, responses){
    const wrap = $('qWrap'); wrap.innerHTML = '';
    const map = new Map(); // qid -> answer
    (responses||[]).forEach(r => { if(r.question_id) map.set(String(r.question_id), (r.answer||'').toUpperCase()); });

    // group by section
    const groups = {};
    (responses||[]).forEach(r=>{
      const s = r.section || 'General'; (groups[s] = groups[s] || []).push(r);
    });

    Object.keys(groups).forEach(section=>{
      groups[section].forEach(r=>{
        const q = document.createElement('div'); q.className = 'q'; q.dataset.qid = r.question_id;
        const sec = document.createElement('div'); sec.className = 'sec'; sec.textContent = section;
        const txt = document.createElement('div'); txt.className = 'txt'; txt.textContent = r.text;

        const btns = document.createElement('div'); btns.className = 'btns';
        const yes = document.createElement('button'); yes.className = 'btn yes'; yes.textContent = 'YES'; yes.setAttribute('aria-pressed','false');
        const no  = document.createElement('button');  no.className = 'btn no';  no.textContent  = 'NO';  no.setAttribute('aria-pressed','false');

        function setActive(val){
          const y = (val==='YES'), n = (val==='NO');
          yes.classList.toggle('active', y);
          no.classList.toggle('active',  n);
          yes.setAttribute('aria-pressed', String(y));
          no.setAttribute('aria-pressed', String(n));
        }

        setActive(map.get(String(r.question_id)) || '');

        yes.onclick = ()=>{
          const prev = yes.classList.contains('active') ? 'YES' : (no.classList.contains('active') ? 'NO' : '');
          setActive('YES'); // instant visual feedback
          saveAnswer(r.question_id, 'YES', yes, no, prev);
        };
        no.onclick  = ()=>{
          const prev = yes.classList.contains('active') ? 'YES' : (no.classList.contains('active') ? 'NO' : '');
          setActive('NO');  // instant visual feedback
          saveAnswer(r.question_id, 'NO',  yes, no, prev);
        };

        btns.appendChild(yes); btns.appendChild(no);
        q.appendChild(sec); q.appendChild(txt); q.appendChild(btns);
        wrap.appendChild(q);
      });
    });
  }

  let CURRENT_LOC_ID = 0;
  let OVERALL = '–';

  function refreshOverall(){
    const qs = Array.from(document.querySelectorAll('.q'));
    if(!qs.length){ $('overall').textContent = '–'; return; }
    let total = 0, yes = 0;
    qs.forEach(q=>{
      const y = q.querySelector('.yes'); const n = q.querySelector('.no');
      if(y.classList.contains('active') || n.classList.contains('active')){
        total++; if(y.classList.contains('active')) yes++;
      }
    });
    OVERALL = total ? Math.round(yes/total*100)+'%' : '–';
    $('overall').textContent = OVERALL;
  }

  function saveAnswer(qid, val, yesBtn, noBtn, prevVal){
    if(!CURRENT_LOC_ID){ msg('No location selected. Please scan a location tag onto this audit first.', 'err'); return; }
    authFetch(API + '/env/answer', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ auditLocId: CURRENT_LOC_ID, questionId: qid, answer: val, comment: '' })
    })
    .then(()=>{ refreshOverall(); msg('', ''); })
    .catch(e=>{
      // revert visuals using the passed buttons (no out-of-scope refs)
      const y = (prevVal==='YES'), n = (prevVal==='NO');
      yesBtn.classList.toggle('active', y);
      noBtn .classList.toggle('active',  n);
      yesBtn.setAttribute('aria-pressed', String(y));
      noBtn .setAttribute('aria-pressed', String(n));
      refreshOverall();
      msg(e.message||String(e), 'err');
    });
  }

  // Load audit & questions
  Promise.all([
    authFetch(API + '/env/questions'),
    authFetch(API + '/env/audits/' + encodeURIComponent(AUDIT_ID))
  ])
  .then(([qs, audit])=>{
    const locSel = $('locSel');
    locSel.innerHTML = '';
    (audit.locations||[]).forEach(l=>{
      const opt = document.createElement('option');
      opt.value = String(l.id); // audit_loc_id
      opt.textContent = l.location_name || ('Loc ' + l.location_id);
      locSel.appendChild(opt);
    });

    if(!audit.locations || !audit.locations.length){
      $('locHint').textContent = 'No locations yet. Scan a location tag (Auditor TAP) to add.';
      $('qWrap').innerHTML = '';
      refreshOverall();
      return;
    }
    $('locHint').textContent = '';

    function loadLoc(auditLocId){
      CURRENT_LOC_ID = Number(auditLocId);
      const resp = (audit.responses && audit.responses[auditLocId]) || [];
      const joined = (qs.items||[]).map(q=>{
        const r = (resp.find(x=>x.question_id===q.id) || {});
        return { question_id: q.id, section: q.section, text: q.text, answer: r.answer||null, comment: r.comment||null };
      });
      renderQuestions(auditLocId, joined);
      refreshOverall();
    }

    const firstId = String(audit.locations[0].id);
    locSel.value = firstId;
    locSel.onchange = ()=> loadLoc(locSel.value);
    loadLoc(firstId);
  })
  .catch(e=> msg(e.message||String(e), 'err'));

  // Submit audit
  $('btnSubmit').onclick = ()=>{
    authFetch(API + '/env/submit', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ auditId: Number(AUDIT_ID) })
    })
    .then(j=>{
      msg('Audit submitted. Overall score: ' + (j && typeof j.overall==='number' ? (j.overall+'%') : OVERALL), 'ok');
    })
    .catch(e=> msg(e.message||String(e), 'err'));
  };
})();
</script>
</body></html>`);
  });

  // ----------------------------------------------------
  // Auditor TAP: /tap/env/:token
  // (adds location to CURRENT audit in this browser)
  // ----------------------------------------------------
  app.get("/tap/env/:token", (req, res) => {
    nocache(res);
    const tok = String(req.params.token || "").trim();
    res.type("html").send(`<!doctype html>
<meta charset="utf-8">
<title>Ernos • Auditor Tap</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{
    --bg:#4E6E81; --panel:#FFFFFF; --text:#EAF1F4; --text-panel:#2E2E2E;
    --muted:#D7E3E8; --muted-panel:#606060; --accent:#7BA297; --border:#3E5967;
  }
  body{font:14px system-ui,sans-serif;padding:24px;max-width:540px;margin:0 auto;background:var(--bg);color:var(--text)}
  #msg{padding:10px;border-radius:10px;background:#fff;color:var(--muted-panel);border:1px solid var(--border);display:block}
  .ok{background:#E9F5EF !important;color:#1D5C45 !important;border-color:#CFE8DB !important}
  .error{background:#FDEEEE !important;color:#7A2A2A !important;border-color:#F1C9C9 !important}
</style>
<body>
  <header><img src="/skin/icons/logo.png" alt="Ernos" style="height:56px" onerror="this.src='/icons/icon.svg'"></header>
  <div id="msg">Contacting server…</div>
<script>
(function(){
  var TOKEN=${JSON.stringify(tok)};
  var API = ""; try{ API=(localStorage.getItem("ernosApi")||location.origin).replace(/\\/+$/,''); }catch(_){}
  var JWT = ""; try{ JWT=localStorage.getItem("ernosToken")||""; }catch(_){}
  try{
    var APP_URL = "/?api="+encodeURIComponent(API||location.origin)+"&nosw=1";
    history.replaceState({view:"tap-env"}, ""); history.pushState({view:"tap-env-2"}, "");
    window.addEventListener("popstate", function(){ location.replace(APP_URL); });
  }catch(_){}
  function setMsg(t,k){ var el=document.getElementById('msg'); el.className=k||''; el.textContent=t; }

  if(!JWT){
    try{ localStorage.setItem('ernos_return_to', location.href); }catch(_){}
    setMsg('You are not signed in. Open the Ernos app (Auditor/Admin), sign in, then tap again.', 'error');
    return;
  }

  setMsg("Contacting server…","");
  fetch(API + "/me",{headers:{'Authorization':"Bearer "+JWT}})
   .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
   .then(me=>{
      var role=String(me.role||"").toUpperCase(); var cat=String(me.category||"").toUpperCase();
      if(!(role==="ADMIN"||cat==="AUDITOR")){
        setMsg("This tag requires an Auditor or Admin. Open the Ernos app with the correct role, then tap again.", "error");
        return; // no redirect → no loop
      }
      var audId=parseInt(localStorage.getItem("ernos_current_audit_id")||"0",10);
      if(!audId){ setMsg("Auditor signed in, but no open audit in this browser. Open the app, click an audit, then tap again.", "ok"); return; }
      return fetch(API+"/env/tap",{
        method:"POST",
        headers:{'Content-Type':"application/json",'Authorization':"Bearer "+JWT},
        body: JSON.stringify({token:TOKEN,auditId:audId})
      })
        .then(r=>r.json().then(j=>{ if(!r.ok) throw new Error(j&&j.error||('HTTP '+r.status)); return j; }))
        .then(j=> setMsg("Location added to audit: "+(j.locationName||"")+".", "ok"));
   })
   .catch(e=> setMsg(e.message||String(e),"error"));
})();
</script>
</body></html>`);
  });
};
