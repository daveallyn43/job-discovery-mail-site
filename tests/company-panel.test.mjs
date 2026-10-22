import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCompanies} from '../review/company-panel.mjs';
class Element {
 constructor(){this.children=[];this.value='';this.attributes={};this.hidden=false;this.disabled=false;}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(k,v){this.attributes[k]=v;}
 focus(){this.focused=true;}
}
function fixture(request){const nodes={companyName:new Element(),companySource:new Element(),companyRequestStatus:new Element()};globalThis.document={getElementById:id=>nodes[id]??=(new Element()),createElement:()=>new Element()};let changes=0;const panel=mountCompanies({request,getJobs:()=>[{id:'job1'},{id:'unlinked'}],onFilterChanged:()=>changes++,onAuthError:()=>{}});return {nodes,panel,changes:()=>changes};}
const data=()=>({companies:[{id:'company1',name:'Nilo',verification_status:'unavailable',monitoring_enabled:true,last_check_status:'failed',last_job_count:null,last_checked_at:null,last_success_at:null,career_url:null,provenance_url:null}],links:[{company_id:'company1',job_id:'job1'}],requests:[]});
const flush=()=>new Promise(r=>setImmediate(r));
test('company selection filters linked jobs and preserves all unlinked leads after clearing',async()=>{
 const {nodes,panel}=fixture(async()=>data());nodes.showCompanies.onclick();await flush();
 assert.equal(nodes.companyView.hidden,false);const card=nodes.companyList.children[0];assert.ok(card.children.some(c=>c.textContent==='Feed unavailable'));
 card.children.at(-1).onclick();assert.equal(nodes.jobView.hidden,false);assert.equal(panel.matches('job1'),true);assert.equal(panel.matches('unlinked'),false);assert.equal(nodes.companyFilterStatus.focused,true);
 nodes.clearCompanyFilter.onclick();assert.equal(panel.matches('unlinked'),true);assert.equal(nodes.clearCompanyFilter.hidden,true);
 panel.clear();assert.equal(nodes.companyList.children.length,0);assert.equal(nodes.requestCompanySubmit.disabled,true);
});
test('failed refresh removes stale health, clears company filter and leaves jobs accessible',async()=>{
 let failed=false;const {nodes,panel}=fixture(async()=>{if(failed)throw new Error('Unavailable');return data();});nodes.showCompanies.onclick();await flush();nodes.companyList.children[0].children.at(-1).onclick();failed=true;await nodes.refreshCompanies.onclick();assert.equal(panel.matches('unlinked'),true);assert.equal(nodes.companyList.children.length,0);assert.match(nodes.companyStatus.textContent,/unavailable/);assert.equal(nodes.requestCompanySubmit.disabled,true);
});
test('request form retains same UUID on uncertain response and does not request enrollment',async()=>{
 const saves=[];let fail=true;const {nodes}=fixture(async(path,body)=>{if(path==='companies')return data();saves.push({...body});if(fail)throw new Error('Lost response');return {saved:true};});nodes.showCompanies.onclick();await flush();nodes.companyName.value='Example';nodes.companySource.value='https://example.com/careers';const event={preventDefault(){}};
 await nodes.companyRequestForm.onsubmit(event);assert.equal(nodes.companyName.value,'Example');fail=false;await nodes.companyRequestForm.onsubmit(event);assert.equal(saves.length,2);assert.deepEqual(saves[0],saves[1]);assert.deepEqual(Object.keys(saves[0]).sort(),['id','name','source_url']);assert.match(nodes.companyRequestStatus.textContent,/Monitoring has not been enabled/);
});
