const crypto = require('crypto');
const setupHomecareCheckins = require('./homecare_checkins.cjs');
const setupHomecareCarePlan = require('./homecare_careplan.cjs');
const setupHomecareReports = require('./homecare_reports.cjs');
const setupHomecareTherapy = require('./homecare_therapy.cjs');
const setupHomecareWounds = require('./homecare_wounds.cjs');
const setupHomecareSchedule = require('./homecare_schedule.cjs');
const setupHomecareDashboard = require('./homecare_dashboard.cjs');

module.exports = function setupFamilyTouchpoint(opts = {}) {
  const { app, pool, auth } = opts;
  if (!app || !pool) return;
  const requireUser = typeof auth === 'function' ? auth : function(_req,_res,next){ next(); };

  // Register QR/NFC home-care routes immediately. Plugins create/migrate their own tables.
  setupHomecareCheckins(opts);
  setupHomecareCarePlan(opts);
  setupHomecareReports(opts);
  setupHomecareTherapy(opts);
  setupHomecareWounds(opts);
  setupHomecareSchedule(opts);
  setupHomecareDashboard(opts);

  function tenantOf(req){ return Number(req?.user?.tenant_id || req?.tenant_id || 1); }
  function userIdOf(req){ return Number(req?.user?.id || req?.user?.user_id || 0) || null; }
  function clean(v, max=500){ return String(v ?? '').trim().slice(0, max); }

  async function ensureTables(){
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id BIGSERIAL PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        date_of_birth DATE,
        address TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        family_contact_name TEXT NOT NULL DEFAULT '',
        family_contact_phone TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_patients_tenant_active ON patients(tenant_id, active, last_name, first_name);
    `);
  }
  ensureTables().catch(e => console.error('[patients] ensureTables failed', e));

  app.get('/api/patients', requireUser, async (req,res)=>{
    try{
      const tenant_id = tenantOf(req);
      const { rows } = await pool.query(
        `SELECT id, first_name, last_name, date_of_birth, address, phone, family_contact_name, family_contact_phone, notes, active, created_at, updated_at
         FROM patients WHERE tenant_id=$1 AND active=TRUE ORDER BY last_name ASC, first_name ASC, id DESC`,
        [tenant_id]
      );
      res.json({items: rows});
    }catch(e){ console.error('[patients] list failed', e); res.status(500).json({error:'Server error', detail:e.message}); }
  });

  app.post('/api/patients', requireUser, async (req,res)=>{
    try{
      const tenant_id = tenantOf(req);
      const b = req.body || {};
      const first_name = clean(b.first_name,120);
      const last_name = clean(b.last_name,120);
      if(!first_name || !last_name) return res.status(400).json({error:'Ime i prezime su obavezni'});
      const { rows } = await pool.query(
        `INSERT INTO patients (tenant_id, first_name, last_name, date_of_birth, address, phone, family_contact_name, family_contact_phone, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, first_name, last_name, date_of_birth, address, phone, family_contact_name, family_contact_phone, notes, active, created_at, updated_at`,
        [tenant_id, first_name, last_name, clean(b.date_of_birth,20)||null, clean(b.address,300), clean(b.phone,80), clean(b.family_contact_name,160), clean(b.family_contact_phone,80), clean(b.notes,1500), userIdOf(req)]
      );
      res.json({ok:true,item:rows[0]});
    }catch(e){ console.error('[patients] create failed', e); res.status(500).json({error:'Server error', detail:e.message}); }
  });

  app.patch('/api/patients/:id', requireUser, async (req,res)=>{
    try{
      const tenant_id = tenantOf(req);
      const id = Number(req.params.id || 0);
      const b = req.body || {};
      if(!id) return res.status(400).json({error:'Missing id'});
      const first_name = clean(b.first_name,120);
      const last_name = clean(b.last_name,120);
      if(!first_name || !last_name) return res.status(400).json({error:'Ime i prezime su obavezni'});
      const { rows } = await pool.query(
        `UPDATE patients SET first_name=$1, last_name=$2, date_of_birth=$3, address=$4, phone=$5, family_contact_name=$6, family_contact_phone=$7, notes=$8, updated_at=NOW()
         WHERE tenant_id=$9 AND id=$10 AND active=TRUE
         RETURNING id, first_name, last_name, date_of_birth, address, phone, family_contact_name, family_contact_phone, notes, active, created_at, updated_at`,
        [first_name, last_name, clean(b.date_of_birth,20)||null, clean(b.address,300), clean(b.phone,80), clean(b.family_contact_name,160), clean(b.family_contact_phone,80), clean(b.notes,1500), tenant_id, id]
      );
      if(!rows.length) return res.status(404).json({error:'Patient not found'});
      res.json({ok:true,item:rows[0]});
    }catch(e){ console.error('[patients] update failed', e); res.status(500).json({error:'Server error', detail:e.message}); }
  });

  app.delete('/api/patients/:id', requireUser, async (req,res)=>{
    try{
      const tenant_id = tenantOf(req);
      const id = Number(req.params.id || 0);
      if(!id) return res.status(400).json({error:'Missing id'});
      const r = await pool.query('UPDATE patients SET active=FALSE, updated_at=NOW() WHERE tenant_id=$1 AND id=$2 AND active=TRUE', [tenant_id,id]);
      if(!r.rowCount) return res.status(404).json({error:'Patient not found'});
      res.json({ok:true});
    }catch(e){ console.error('[patients] delete failed', e); res.status(500).json({error:'Server error', detail:e.message}); }
  });

  app.get('/family/rooms', requireUser, (_req,res)=>res.json({rooms:[]}));
  app.get('/family/summary', requireUser, (_req,res)=>res.json({now:new Date().toISOString(),summary:null}));
  app.post('/family/summary', requireUser, (_req,res)=>res.json({ok:true,summary:null}));
  app.post('/family/session', requireUser, (_req,res)=>res.json({ok:true, token: crypto.randomBytes(24).toString('hex'), expires_at:new Date(Date.now()+14400000).toISOString()}));
};
