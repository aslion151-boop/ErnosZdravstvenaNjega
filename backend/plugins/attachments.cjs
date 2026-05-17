// plugins/attachments.cjs
// Minimal, tenant-aware file uploads for issues.
// Endpoints:
//  POST /uploads                         -> { url }
//  POST /issues/:id/attachments          -> { url, attachment_id }
//  GET  /uploads/:file                   -> serves file

const path = require('path');
const fs   = require('fs');
const fsp  = fs.promises;
const crypto = require('crypto');
const multer = require('multer');

module.exports = function setupAttachments(opts){
  const {
    app, pool, auth,
    uploadDir = process.env.ERNOS_UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
    publicBaseUrl, // optional override for URL generation (e.g. https://app.example.com)
  } = opts || {};

  if (!app || !pool || !auth) {
    throw new Error("[attachments] Missing required { app, pool, auth }");
  }

  // Ensure directory exists
  fs.mkdirSync(uploadDir, { recursive: true });

  // DB table (idempotent)
  (async () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS issue_attachments (
        id SERIAL PRIMARY KEY,
        issue_id INTEGER,
        tenant_id INTEGER REFERENCES tenants(id),
        user_id INTEGER REFERENCES users(id),
        filename TEXT,
        mime TEXT,
        size_bytes INTEGER,
        url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_issue_attachments_issue  ON issue_attachments(issue_id);
      CREATE INDEX IF NOT EXISTS idx_issue_attachments_tenant ON issue_attachments(tenant_id);
    `;
    try { await pool.query(sql); } catch(e){ console.error("[attachments migrate]", e); }
  })();

  // Multer storage: save as random filename, keep extension
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '');
      const rand = crypto.randomBytes(16).toString('hex');
      cb(null, `${Date.now()}_${rand}${ext}`);
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    fileFilter: (req, file, cb) => {
      const ok = /^image\//i.test(file.mimetype);
      cb(ok ? null : new Error('Only image files allowed'), ok);
    }
  });
  // Wrap multer to return JSON errors instead of HTML
  const uploadImage = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error('[uploadImage]', err);
        return res
          .status(400)
          .json({ error: err.message || 'upload error' });
      }
      next();
    });
  };

  function baseUrl(req){
    const guess =
      process.env.PUBLIC_BASE_URL ||
      process.env.APP_PUBLIC_URL ||
      publicBaseUrl ||
      `${(req.headers['x-forwarded-proto']||req.protocol||'http').split(',')[0]}://${req.headers['x-forwarded-host']||req.get('host')}`;
    return String(guess).replace(/\/+$/, '');
  }

  // Serve uploaded files statically
  app.get('/uploads/:file', async (req, res) => {
    try{
      const file = req.params.file || '';
      if (!/^[\w.\-]+$/.test(file)) return res.status(400).end();
      const p = path.join(uploadDir, file);
      if (!fs.existsSync(p)) return res.status(404).end();
      res.sendFile(p);
    }catch(e){ res.status(500).end(); }
  });

  // Generic upload (returns URL) — for any feature
  app.post('/uploads', auth, uploadImage, async (req, res) => {
    try{
      if (!req.file) return res.status(400).json({ error: 'no file' });
      const f = req.file;
      const url = `${baseUrl(req)}/uploads/${encodeURIComponent(path.basename(f.path))}`;
      return res.json({ ok:true, url, file: { name:f.originalname, mime:f.mimetype, size:f.size } });
    }catch(e){
      console.error('[uploads]', e);
      res.status(500).json({ error:'server error' });
    }
  });

    // Issue-specific upload: also logs a DB row you can list later
  app.post('/issues/:id/attachments', auth, uploadImage, async (req, res) => {
    try {
      const issueId = parseInt(req.params.id, 10);
      if (!issueId) return res.status(400).json({ error: 'bad issue id' });
      if (!req.file) return res.status(400).json({ error: 'no file' });

      const userId   = Number(req.user?.id || req.user?.user_id || 0);
      const userTid  = Number(req.user?.tenant_id || 0);
      const userRole = String(req.user?.role || "").toUpperCase();

      // Derive tenant from issue, or fallback to user
      const { rows: iss } = await pool
        .query("SELECT tenant_id FROM issues WHERE id=$1", [issueId])
        .catch(() => ({ rows: [] }));

      const issueTid = Number(iss[0]?.tenant_id || 0) || userTid;

      if (!issueTid) {
        return res.status(400).json({ error: "issue has no tenant" });
      }

      // Cross-tenant guard: only ADMIN_GLOBAL can attach to another tenant's issue
      if (userRole !== "ADMIN_GLOBAL" && issueTid !== userTid) {
        return res.status(403).json({ error: "forbidden (tenant mismatch)" });
      }

      const f = req.file;
      const url = `${baseUrl(req)}/uploads/${encodeURIComponent(
        path.basename(f.path)
      )}`;

      const ins = await pool.query(
        `INSERT INTO issue_attachments(
           issue_id,tenant_id,user_id,filename,mime,size_bytes,url
         )
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING id`,
        [issueId, issueTid, userId, f.originalname, f.mimetype, f.size, url]
      );

      res.json({ ok: true, url, attachment_id: ins.rows[0].id });
    } catch (e) {
      console.error("[issues/:id/attachments]", e);
      res.status(500).json({ error: "server error" });
    }
  });

};
