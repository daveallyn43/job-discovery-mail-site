// Uses only the existing permitted source fields; never guesses an email sender.
export const sourceOptions = [
  ['email', 'Email / newsletter'], ['employer', 'Employer feed'],
  ['manual', 'Manual'], ['other', 'Other source'], ['unknown', 'Unknown'],
];
export function sourceInfo(sources = []) {
  const discovery = [], official = [], seen = new Set();
  for (const source of sources || []) {
    const s = source || {}, name = typeof s.source_name === 'string' ? s.source_name.trim() : '';
    const enrichment = s.source_kind === 'job_board' && name.startsWith('Official match: ');
    let kind = 'other', label = name || 'Other source';
    if (enrichment) label = name.slice('Official match: '.length) || 'Official employer';
    else if (s.source_kind === 'email') {
      kind = 'email';
      label = !name || /^Gmail sender [a-f0-9]+$/i.test(name) ? 'Email alert' : `Email / newsletter: ${name}`;
    } else if (['job_board', 'company_site'].includes(s.source_kind)) {
      kind = 'employer'; label = name ? `Employer feed: ${name}` : 'Employer feed';
    } else if (s.source_kind === 'manual') { kind = 'manual'; label = 'Manual'; }
    const key = JSON.stringify([enrichment, kind, label, s.source_url || '']);
    if (seen.has(key)) continue;
    seen.add(key);
    (enrichment ? official : discovery).push({kind, label, url: s.source_url || null});
  }
  const kinds = [...new Set(discovery.map(s => s.kind))];
  return {discovery, official, kinds: kinds.length ? kinds : ['unknown'],
    label: discovery.length ? [...new Set(discovery.map(s => s.label))].join(' · ') : 'Unknown'};
}
export function matchesSource(sources, selected) {
  return !selected || sourceInfo(sources).kinds.includes(selected);
}
