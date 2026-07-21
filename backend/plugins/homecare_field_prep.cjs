module.exports=function setupHomecareFieldPrep(opts={}){
  const app=opts.app,pool=opts.pool,auth=opts.auth;
  if(!app||!pool)return;
  if(app.locals.homecareFieldPrepLoaded)return;
  app.locals.homecareFieldPrepLoaded=true;
  const requireUser=typeof auth==='function'?auth:function(_req,_res,next){next();};
  function tenantOf(req){return Number((req.user&&req.user.tenant_id)||req.tenant_id||1);}
  function scanUrl(code){return code?('/#scan?t='+encodeURIComponent(code)):'';}

  app.get('/api/care/field-prep',requireUser,async(req,res)=>{
    try{
      const tenantId=tenantOf(req);
      const days=Math.max(1,Math.min(14,Number(req.query.days||2)||2));
      const planned=await pool.query(
        `SELECT pv.id AS planned_visit_id,pv.patient_id,pv.planned_for,pv.window_text,pv.visit_type,pv.instructions,pv.status,
                p.first_name,p.last_name,p.address,p.phone,p.family_contact_name,p.family_contact_phone,p.scan_code,
                p.allergies,p.diagnoses,p.risks,p.mobility_note,p.access_note
         FROM planned_visits pv
         JOIN patients p ON p.id=pv.patient_id AND p.tenant_id=pv.tenant_id AND p.active=TRUE
         WHERE pv.tenant_id=$1 AND pv.status='planned' AND (pv.planned_for IS NULL OR pv.planned_for < NOW()+($2::int || ' days')::interval)
         ORDER BY COALESCE(pv.planned_for,NOW()) ASC,pv.id ASC
         LIMIT 80`,[tenantId,days]
      );
      const tasks=await pool.query(
        `SELECT patient_id,id,title,priority,due_text,details,status
         FROM patient_tasks
         WHERE tenant_id=$1 AND active=TRUE AND status='open'
         ORDER BY CASE lower(priority) WHEN 'visoko' THEN 1 WHEN 'srednje' THEN 2 ELSE 3 END,id DESC`,[tenantId]
      ).catch(()=>({rows:[]}));
      const supplies=await pool.query(
        `SELECT patient_id,id,item_name,quantity,status,location_note,note
         FROM patient_supplies
         WHERE tenant_id=$1 AND active=TRUE AND lower(status) IN ('nisko','naručiti','naruciti')
         ORDER BY patient_id,item_name ASC`,[tenantId]
      ).catch(()=>({rows:[]}));
      const taskMap={};
      tasks.rows.forEach(x=>{const k=String(x.patient_id);(taskMap[k]=taskMap[k]||[]).push(x);});
      const supplyMap={};
      supplies.rows.forEach(x=>{const k=String(x.patient_id);(supplyMap[k]=supplyMap[k]||[]).push(x);});
      const items=planned.rows.map(x=>{
        const pid=String(x.patient_id);
        const safety=[];
        if(x.allergies)safety.push({label:'Alergije',text:x.allergies,level:'high'});
        if(x.risks)safety.push({label:'Rizici',text:x.risks,level:'medium'});
        if(x.diagnoses)safety.push({label:'Stanja/dijagnoze',text:x.diagnoses,level:'normal'});
        if(x.mobility_note)safety.push({label:'Mobilnost',text:x.mobility_note,level:'normal'});
        if(x.access_note)safety.push({label:'Ulazak',text:x.access_note,level:'normal'});
        return Object.assign({},x,{patient_name:String((x.first_name||'')+' '+(x.last_name||'')).trim(),scan_url:scanUrl(x.scan_code),safety:safety,tasks:taskMap[pid]||[],supplies:supplyMap[pid]||[]});
      });
      res.json({ok:true,days,items,counts:{visits:items.length,with_tasks:items.filter(x=>x.tasks.length).length,with_supplies:items.filter(x=>x.supplies.length).length,with_safety:items.filter(x=>x.safety.length).length}});
    }catch(e){console.error('[homecare_field_prep] failed',e);res.status(500).json({error:'Server error',detail:e.message});}
  });
};
