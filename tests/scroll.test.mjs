import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the real render functions with a minimal DOM, without a browser,
// authentication, network requests, or persisted feedback. Layout needs visual QA.
class Element {
  constructor(tag='div') { this.tag=tag; this.children=[]; this.dataset={}; this.scrollTop=0; this.value=''; this.attributes={}; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children=items; this.scrollTop=0; }
  querySelector() { return this.children.find(x=>x.attributes?.['aria-current']==='true'); }
  focus() { this.focused=true; }
  setAttribute(k,v) { this.attributes[k]=v; }
}
function fixture() {
  const nodes=Object.fromEntries(['jobs','detail','search','source','mode','state','coverage','loadStatus'].map(id=>[id,new Element()]));
  const context=vm.createContext({
    document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},
    crypto:{randomUUID:()=> 'synthetic-draft'}, URL,
    DOMParser:class {parseFromString(text) {return {body:{textContent:text}};}},
    sourceInfo:()=>({label:'Employer feed: Synthetic',discovery:[{label:'Employer feed: Synthetic',url:'https://example.com/job'}],official:[]}),
    matchesSource:()=>true,
  });
  const source=readFileSync(new URL('../review/app.js',import.meta.url),'utf8');
  vm.runInContext(source.slice(source.indexOf('const $='),source.indexOf('async function load()')),context);
  vm.runInContext(`jobs=Array.from({length:360},(_,i)=>({id:String(i),title:'Synthetic '+i,company:'Synthetic',jd_status:'retrieved',job_description:'Long description',canonical_url:'https://example.com/job'}));selected='0';renderList();`,context);
  return {nodes,run:code=>vm.runInContext(code,context)};
}
test('selecting a distant job retains list position and opens details at top',()=>{
  const {nodes,run}=fixture();
  nodes.jobs.scrollTop=24000;nodes.detail.scrollTop=600;
  nodes.jobs.children[250].onclick();
  assert.equal(nodes.jobs.scrollTop,24000);
  assert.equal(nodes.detail.scrollTop,0);
  assert.equal(nodes.detail.dataset.jobId,'250');
  assert.equal(run('selected'),'250');
  assert.equal(nodes.jobs.children[250].attributes['aria-current'],'true');
  assert.equal(nodes.jobs.children[250].focused,true);
});
test('rerendering same selection keeps detail position and unsaved draft',()=>{
  const {nodes,run}=fixture();
  nodes.detail.scrollTop=800;nodes.jobs.scrollTop=400;
  run("draft(jobs[0]).comment='Unsaved synthetic note';draft(jobs[0]).dirty=true;renderList();renderDetail();");
  assert.equal(nodes.detail.scrollTop,800);
  assert.equal(nodes.jobs.scrollTop,400);
  assert.equal(run('draft(jobs[0]).comment'),'Unsaved synthetic note');
});
test('filter selection changes reset details while preserving drafts',()=>{
  const {nodes,run}=fixture();
  nodes.detail.scrollTop=800;
  run("draft(jobs[0]).comment='Retain me';draft(jobs[0]).dirty=true;");
  nodes.search.value='Synthetic 359';run('renderList()');
  assert.equal(nodes.jobs.children.length,1);
  assert.equal(nodes.detail.dataset.jobId,'359');
  assert.equal(nodes.detail.scrollTop,0);
  nodes.search.value='';run('renderList()');
  assert.equal(run('draft(jobs[0]).comment'),'Retain me');
});
