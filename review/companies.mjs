/* Company metadata never decides whether an unlinked job remains visible. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(v,max)=>typeof v==='string' && v.trim().length>0 && v.length<=max;
const nullableTime=v=>v===null || (typeof v==='string' && Number.isFinite(Date.parse(v)));
export function publicUrl(value) {
  try { const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && !u.hash; } catch {return false;}
}
export function validateCompany(c) {
  return c && uuid.test(c.id||'') && text(c.name,200) &&
    ['verified','unavailable','unconfigured','requested'].includes(c.verification_status) &&
    typeof c.monitoring_enabled==='boolean' &&
    (c.ats===null || ['greenhouse','ashby','lever'].includes(c.ats)) &&
    (c.board===null || (typeof c.board==='string' && /^[A-Za-z0-9_.-]{1,100}$/.test(c.board))) &&
    (c.career_url===null || publicUrl(c.career_url)) &&
    (c.provenance_url===null || publicUrl(c.provenance_url)) &&
    ['verified_at','last_checked_at','last_success_at'].every(k=>nullableTime(c[k])) &&
    [null,'success','empty','failed'].includes(c.last_check_status) &&
    (c.last_job_count===null || (Number.isInteger(c.last_job_count) && c.last_job_count>=0)) &&
    (c.last_check_status!=='failed' || c.last_job_count===null) &&
    (c.last_check_status!=='empty' || c.last_job_count===0) &&
    (c.last_check_status!=='success' || (Number.isInteger(c.last_job_count) && c.last_job_count>0)) &&
    (!c.monitoring_enabled || (c.ats!==null && c.board!==null && publicUrl(c.career_url)));
}
export function validateCompanyRequest(body) {
  return body && Object.keys(body).sort().join()==='id,name,source_url' && uuid.test(body.id||'') &&
    text(body.name,200) && body.name===body.name.trim() && typeof body.source_url==='string' && body.source_url.length<=2000 && publicUrl(body.source_url);
}
export function companyStatus(c) {
  const enrollment=c.monitoring_enabled?'Daily monitoring enabled':'Not monitored';
  if(c.last_check_status==='failed' || c.verification_status==='unavailable')return {enrollment,label:'Feed unavailable',detail:'Openings unknown. This does not mean zero jobs or that the company is closed.',attention:true};
  if(c.verification_status==='unconfigured' || c.verification_status==='requested')return {enrollment,label:'Source not connected',detail:'Needs an official employer source before monitoring can start.',attention:false};
  if(c.last_check_status==='empty')return {enrollment,label:'Successful check · 0 openings',detail:'The latest successful feed read returned no jobs. Previously collected jobs remain in the queue.',attention:false};
  if(c.last_check_status==='success')return {enrollment,label:`Successful check · ${c.last_job_count??'unknown'} jobs`,detail:'Count from the latest feed read, not a guarantee that every posting is still open.',attention:false};
  return {enrollment,label:'Awaiting first recorded check',detail:'Source verified; no collection outcome has been recorded in this directory yet.',attention:false};
}
export function linkedJobIds(companyId, links) {return new Set(links.filter(l=>l.company_id===companyId).map(l=>l.job_id));}
export function matchesCompany(jobId, selectedCompany, links) {return !selectedCompany || links.some(l=>l.company_id===selectedCompany && l.job_id===jobId);}
