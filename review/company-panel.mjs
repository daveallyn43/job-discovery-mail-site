import {companyStatus,researchStatus,linkedJobIds,matchesCompany} from './companies.mjs?v=20261023-research1';

export function mountCompanies({request,getJobs,onFilterChanged,onAuthError}) {
  const $=id=>document.getElementById(id);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const date=value=>value?new Date(value).toLocaleString():'Not recorded';
  const safeLink=(label,url)=>{const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  let data=null,loading=false,generation=0,selectedCompany='',pending=null,saving=false;
  function show(view) {
    $('companyView').hidden=view!=='companies';$('jobView').hidden=view!=='jobs';
    $('showCompanies').setAttribute('aria-pressed',String(view==='companies'));
    $('showJobs').setAttribute('aria-pressed',String(view==='jobs'));
    if(view==='companies' && !data && !loading)load();
  }
  function labelFilter() {
    const c=data?.companies.find(c=>c.id===selectedCompany);
    $('companyFilterStatus').textContent=c?`Company: ${c.name}. Other job filters still apply.`:'All companies, including unlinked email and newsletter leads.';
    $('clearCompanyFilter').hidden=!c;
  }
  function render() {
    $('companyList').replaceChildren();$('companyRequests').replaceChildren();labelFilter();
    if(!data)return;
    const jobs=new Set(getJobs().map(j=>j.id));
    $('companyStatus').textContent=`${data.companies.length} companies · ${data.companies.filter(c=>c.monitoring_enabled).length} enabled monitors. Enrollment and successful collection are separate.`;
    for(const c of [...data.companies].sort((a,b)=>a.name.localeCompare(b.name))) {
      const card=el('article');card.className='card companyCard';
      const status=companyStatus(c),heading=el('h3',c.name),flag=el('p',status.label);
      flag.className=status.attention?'notice':'meta';card.append(heading,el('p',status.enrollment),flag,el('p',status.detail));
      card.append(el('p',`Last check: ${date(c.last_checked_at)}\nLast successful check: ${date(c.last_success_at)}`));
      const research=researchStatus(c);
      if(research) {
        const block=el('section');block.setAttribute('aria-label','Company source research');
        block.append(el('p',`Research: ${research.label}`),el('p',research.detail),el('p',`Research checked: ${date(c.research_checked_at)}`));
        if(c.research_evidence_url)block.append(safeLink('Research evidence ↗',c.research_evidence_url));
        card.append(block);
      }
      if(c.career_url)card.append(safeLink('Employer careers page ↗',c.career_url));
      if(c.provenance_url){const p=el('p');p.append(safeLink('Company discovery source ↗',c.provenance_url));card.append(p);}
      const count=[...linkedJobIds(c.id,data.links)].filter(id=>jobs.has(id)).length;
      const button=el('button',`View ${count} linked jobs`);button.type='button';
      button.onclick=()=>{selectedCompany=c.id;labelFilter();onFilterChanged();show('jobs');$('companyFilterStatus').focus();};
      card.append(button);$('companyList').append(card);
    }
    if(!data.companies.length)$('companyList').append(el('p','No companies are visible to this account. This is not a monitoring result.'));
    for(const r of [...data.requests].sort((a,b)=>b.created_at.localeCompare(a.created_at))) {
      const li=el('li');li.append(el('strong',r.name),el('span',` — Requested ${date(r.created_at)}. Request history only; check the directory above for monitoring status. `),safeLink('Source ↗',r.source_url));$('companyRequests').append(li);
    }
    if(!data.requests.length)$('companyRequests').append(el('li','No company requests recorded.'));
  }
  async function load() {
    if(loading)return;
    loading=true;const attempt=++generation;
    $('refreshCompanies').disabled=true;$('requestCompanySubmit').disabled=true;
    $('companyStatus').textContent='Loading company directory…';
    try {
      const result=await request('companies');
      if(attempt!==generation)return;
      data=result;
      if(selectedCompany && !data.companies.some(c=>c.id===selectedCompany)){selectedCompany='';onFilterChanged();}
      render();
    } catch(e) {
      if(attempt!==generation)return;
      // Never show stale health as current after a failed refresh.
      data=null;selectedCompany='';render();onFilterChanged();
      $('companyStatus').textContent=`Company directory unavailable. ${e.message} The jobs view remains independent.`;
      if(e.status===401)onAuthError(e);
    } finally {
      if(attempt===generation){loading=false;$('refreshCompanies').disabled=false;$('requestCompanySubmit').disabled=!data;}
    }
  }
  $('showCompanies').onclick=()=>show('companies');$('showJobs').onclick=()=>show('jobs');
  $('refreshCompanies').onclick=load;
  $('clearCompanyFilter').onclick=()=>{selectedCompany='';labelFilter();onFilterChanged();};
  $('companyRequestForm').onsubmit=async event=>{
    event.preventDefault();if(saving || !data)return;
    const name=$('companyName').value.trim(),source_url=$('companySource').value.trim();
    if(!pending || pending.name!==name || pending.source_url!==source_url)pending={id:crypto.randomUUID(),name,source_url};
    saving=true;const attempt=generation;
    $('requestCompanySubmit').disabled=true;$('companyName').disabled=true;$('companySource').disabled=true;
    $('companyRequestStatus').textContent='Saving company request…';
    try {
      await request('company-request',pending);
      if(attempt!==generation)return;
      pending=null;$('companyRequestStatus').textContent='Company request saved. Monitoring has not been enabled; the official source still needs verification.';
      $('companyName').value='';$('companySource').value='';await load();
    } catch(e) {
      if(attempt!==generation)return;
      $('companyRequestStatus').textContent=`${e.message} Your entered request is retained. Retry checks the same request before saving again.`;
      if(e.status===401)onAuthError(e);
    } finally {saving=false;$('companyName').disabled=false;$('companySource').disabled=false;$('requestCompanySubmit').disabled=!data;}
  };
  return {
    matches:jobId=>matchesCompany(jobId,selectedCompany,data?.links||[]),
    clearFilter:()=>{selectedCompany='';labelFilter();},
    jobsUpdated:()=>{if(data)render();},
    clear:()=>{generation++;loading=false;data=null;selectedCompany='';pending=null;render();$('companyName').value='';$('companySource').value='';$('companyRequestStatus').textContent='';$('companyStatus').textContent='Open Companies to load the directory.';$('requestCompanySubmit').disabled=true;show('jobs');},
  };
}
