// backend/plugins/qr_print.cjs
// Bulk QR sheet for REAL location codes (from qrcodes + locations)

module.exports = function setupQrPrint(opts = {}) {
  const {
    app,
    pool,
    tenantIdOf,
    PUBLIC_WEB_URL,
    PUBLIC_API_URL,
  } = opts;

  if (!app || !pool || !tenantIdOf) {
    throw new Error("[qr_print] Missing { app, pool, tenantIdOf }");
  }

  // Base URL used in QR codes: prefer PUBLIC_WEB_URL, then PUBLIC_API_URL, then current host
  function getBaseUrl(req) {
    const envBase =
      (PUBLIC_WEB_URL || PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
    if (envBase) return envBase;
    const proto = req.protocol || "https";
    const host = req.get("host");
    return `${proto}://${host}`;
  }

  // REAL bulk sheet: each QR = /tap/u/:code_id (qrcodes.id)
  app.get("/qr/locations", async (req, res) => {
    // Try tenant from helper; if missing, use query or fallback 1
    let tid = Number(tenantIdOf(req) || 0);
    if (!tid) {
      const qTid = Number(req.query.tenant || req.query.tid || 1);
      tid = qTid || 1;
    }

    const baseUrl = getBaseUrl(req);

    try {
      // ✅ Only use columns that definitely exist: q.id, l.id, l.name
      const { rows } = await pool.query(
        `
        SELECT
          q.id                 AS code_id,
          l.id                 AS location_id,
          COALESCE(l.name, '') AS location_name
        FROM qrcodes q
        JOIN locations l
          ON l.id = q.location_id
        WHERE q.tenant_id = $1
        ORDER BY
          l.name NULLS LAST,
          l.id
        `,
        [tid]
      );

      if (!rows.length) {
        return res
          .status(200)
          .send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>QR location sheet</title>
  <style>
    body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px;background:#f5f6f8;color:#1d2433;}
    .empty{padding:20px;border-radius:12px;border:1px dashed #d0d4dd;background:#fff;text-align:center;max-width:480px;margin:40px auto;}
  </style>
</head>
<body>
  <div class="empty">
    <h2>No QR codes found for this site</h2>
    <p>Create location QR codes first (via your Locations / QR screen), then refresh this page.</p>
  </div>
</body>
</html>`);
      }

      const items = rows.map((r) => {
        const label = r.location_name || `Location #${r.location_id}`;
        const url = `${baseUrl.replace(/\/+$/, "")}/tap/u/${encodeURIComponent(
          r.code_id
        )}`;

        return {
          id: r.code_id,
          name: label,
          subtitle: "", // keep simple for now
          url,
        };
      });

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Location QR sheet</title>
  <style>
    @page { size: A4; margin: 12mm; }
    *{ box-sizing:border-box; }
    body{
      font-family: system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      margin:0;
      padding:0;
      background:#f5f6f8;
      color:#1d2433;
    }
    .page{
      width:100%;
      min-height:100vh;
      padding:10mm;
      background:#f5f6f8;
    }
    h1{
      font-size:18px;
      margin:0 0 4mm 0;
    }
    .meta{
      font-size:11px;
      color:#6b7280;
      margin-bottom:8mm;
    }

    .grid{
      display:grid;
      grid-template-columns: repeat(3, 1fr);
      gap:6mm;
    }

    .card{
      background:#ffffff;
      border-radius:10px;
      border:1px solid #d1d5db;
      padding:6px 6px 8px 6px;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
    }

    .label{
      width:100%;
      text-align:center;
      font-size:11px;
      font-weight:600;
      margin-bottom:4px;
      padding:2px 4px;
      border-radius:7px;
      background:#4E6E81;
      color:#ffffff;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .subtitle{
      font-size:9px;
      color:#6b7280;
      margin-bottom:4px;
      text-align:center;
      min-height:11px;
    }
    .qr{
      width:32mm;
      height:32mm;
      margin:2px 0 0 0;
    }

    @media print {
      body, .page{
        background:#ffffff;
      }
      .page{
        padding:0;
      }
      h1, .meta{
        margin-left:0;
        margin-right:0;
      }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
</head>
<body>
  <div class="page">
    <h1>Location QR sheet</h1>
    <div class="meta">
      Tenant ID: ${tid} · Total codes: ${items.length}
    </div>
    <div class="grid">
      ${items
        .map(
          (item) => `
      <div class="card">
        <div class="label" title="${escapeHtml(item.name)}">${escapeHtml(
            item.name
          )}</div>
        <div class="subtitle">${escapeHtml(item.subtitle || "")}</div>
        <div class="qr" data-url="${escapeHtmlAttr(
          item.url
        )}" id="qr-${item.id}"></div>
      </div>`
        )
        .join("")}
    </div>
  </div>
  <script>
    (function(){
      function makeAll(){
        var nodes = document.querySelectorAll('.qr[data-url]');
        nodes.forEach(function(node){
          var url = node.getAttribute('data-url');
          if (!url) return;
          node.innerHTML = '';
          new QRCode(node, {
            text: url,
            width: node.clientWidth || 120,
            height: node.clientHeight || 120
          });
        });
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', makeAll);
      } else {
        makeAll();
      }
      window.addEventListener('load', makeAll);
    })();
  </script>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err) {
      console.error("[qr_print] DB error:", err);
      res.status(500).send(`
<!doctype html>
<html>
<head><meta charset="utf-8"><title>QR sheet error</title></head>
<body>
  <h1>Error generating QR sheet</h1>
  <p>Message: ${String(err.message || err)}</p>
  <p>This is a temporary debug view so we can see why it broke.</p>
</body>
</html>`);
    }
  });

  // simple HTML escapers used inline above
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeHtmlAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
};
