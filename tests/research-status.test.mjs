import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResearch,researchStatus,companyStatus} from '../review/companies.mjs';
test('older directory remains compatible',()=>{assert.equal(validateResearch({}),true);assert.equal(researchStatus({}),null);});
test('research needs a date and a recognized state',()=>{assert.equal(validateResearch({research_status:'blocked'}),false);assert.equal(validateResearch({research_status:'closed',research_checked_at:'2026-10-23T00:00:00Z'}),false);});
test('unsafe evidence rejected',()=>{assert.equal(validateResearch({research_evidence_url:'javascript:alert(1)'}),false);});
test('no careers finding remains tentative',()=>{const r=researchStatus({research_status:'no_careers_found'});assert.match(r.label,/checked pages/);assert.match(r.detail,/not proof/);});
test('research does not overwrite actual feed health',()=>{const c={monitoring_enabled:true,verification_status:'verified',last_check_status:'empty',last_job_count:0,research_status:'blocked'};assert.match(companyStatus(c).label,/0 openings/);assert.equal(researchStatus(c).label,'Research page inaccessible');});
