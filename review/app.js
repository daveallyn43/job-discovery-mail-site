if(window.self!==window.top){document.body.replaceChildren(document.createTextNode('Open the review desk in its own tab.'));throw new Error('Framing is not supported.');}
import {createApi} from './adapter.mjs?v=20261021-remember1';
import {sourceInfo, matchesSource} from './sources.mjs?v=20261021-source1';
import {config} from './config.mjs';
let backend;
try { backend=createApi(config); } catch(e) { backend={request:async()=>{throw e;}}; }
const $=id=>document.getElementById(id), labels={interested:'Interested',maybe:'Maybe',not_interested:'Pass',applied:'Applied'};
let jobs=[],selected=null,demo=false,busy=false;const drafts=new Map();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
async function api(path,body){try{return await backend.request(path,body);}catch(e){if(e.status===401||e.status===403){$('login').hidden=false;$('workspace').hidden=true;$('logout').hidden=true;}throw e;}}
function date(s){return s?new Date(s).toLocaleString():'Unknown';}
function link(text,url){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error();const a=el('a',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return el('span',text+' — link unavailable');}}
function draft(j){if(!drafts.has(j.id))drafts.set(j.id,{state:j.review?.review_state||'',comment:j.review?.comment||'',dirty:false,id:crypto.randomUUID(),message:''});return drafts.get(j.id);}
function filtered(){const q=$('search').value.trim().toLowerCase();return jobs.filter(j=>matchesSource(j.sources,$('source').value)&&(!q||[j.title,j.company,j.location,j.job_description].join(' ').toLowerCase().includes(q))&&(!$('mode').value||(j.work_mode||'unknown')===$('mode').value)&&(!$('state').value||(j.review?.review_state||'unreviewed')===$('state').value)&&(!$('coverage').value||($('coverage').value==='retrieved'?j.jd_status==='retrieved':j.jd_status!=='retrieved')));}
function renderList(){const rows=filtered();if(!rows.some(j=>j.id===selected))selected=rows[0]?.id;$('jobs').replaceChildren();$('loadStatus').textContent=`${rows.length} of ${jobs.length} jobs shown.`;if(!rows.length)$('jobs').append(el('p','No jobs match these filters. Try clearing them.'));for(const j of rows){const b=el('button');b.type='button';b.disabled=busy;b.setAttribute('aria-current',String(j.id===selected));b.append(el('strong',j.title),el('small',j.company),el('small',`Discovered via: ${sourceInfo(j.sources).label}`),el('small',`${j.location||'Location unknown'} · ${labels[j.review?.review_state]||'Unreviewed'}`));b.onclick=()=>{selected=j.id;renderList();renderDetail();};$('jobs').append(b);}renderDetail();}
function renderDetail(){const j=jobs.find(x=>x.id===selected);if(!j){$('detail').replaceChildren(el('h2','No matching job selected'),el('p','Adjust the filters to see available jobs. Your unsaved drafts stay in this tab.'));return;}const d=draft(j),root=$('detail');root.replaceChildren();root.append(el('span',j.work_mode||'unknown','badge'),el('span',`Description: ${j.jd_status||'unknown'}`,'badge'),el('h2',j.title),el('p',`${j.company} · ${j.location||'Location unknown'}`,'meta'),link('Open original listing ↗',j.canonical_url),el('p',`First seen: ${date(j.first_seen_at)}\nLast seen: ${date(j.last_seen_at)}`,'meta'));root.append(el('h3','Description'));if(j.jd_status!=='retrieved')root.append(el('p','This description is partial or unavailable. Check the original listing for complete requirements.','notice'));const text=j.job_description?new DOMParser().parseFromString(j.job_description,'text/html').body.textContent:'No description was retrieved. This does not mean there are no openings.';root.append(el('div',text,'description'),el('p',`Description checked: ${date(j.jd_checked_at)}`,'meta'),el('h3','Discovered via'));const provenance=sourceInfo(j.sources);for(const s of provenance.discovery){const p=el('p');p.append(s.url?link(s.label,s.url):el('span',s.label));root.append(p);}if(!provenance.discovery.length)root.append(el('p','Unknown'));root.append(el('p','All recorded discovery sources are shown; this is not a chronological first-source claim.','meta'));if(provenance.official.length){root.append(el('h3','Official description evidence'));for(const s of provenance.official){const p=el('p');p.append(s.url?link(s.label,s.url):el('span',s.label));root.append(p);}}
const box=el('section',undefined,'reviewBox');box.append(el('h3','Your decision'));const buttons=el('div',undefined,'decision');for(const [state,label] of Object.entries(labels)){const b=el('button',label);b.type='button';b.disabled=busy;b.setAttribute('aria-pressed',String(d.state===state));b.onclick=()=>{d.state=state;d.dirty=true;d.id=crypto.randomUUID();d.message='Unsaved changes';renderDetail();};buttons.append(b);}box.append(buttons);const lab=el('label','Optional comment'),ta=el('textarea');ta.value=d.comment;ta.maxLength=4000;ta.disabled=busy;ta.oninput=()=>{d.comment=ta.value;d.dirty=true;d.id=crypto.randomUUID();d.message='Unsaved changes';status.textContent=d.message;};lab.append(ta);box.append(lab);const save=el('button',busy?'Saving…':'Save decision','primary');save.id='save';save.disabled=busy;const status=el('p',d.message);status.setAttribute('role','status');let fail;if(demo){const l=el('label','Demo: simulate failed save');fail=el('input');fail.type='checkbox';l.append(fail);box.append(l);}save.onclick=async()=>{if(busy)return;if(!d.state){status.textContent='Choose a decision first.';return;}const simulated=fail?.checked,payload={id:d.id,job_id:j.id,review_state:d.state,comment:d.comment};busy=true;$('refresh').disabled=true;$('logout').disabled=true;renderList();renderDetail();try{if(simulated)throw Error('Simulated save failure. Your draft is retained.');await api('feedback',payload);j.review={review_state:d.state,comment:d.comment};d.dirty=false;d.message='Saved. Your feedback history is preserved.';renderList();}catch(e){d.message=e.message;}finally{busy=false;$('refresh').disabled=false;$('logout').disabled=false;renderList();renderDetail();}};box.append(save,status);root.append(box);}
async function load(){
  if(busy)return;
  busy=true;$('refresh').disabled=true;$('logout').disabled=true;
  if(jobs.length){renderList();renderDetail();}
  $('loadStatus').textContent='Loading jobs…';let errorMessage='';
  try{
    const data=await api('jobs');jobs=data.jobs;
    for(const j of jobs)if(!drafts.get(j.id)?.dirty)drafts.delete(j.id);
    $('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;
    selected=jobs.some(j=>j.id===selected)?selected:jobs[0]?.id;
    if(!selected){$('detail').replaceChildren(el('h2','No jobs available'),el('p','There are no jobs visible to this account. Check that you used the approved account.'));}
  }catch(e){errorMessage=e.message;$('loginStatus').textContent=e.message;}
  finally{busy=false;$('refresh').disabled=false;$('logout').disabled=false;renderList();renderDetail();if(errorMessage)$('loadStatus').textContent=errorMessage;}
}
for(const id of ['search','mode','state','coverage','source'])$(id).addEventListener('input',renderList);$('clear').onclick=()=>{for(const id of ['search','mode','state','coverage','source'])$(id).value='';renderList();};$('refresh').onclick=load;
$('demoLogin').onclick=async()=>{try{await api('demo-login',{});await load();}catch(e){$('loginStatus').textContent=e.message;}};$('logout').onclick=async()=>{let message='Signed out.';try{await api('logout',{});}catch(e){message='Signed out locally. Remote sign-out could not be confirmed; server revocation is unconfirmed. If browser storage could not be cleared, clear this site’s browser data before leaving a shared device.';}finally{$('remember').checked=false;jobs=[];drafts.clear();$('jobs').replaceChildren();$('detail').replaceChildren();$('workspace').hidden=true;$('logout').hidden=true;$('login').hidden=false;$('loginStatus').textContent=message;}};
$('loginForm').onsubmit=async e=>{e.preventDefault();if($('sendCode').disabled)return;$('sendCode').disabled=true;$('sendCode').textContent='Requesting link…';$('loginStatus').textContent='Contacting sign-in. Please keep this page open.';try{backend.setRemember?.($('remember').checked);await api('send-code',{email:$('email').value});$('loginStatus').textContent='Check your email and open the newest sign-in link. It signs you into the browser where you open it. Do not forward the link.';}catch(err){$('loginStatus').textContent=err.message;}finally{$('sendCode').disabled=false;$('sendCode').textContent='Email me a sign-in link';}};
window.addEventListener('beforeunload',e=>{if([...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
(async()=>{try{const c=await api('config');demo=c.demo;$('checkConnection').hidden=demo;if(!demo){await backend.restore(!location.hash);$('remember').checked=backend.remember;}if(!demo && location.hash){const fragment=location.hash;await backend.acceptLink(fragment,()=>history.replaceState(null,'',location.pathname));}$('demoLogin').hidden=!demo;$('loginForm').hidden=demo;if(demo){$('banner').hidden=false;$('banner').textContent='SYNTHETIC DEMO · All jobs below are fictional. Feedback stays in local demo storage.';$('loginIntro').textContent='Test the interface using fictional jobs. No Supabase connection is enabled.';}if(demo||backend.session)await load();}catch(e){$('loginStatus').textContent=e.message;}})();

async function checkSession(){
  if(!backend.session)return;
  try{await backend.ensureSession();}catch(e){
    $('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=!backend.session;
    $('loginStatus').textContent=e.message;
  }
}
setInterval(checkSession,30000);
window.addEventListener('focus',checkSession);
window.addEventListener('storage',e=>{
  if(e.key===backend.sessionKey && !e.newValue){
    backend.session=null;backend.remember=false;backend.generation++;
    jobs=[];drafts.clear();$('jobs').replaceChildren();$('detail').replaceChildren();
    $('workspace').hidden=true;$('logout').hidden=true;$('login').hidden=false;
    $('remember').checked=false;$('loginStatus').textContent='Signed out in another tab.';
  }
});

$('checkConnection').onclick=async()=>{const button=$('checkConnection');button.disabled=true;$('connectionStatus').textContent='Checking sign-in connectivity. No email is sent.';const started=performance.now();try{await api('check-connection');$('connectionStatus').textContent='Connection works: Auth responded and email sign-in is enabled. No email was sent.';}catch(e){$('connectionStatus').textContent=e.message+' Elapsed: '+((performance.now()-started)/1000).toFixed(1)+' seconds. No email was sent.';}finally{button.disabled=false;}};
