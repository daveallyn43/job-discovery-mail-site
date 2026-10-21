import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudApi} from '../review/adapter.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const config={url:'https://glhxpsuuxawejfvolspt.supabase.co',key:'sb_publishable_synthetic'};
const response=(data,status=200,range)=>new Response(status===204?null:JSON.stringify(data),{status,headers:range?{'content-range':range}:{}});
function mock(steps){const calls=[];const f=async(url,opts)=>{calls.push({url,opts});const s=steps.shift();if(s instanceof Error)throw s;if(typeof s==='function')return s(url,opts);assert.ok(s,'Unexpected network call');return s;};f.calls=calls;return f;}
function signed(fetcher,clock=()=>0){const a=new CloudApi(config,fetcher,clock);a.session={token:'synthetic_token',user:uid,expires:3600000};return a;}
const payload=()=>({id:id(900),job_id:id(1),review_state:'maybe',comment:'synthetic note'});

test('unconfigured/privileged keys and no-auth fail before networking',async()=>{
 assert.throws(()=>new CloudApi({...config,key:'sb_secret_forbidden'}));
 const f=mock([]),a=new CloudApi(config,f);await assert.rejects(a.list(),e=>e.status===401);assert.equal(f.calls.length,0);
});
test('email OTP prevents enrollment, throttles sends and discards refresh token',async()=>{
 const f=mock([response({}),response({access_token:'synthetic_token',refresh_token:'discard_me',expires_in:3600}),response({id:uid})]);const a=new CloudApi(config,f,()=>0);
 await a.sendCode('owner@example.com');assert.equal(JSON.parse(f.calls[0].opts.body).create_user,false);
 await assert.rejects(a.sendCode('owner@example.com'),e=>e.status===429);
 await a.verify('owner@example.com','123456');assert.equal(a.session.user,uid);assert.equal(a.session.refresh_token,undefined);
 assert.equal(f.calls[0].opts.redirect,'error');assert.equal(f.calls[0].opts.cache,'no-store');
});
test('expiry and new page instance require reauthentication',async()=>{
 const f=mock([]),a=signed(f,()=>3600001);await assert.rejects(a.list(),e=>e.status===401);assert.equal(a.session,null);
 await assert.rejects(new CloudApi(config,f).list(),e=>e.status===401);assert.equal(f.calls.length,0);
});
test('changed authenticated identity invalidates the session',async()=>{
 const a=signed(mock([response({id:id(999)})]));await assert.rejects(a.list(),e=>e.status===401);assert.equal(a.session,null);
});
test('wrong-user RLS-empty result contains no jobs; no fake data is substituted',async()=>{
 const f=mock([response({id:uid}),response([],200,'*/0'),response([],200,'*/0'),response([],200,'*/0')]);
 assert.deepEqual((await signed(f).list()).jobs,[]);
});
test('paginated jobs tolerate a server page cap smaller than requested',async()=>{
 const f=mock([response([{id:id(1)}],200,'0-0/3'),response([{id:id(2)}],200,'1-1/3'),response([{id:id(3)}],200,'2-2/3')]);
 assert.equal((await signed(f).rows('jobs','synthetic')).length,3);assert.match(f.calls[2].url,/offset=2/);
});
test('empty is distinct from failed/malformed/partial pages',async()=>{
 assert.deepEqual(await signed(mock([response([],200,'*/0')])).rows('jobs','t'),[]);
 for(const step of [response({},200,'*/0'),response([],500),response([],200),response([],200,'*/2'),new Response('bad JSON',{status:200})])await assert.rejects(signed(mock([step])).rows('jobs','t'));
});
test('changing totals, repeated IDs and oversized queues fail explicitly',async()=>{
 for(const steps of [[response([{id:id(1)}],200,'0-0/2'),response([{id:id(2)}],200,'1-1/3')],[response([{id:id(1)}],200,'0-0/2'),response([{id:id(1)}],200,'1-1/2')],[response([],200,'*/10001')]])await assert.rejects(signed(mock(steps)).rows('jobs','t'));
});
test('latest feedback is chosen; sightings remain attached',async()=>{
 const f=mock([response({id:uid}),response([{id:id(1),title:'Synthetic'}],200,'0-0/1'),response([{id:id(2),job_id:id(1),source_name:'Synthetic source'}],200,'0-0/1'),response([{id:id(3),job_id:id(1),review_state:'maybe',reviewed_at:'2026-10-12T00:00:00Z'},{id:id(4),job_id:id(1),review_state:'applied',reviewed_at:'2026-10-13T00:00:00Z'}],200,'0-1/2')]);
 const j=(await signed(f).list()).jobs[0];assert.equal(j.review.review_state,'applied');assert.equal(j.sources.length,1);
});
test('double submit shares one immutable save; changed in-flight request rejected',async()=>{
 let finish;const gate=new Promise(r=>finish=r);const f=mock([()=>gate,response(null,204)]),a=signed(f),b=payload();
 const p1=a.save(b),p2=a.save({...b});assert.equal(p1,p2);await assert.rejects(a.save({...b,comment:'changed'}),e=>e.status===409);
 b.comment='mutated after click';finish(response([]));await p1;assert.equal(f.calls.length,2);assert.equal(JSON.parse(f.calls[1].opts.body).comment,'synthetic note');
});
test('concurrent database unique conflict is verified as successful retry',async()=>{
 const b=payload(),f=mock([response([]),response({},409),response([b])]);assert.deepEqual(await signed(f).save(b),{saved:true});
});
test('lost response can be retried without appending again',async()=>{
 const b=payload(),f=mock([response([]),new Error('transport lost'),response([b])]),a=signed(f);
 await assert.rejects(a.save(b),e=>e.status===503);assert.deepEqual(await a.save(b),{saved:true});assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,1);
});
test('conflicting UUID never overwrites feedback',async()=>{
 const b=payload(),f=mock([response([{...b,comment:'already saved differently'}])]);await assert.rejects(signed(f).save(b),e=>e.status===409);assert.equal(f.calls.length,1);
});
test('rate limits and auth denial remain distinct, errors disclose no raw body',async()=>{
 for(const status of [401,403,429,500]){const a=signed(mock([response({secret:'do not expose'},status)]));await assert.rejects(a.http('/test',{token:'t'}),e=>e.status===status&&!e.message.includes('expose'));if(status<404)assert.equal(a.session,null);}
});
test('failed remote logout still removes local session',async()=>{
 const a=signed(mock([new Error('offline')]));await assert.rejects(a.request('logout'));assert.equal(a.session,null);
});
test('logout racing sign-in prevents resurrection',async()=>{
 let finish;const gate=new Promise(r=>finish=r);const a=new CloudApi(config,mock([()=>gate,response({id:uid})]));
 const pending=a.verify('owner@example.com','123456');a.clear();finish(response({access_token:'synthetic',expires_in:3600}));await assert.rejects(pending,e=>e.status===401);assert.equal(a.session,null);
});

