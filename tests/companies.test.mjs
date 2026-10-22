import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudApi} from '../review/adapter.mjs';
import {validateCompany,validateCompanyRequest,companyStatus,matchesCompany} from '../review/companies.mjs';
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const company=()=>({id:id(1),name:'Nilo',ats:'ashby',board:'nilo',career_url:'https://jobs.ashbyhq.com/nilo',verification_status:'unavailable',monitoring_enabled:true,verified_at:null,provenance_url:null,last_checked_at:null,last_success_at:null,last_check_status:null,last_job_count:null});
const payload=()=>({id:id(9),name:'Example',source_url:'https://example.com/careers'});
const response=(data,status=200,range)=>new Response(status===204?null:JSON.stringify(data),{status,headers:range?{'content-range':range}:{}});
function setup(steps){const calls=[];const a=new CloudApi({url:'https://glhxpsuuxawejfvolspt.supabase.co',key:'sb_publishable_synthetic'},async(url,opts)=>{calls.push({url,opts});const s=steps.shift();assert.ok(s,'Unexpected request');if(s instanceof Error)throw s;return typeof s==='function'?s():s;},()=>0);a.session={token:'synthetic',user:id(99),expires:3600000};return {a,calls};}
test('unavailable is unknown openings, distinct from successful zero and never closed',()=>{
 const c=company();assert.equal(validateCompany(c),true);assert.equal(companyStatus(c).label,'Feed unavailable');
 const zero={...c,verification_status:'verified',last_check_status:'empty',last_job_count:0};assert.equal(validateCompany(zero),true);assert.match(companyStatus(zero).label,/0 openings/);
 assert.equal(validateCompany({...c,last_check_status:'failed',last_job_count:0}),false);
 for(const change of [{career_url:'javascript:alert(1)'},{monitoring_enabled:'true'},{last_checked_at:'invalid'},{ats:'unknown'},{last_job_count:-1}])assert.equal(validateCompany({...c,...change}),false);
});
test('All companies includes unlinked email leads; company filter requires explicit link',()=>{
 const links=[{company_id:id(1),job_id:id(2)}];assert.equal(matchesCompany(id(5),'',links),true);assert.equal(matchesCompany(id(5),id(1),links),false);assert.equal(matchesCompany(id(2),id(1),links),true);
});
test('directory reads complete tables; composite pagination permits same company with different jobs',async()=>{
 const {a,calls}=setup([response([company()],200,'0-0/1'),response([{company_id:id(1),job_id:id(2)}],200,'0-0/2'),response([{company_id:id(1),job_id:id(3)}],200,'1-1/2'),response([],200,'*/0')]);
 const result=await a.companies();assert.equal(result.links.length,2);assert.match(calls[2].url,/offset=1/);assert.match(calls[2].url,/company_id.asc%2Cjob_id.asc/);
});
test('missing registry or company permissions does not clear working jobs session; authentication denial does',async()=>{
 for(const status of [403,404]){const {a}=setup([response({},status)]);await assert.rejects(a.companies(),e=>e.status===status&&/Jobs remain available/.test(e.message));assert.ok(a.session);}
 const {a}=setup([response({},401)]);await assert.rejects(a.companies(),e=>e.status===401);assert.equal(a.session,null);
});
test('malformed directory and orphan link never return partial data',async()=>{
 for(const [c,links] of [[{...company(),last_checked_at:'bad'},[]],[company(),[{company_id:id(7),job_id:id(2)}]]]){const {a}=setup([response([c],200,'0-0/1'),response(links,200,links.length?'0-0/1':'*/0'),response([],200,'*/0')]);await assert.rejects(a.companies());}
});
test('requests reject enrollment, privileged URLs and unsigned access before network',async()=>{
 for(const body of [{...payload(),monitoring_enabled:true},{...payload(),source_url:'https://user:password@example.com/'},{...payload(),source_url:'http://example.com/'},{...payload(),name:' '}]){assert.equal(validateCompanyRequest(body),false);const {a,calls}=setup([]);await assert.rejects(a.requestCompany(body),e=>e.status===400);assert.equal(calls.length,0);}
 const {a,calls}=setup([]);a.session=null;await assert.rejects(a.requestCompany(payload()),e=>e.status===401);assert.equal(calls.length,0);
});
test('company request lost response retry uses same UUID without duplicate insert or enrollment',async()=>{
 const b=payload(),{a,calls}=setup([response([]),new Error('lost'),response([b])]);await assert.rejects(a.requestCompany(b));assert.deepEqual(await a.requestCompany(b),{saved:true,monitoring_enabled:false});
 const posts=calls.filter(c=>c.opts.method==='POST');assert.equal(posts.length,1);assert.deepEqual(JSON.parse(posts[0].opts.body),b);assert.ok(calls.every(c=>c.url.includes('/company_requests')));
});
test('concurrent request conflict readback succeeds only for identical payload',async()=>{
 const b=payload(),{a}=setup([response([]),response({},409),response([b])]);assert.equal((await a.requestCompany(b)).saved,true);
 const bad=setup([response([{...b,name:'Other'}])]);await assert.rejects(bad.a.requestCompany(b),e=>e.status===409);assert.equal(bad.calls.length,1);
});
test('double request shares immutable save and rejects changed in-flight content',async()=>{
 let finish;const gate=new Promise(r=>finish=r);const {a,calls}=setup([()=>gate,response(null,204)]),b=payload();const first=a.requestCompany(b);assert.equal(first,a.requestCompany({...b}));await assert.rejects(a.requestCompany({...b,name:'Changed'}),e=>e.status===409);b.name='Mutated';finish(response([]));await first;assert.equal(JSON.parse(calls[1].opts.body).name,'Example');
});
