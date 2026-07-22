module.exports=function setupHomecareContacts(opts={}){
  const app=opts.app,pool=opts.pool,auth=opts.auth;
  if(!app||!pool)return;
  if(app.locals.homecareContactsLoaded)return;
  app.locals.homecareContactsLoaded=true;
  const requireUser=typeof auth==='function'?auth:function(_req,_res,next){next();};
  function tenantOf(req){return Number((req.user&&req.user.tenant_id)||req.tenant_id||1);}
  function userIdOf(req){return Number((req.user&&(req.user.id||req.user.user_id))||0)||null;}
  function clean(v,max){return String(v==null?'':v).trim().slice(0,max||500);}
  const fields='id,tenant_id,patient_id,contact_type,name,phone,email,note,priority,is_primary,active,created_by,created_at,updated_at';
  async function ensureTables(){
    await pool.query(`CREATE TABLE IF NOT EXISTS patient_contacts(
      id BIGSERIAL PRIMARY KEY,
      tenant_id INT NOT NULL DEFAULT 1,
      patient_id BIGINT NOT NULL,
      contact_type TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal',
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_patient_contacts_patient ON patient_contacts(tenant_id,patient_id,active,priority,id DESC);`);
  }
  ensureTables().catch(e=>console.error('[homecare_contacts] ensureTables failed',e));
  async function patientExists(tenantId,patientId){
    const r=await pool.query('SELECT id FROM patients WHERE tenant_id=$1 AND id=$2 AND active=TRUE',[tenantId,patientId]);
    return !!r.rowCount;
  }
  app.get('/api/care/patients/:id/contacts',requireUser,async(req,res)=>{
    try{
      const tenantId=tenantOf(req),patientId=Number(req.params.id||0);
      if(!patientId)return res.status(400).json({error:'Missing patient id'});
      const r=await pool.query(`SELECT ${fields} FROM patient_contacts WHERE tenant_id=$1 AND patient_id=$2 AND active=TRUE ORDER BY is_primary DESC, CASE lower(priority) WHEN 'visoko' THEN 1 WHEN 'hitno' THEN 1 WHEN 'srednje' THEN 2 ELSE 3 END, id DESC`,[tenantId,patientId]);
      res.json({ok:true,items:r.rows});
    }catch(e){console.error('[homecare_contacts] list failed',e);res.status(500).json({error:'Server error',detail:e.message});}
  });
  app.get('/api/care/contacts',requireUser,async(req,res)=>{
    try{
      const tenantId=tenantOf(req);
      const r=await pool.query(`SELECT c.${fields.replace(/,/g,',c.')}, p.first_name,p.last_name,p.address,p.phone AS patient_phone
        FROM patient_contacts c JOIN patients p ON p.id=c.patient_id AND p.tenant_id=c.tenant_id
        WHERE c.tenant_id=$1 AND c.active=TRUE AND p.active=TRUE
        ORDER BY p.last_name ASC,p.first_name ASC,c.is_primary DESC,c.id DESC LIMIT 500`,[tenantId]);
      const rows=r.rows.map(x=>Object.assign({},x,{patient_name:String((x.first_name||'')+' '+(x.last_name||'')).trim()}));
      res.json({ok:true,items:rows});
    }catch(e){console.error('[homecare_contacts] global failed',e);res.status(500).json({error:'Server error',detail:e.message});}
  });
  app.post('/api/care/patients/:id/contacts',requireUser,async(req,res)=>{
    try{
      const tenantId=tenantOf(req),patientId=Number(req.params.id||0),b=req.body||{};
      if(!patientId)return res.status(400).json({error:'Missing patient id'});
      if(!(await patientExists(tenantId,patientId)))return res.status(404).json({error:'Patient not found'});
      const contactType=clean(b.contact_type,80)||'Kontakt';
      const name=clean(b.name,160);
      const phone=clean(b.phone,80);
      if(!name&&!phone)return res.status(400).json({error:'Upiši barem ime ili telefon'});
      const r=await pool.query(`INSERT INTO patient_contacts(tenant_id,patient_id,contact_type,name,phone,email,note,priority,is_primary,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${fields}`,[tenantId,patientId,contactType,name,phone,clean(b.email,160),clean(b.note,1000),clean(b.priority,40)||'normal',!!b.is_primary,userIdOf(req)]);
      res.json({ok:true,item:r.rows[0]});
    }catch(e){console.error('[homecare_contacts] create failed',e);res.status(500).json({error:'Server error',detail:e.message});}
  });
  app.patch('/api/care/contacts/:id',requireUser,async(req,res)=>{
    try{
      const tenantId=tenantOf(req),id=Number(req.params.id||0),b=req.body||{};
      if(!id)return res.status(400).json({error:'Missing id'});
      const r=await pool.query(`UPDATE patient_contacts SET contact_type=$1,name=$2,phone=$3,email=$4,note=$5,priority=$6,is_primary=$7,updated_at=NOW() WHERE tenant_id=$8 AND id=$9 AND active=TRUE RETURNING ${fields}`,[clean(b.contact_type,80)||'Kontakt',clean(b.name,160),clean(b.phone,80),clean(b.email,160),clean(b.note,1000),clean(b.priority,40)||'normal',!!b.is_primary,tenantId,id]);
      if(!r.rowCount)return res.status(404).json({error:'Contact not found'});
      res.json({ok:true,item:r.rows[0]});
    }catch(e){console.error('[homecare_contacts] update failed',e);res.status(500).json({error:'Server error',detail:e.message});}
  });
  app.delete('/api/care/contacts/:id',requireUser,async(req,res)=>{
    try{
      const tenantId=tenantOf(req),id=Number(req.params.id||0);
      if(!id)return res.status(400).json({error:'Missing id'});
      const r=await pool.query('UPDATE patient_contacts SET active=FALSE,updated_at=NOW() WHERE tenant_id=$1 AND id=$2 AND active=TRUE',[tenantId,id]);
      if(!r.rowCount)return res.status(404).json({error:'Contact not found'});
      res.json({ok:true});
    }catch(e){console.error('[homecare_contacts] delete failed',e);res.status(500).json({error:'Server error',detail:e.message});}
  });
};