test('magic-link callback scrubs URL first, verifies confirmed identity and discards refresh token',async()=>{
 let cleared=false;const f=mock([()=>{assert.equal(cleared,true);return response({id:uid,email_confirmed_at:'2026-10-13T00:00:00Z'});}]);const a=new CloudApi(config,f,()=>0);
 await a.acceptLink('#access_token=synthetic&refresh_token=discard&token_type=bearer&expires_in=3600&type=magiclink',()=>{cleared=true;});assert.equal(a.session.user,uid);assert.equal(a.session.refresh_token,undefined);
});
test('invitation callback and expired/malformed/unconfirmed link handling',async()=>{
 const valid='#access_token=synthetic&token_type=bearer&expires_in=3600&type=invite';
 await new CloudApi(config,mock([response({id:uid,email_confirmed_at:'now'})]),()=>0).acceptLink(valid,()=>{});
 for(const fragment of ['#error=access_denied',valid.replace('invite','recovery'),valid.replace('3600','0'),'#code=not-supported']){let cleared=false;await assert.rejects(new CloudApi(config,mock([])).acceptLink(fragment,()=>cleared=true));assert.equal(cleared,true);}
 await assert.rejects(new CloudApi(config,mock([response({id:uid})])).acceptLink(valid,()=>{}),e=>e.status===401);
});

 test('failed email request retains original failure during cooldown without a second send',async()=>{
 const f=mock([new Error('blocked')]),a=new CloudApi(config,f,()=>0);
 await assert.rejects(a.sendCode('owner@example.com'),e=>e.status===503&&e.message.includes('delivery is unknown'));
 await assert.rejects(a.sendCode('owner@example.com'),e=>e.status===503&&e.message.includes('delivery is unknown'));
 assert.equal(f.calls.length,1);
 });
 test('server email rate limit is not described as a guaranteed one minute delay',async()=>{
 const f=mock([response({},429)]),a=new CloudApi(config,f,()=>0);
 await assert.rejects(a.sendCode('owner@example.com'),e=>e.status===429&&e.message.includes('longer than one minute'));
 await assert.rejects(a.sendCode('owner@example.com'),e=>e.status===429&&e.message.includes('Supabase'));assert.equal(f.calls.length,1);
 });

test('consumed invitation plus failed user verification never establishes a session',async()=>{
 const f=mock([new Error('client connection blocked')]),a=new CloudApi(config,f,()=>0);let cleared=false;
 await assert.rejects(a.acceptLink('#access_token=synthetic&token_type=bearer&expires_in=3600&type=invite',()=>cleared=true),e=>e.status===503);
 assert.equal(cleared,true);assert.equal(a.session,null);assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/\/auth\/v1\/user$/);
});

test('connection diagnosis uses read-only settings and distinguishes immediate network rejection',async()=>{
 const f=mock([response({external:{email:true}})]),a=new CloudApi(config,f);
 assert.deepEqual(await a.request('check-connection'),{ok:true});assert.equal(f.calls[0].opts.method,'GET');assert.match(f.calls[0].url,/settings$/);assert.equal(f.calls[0].opts.body,undefined);
 await assert.rejects(new CloudApi(config,mock([new TypeError('fetch failed')])).request('check-connection'),e=>e.kind==='request_failure'&&e.message.includes('before the app timeout'));
});
test('application abort is explicitly distinguished from browser rejection',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const a=new CloudApi(config,async(url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
 const pending=a.request('check-connection');const checked=assert.rejects(pending,e=>e.kind==='app_timeout'&&e.message.includes('20 seconds'));
 t.mock.timers.tick(20000);await checked;
});

test('default browser fetch retains Window receiver instead of CloudApi receiver',async t=>{
 t.mock.method(globalThis,'fetch',function(url,opts){
   assert.equal(this,globalThis,'Browser fetch requires its Window receiver');
   return Promise.resolve(response({external:{email:true}}));
 });
 assert.deepEqual(await new CloudApi(config).request('check-connection'),{ok:true});
});
test('synchronous request construction exception is not mislabeled as network rejection',async()=>{
 const a=new CloudApi(config,()=>{throw new TypeError('Illegal invocation');});
 await assert.rejects(a.request('check-connection'),e=>e.status===500&&e.kind==='request_setup');
});
