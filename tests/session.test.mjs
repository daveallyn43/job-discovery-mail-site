import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudApi} from '../review/adapter.mjs';
const config={url:'https://glhxpsuuxawejfvolspt.supabase.co',key:'sb_publishable_synthetic'};
const uid='11111111-1111-4111-8111-111111111111';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
function fixture(){
 const map=new Map();let queue=Promise.resolve();
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const locks={request:(_key,fn)=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;}};
 let now=0;const calls=[];
 const fetcher=async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/user'))return reply({id:uid,email_confirmed_at:'synthetic'});if(url.includes('refresh_token'))return reply({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600,user:{id:uid}});return reply({});};
 const make=(f=fetcher)=>new CloudApi(config,f,()=>now,{storage:()=>storage,locks});
 return {map,storage,locks,make,calls,advance:()=>now=3600001};
}
const link='#access_token=synthetic-access&refresh_token=synthetic-refresh&token_type=bearer&expires_in=3600&type=magiclink';
async function sign(a){a.setRemember(true);await a.acceptLink(link,()=>{});}
test('opt-in survives a new instance and rotates both tokens after expiry',async()=>{
 const f=fixture(),a=f.make();await sign(a);const b=f.make();await b.restore();assert.equal(b.session.token,'synthetic-access');
 f.advance();await b.ensureSession();assert.equal(b.session.refresh,'rotated-refresh');
 assert.deepEqual(JSON.parse(f.storage.getItem(b.sessionKey)),b.session);
 assert.equal(JSON.parse(f.calls.at(-1).opts.body).refresh_token,'synthetic-refresh');
});
test('unchecked sessions never store tokens and still expire on reload',async()=>{
 const f=fixture(),a=f.make();await a.acceptLink(link,()=>{});assert.equal(f.map.size,0);assert.equal(a.session.refresh,undefined);
 const b=f.make();await b.restore();assert.equal(b.session,null);f.advance();await assert.rejects(a.ensureSession(),e=>e.status===401);
});
test('simultaneous tabs renew once using latest rotated pair',async()=>{
 const f=fixture(),a=f.make();await sign(a);const b=f.make();await b.restore();f.advance();
 await Promise.all([a.ensureSession(),a.ensureSession(),b.ensureSession()]);
 assert.equal(f.calls.filter(c=>c.url.includes('refresh_token')).length,1);assert.equal(b.session.refresh,'rotated-refresh');
});
test('invalid refresh clears stored session and choice without raw error disclosure',async()=>{
 const f=fixture(),a=f.make();await sign(a);f.advance();a.fetcher=async()=>reply({error:'private raw server text'},400);
 await assert.rejects(a.ensureSession(),e=>e.status===400&&!e.message.includes('private'));assert.equal(a.session,null);assert.equal(f.map.size,0);
});
test('transient renewal failure retains pair for retry but does not return expired access',async()=>{
 const f=fixture(),a=f.make();await sign(a);f.advance();a.fetcher=async()=>reply({},503);
 await assert.rejects(a.ensureSession(),e=>e.status===503);assert.equal(a.session.refresh,'synthetic-refresh');assert.ok(f.storage.getItem(a.sessionKey));
});
test('logout removes saved session even if server unreachable; reload remains signed out',async()=>{
 const f=fixture(),a=f.make();await sign(a);a.fetcher=async()=>{throw Error('synthetic offline');};
 await assert.rejects(a.logout());assert.equal(f.map.size,0);assert.equal(a.session,null);const b=f.make();await b.restore();assert.equal(b.session,null);
});
test('logout waits for rotation then revokes current access and cannot resurrect',async()=>{
 const f=fixture(),a=f.make();await sign(a);f.advance();const pending=a.ensureSession();await a.logout();await pending;
 assert.equal(a.session,null);assert.equal(f.map.size,0);assert.equal(f.calls.at(-1).opts.headers.Authorization,'Bearer rotated-access');
});
test('blocked storage fails opt-in explicitly but unremembered sign-in works',async()=>{
 const f=fixture(),a=new CloudApi(config,async()=>reply({id:uid,email_confirmed_at:'synthetic'}),()=>0,{locks:f.locks,storage:()=>{throw Error('blocked');}});
 assert.throws(()=>a.setRemember(true),/storage is unavailable/);a.setRemember(false);await a.acceptLink(link,()=>{});assert.ok(a.session);a.clear();
});
test('new link bypasses expired saved renewal; destination without opt-in does not remember',async()=>{
 const f=fixture(),a=f.make();await sign(a);f.advance();const b=f.make();await b.restore(false);await b.acceptLink(link,()=>{});assert.equal(f.calls.filter(c=>c.url.includes('refresh_token')).length,0);
 const other=fixture().make();await other.restore(false);await other.acceptLink(link,()=>{});assert.equal(other.remember,false);assert.equal(other.session.refresh,undefined);
});
test('malformed storage and missing rotated identity fail closed',async()=>{
 const f=fixture(),a=f.make();await sign(a);f.storage.setItem(a.sessionKey,'invalid JSON');await assert.rejects(f.make().restore());assert.equal(f.map.size,0);
 await sign(a);f.advance();a.fetcher=async()=>reply({access_token:'synthetic',refresh_token:'synthetic',expires_in:3600,user:{id:'wrong'}});await assert.rejects(a.ensureSession());assert.equal(a.session,null);
});
test('missing tab coordination rejects persistence rather than racing refresh tokens',()=>{
 const f=fixture(),a=f.make();a.locks=undefined;assert.throws(()=>a.setRemember(true),/across tabs/);assert.equal(f.map.size,0);
});
test('another tab clearing storage prevents later renewal',async()=>{
 const f=fixture(),a=f.make();await sign(a);const b=f.make();await b.restore();await a.logout();
 await assert.rejects(b.ensureSession(),e=>e.status===401);assert.equal(b.session,null);
});
