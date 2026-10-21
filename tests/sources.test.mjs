import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceInfo, matchesSource} from '../review/sources.mjs';
test('email provenance survives official enrichment without sender inference',()=>{
 const rows=[{source_kind:'email',source_name:'Gmail sender ab123',source_url:'https://www.linkedin.com/jobs/view/1'},
 {source_kind:'job_board',source_name:'Official match: Example',source_url:'https://jobs.ashbyhq.com/example/1'}];
 const x=sourceInfo(rows);assert.equal(x.label,'Email alert');assert.deepEqual(x.kinds,['email']);assert.equal(x.official.length,1);assert.equal(matchesSource(rows,'employer'),false);
});
test('multiple discovery channels retained; duplicate sightings collapsed',()=>{
 const email={source_kind:'email',source_name:'Ali Rohde',source_url:'https://example.com/1'};
 const rows=[email,{...email},{source_kind:'job_board',source_name:'Example',source_url:'https://example.com/2'}];
 assert.equal(sourceInfo(rows).discovery.length,2);assert.equal(matchesSource(rows,'email'),true);assert.equal(matchesSource(rows,'employer'),true);
});
test('official-only and absent sightings are unknown discovery',()=>{
 for(const rows of [[],[{source_kind:'job_board',source_name:'Official match: Example'}]]){
 assert.equal(sourceInfo(rows).label,'Unknown');assert.equal(matchesSource(rows,'unknown'),true);assert.equal(matchesSource(rows,'email'),false);}
});
test('private fields do not enter display model; manual and other remain visible',()=>{
 const x=sourceInfo([{source_kind:'manual',source_reference:'PRIVATE',id:'PRIVATE',source_name:'Example'}, {source_kind:'other',source_name:'Other'}]);
 assert.equal(JSON.stringify(x).includes('PRIVATE'),false);assert.deepEqual(x.kinds,['manual','other']);
});
