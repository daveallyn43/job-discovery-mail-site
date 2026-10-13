/* Private data is fetched only at runtime. No tokens or jobs use browser storage. */
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const project = 'https://glhxpsuuxawejfvolspt.supabase.co';
const columns = {
  jobs: 'id,title,company,location,work_mode,canonical_url,job_description,jd_status,jd_checked_at,first_seen_at,last_seen_at',
  source_sightings: 'id,job_id,source_kind,source_name,source_url,last_seen_at',
  review_feedback: 'id,job_id,review_state,comment,reviewed_at',
};
const states = new Set(['interested', 'maybe', 'not_interested', 'applied']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class CloudApi {
  constructor(config, fetcher = globalThis.fetch, clock = Date.now) {
    if (config.url !== project || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key || '')) {
      throw new ApiError(503, 'Cloud access is not configured. No request was sent.');
    }
    this.config = config; this.fetcher = fetcher; this.clock = clock;
    this.session = null; this.generation = 0; this.sendingCode = false;
    this.lastCode = -Infinity; this.verifying = false; this.inflight = new Map();
  }
  clear() { this.session = null; this.generation++; }
  token() {
    if (!this.session || this.session.expires <= this.clock()) {
      this.clear(); throw new ApiError(401, 'Your session has ended. Sign in again; your draft is retained.');
    }
    return this.session.token;
  }
  async http(path, {body, token, prefer} = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const headers = {apikey: this.config.key, 'Content-Type': 'application/json'};
      if (token) headers.Authorization = 'Bearer ' + token;
      if (prefer) headers.Prefer = prefer;
      const r = await this.fetcher(project + path, {
        method: body === undefined ? 'GET' : 'POST', headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
      });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          this.clear(); throw new ApiError(r.status, 'Sign-in expired or this account has no access. Sign in with the approved account.');
        }
        if (r.status === 400 && path === '/auth/v1/verify') throw new ApiError(400, 'The code is invalid or expired. Request a new code.');
        if (r.status === 429) throw new ApiError(429, 'Too many requests. Wait a minute and try again.');
        if (r.status === 409) throw new ApiError(409, 'This save already exists. Checking its result is safe.');
        throw new ApiError(r.status, 'The service could not complete the request. Your draft is retained.');
      }
      const raw = await r.text();
      if (raw.length > 8000000) throw new ApiError(502, 'Data response exceeds the safe size limit.');
      let data;
      try { data = raw ? JSON.parse(raw) : null; }
      catch { throw new ApiError(502, 'Invalid service response. Please try again.'); }
      return {data, headers: r.headers};
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(503, 'Connection failed or timed out. Your draft is retained; retry safely.');
    } finally { clearTimeout(timer); }
  }
  async sendCode(email) {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter your approved email address.');
    if (this.sendingCode || this.clock() - this.lastCode < 60000) throw new ApiError(429, 'Wait one minute before requesting another code.');
    this.sendingCode = true; this.lastCode = this.clock();
    try { await this.http('/auth/v1/otp?redirect_to=' + encodeURIComponent('https://daveallynlab.com/review/'), {body: {email, create_user: false}}); return {sent: true}; }
    finally { this.sendingCode = false; }
  }
  async verify(email, code) {
    if (this.verifying) throw new ApiError(429, 'Sign-in is already in progress.');
    if (typeof email !== 'string' || typeof code !== 'string' || !/^\d{6,10}$/.test(code)) throw new ApiError(400, 'Check the email and code.');
    this.verifying = true; const generation = this.generation;
    try {
      const {data} = await this.http('/auth/v1/verify', {body: {email, token: code, type: 'email'}});
      if (!data || typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new ApiError(502, 'Invalid sign-in response.');
      const {data: user} = await this.http('/auth/v1/user', {token: data.access_token});
      if (!user || !uuid.test(user.id || '')) throw new ApiError(401, 'Account verification failed.');
      if (generation !== this.generation) throw new ApiError(401, 'Sign-in was cancelled.');
      // Discard refresh token. Supabase RLS, never this client, authorizes the UID.
      this.session = {token: data.access_token, user: user.id, expires: this.clock() + Math.min(data.expires_in, 3600) * 1000};
      return {ok: true};
    } finally { this.verifying = false; }
  }
  async acceptLink(fragment, clearUrl) {
    // The default Supabase browser flow returns tokens in the URL fragment,
    // which is never sent to the Pages server. Remove it before any await.
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    clearUrl();
    if (params.has('error')) throw new ApiError(401, 'This sign-in link is expired or invalid. Request a new link.');
    const token = params.get('access_token');
    const expires = Number(params.get('expires_in'));
    const expiresAt = Number(params.get('expires_at'));
    const type = params.get('type');
    if (!token || params.get('token_type') !== 'bearer' || !['magiclink', 'invite'].includes(type) || !Number.isFinite(expires) || expires <= 0) throw new ApiError(401, 'Invalid sign-in link. Request a new link.');
    const remaining = Number.isFinite(expiresAt) && expiresAt > 0 ? Math.min(expires, expiresAt - this.clock()/1000) : expires;
    if (remaining <= 0) throw new ApiError(401, 'This sign-in link has expired. Request a new link.');
    const generation = this.generation;
    const {data: user} = await this.http('/auth/v1/user', {token});
    if (!user || !uuid.test(user.id || '') || !user.email_confirmed_at || generation !== this.generation) throw new ApiError(401, 'Account verification failed. Request a new link.');
    // RLS binds the real owner UUID; no client-side email check grants access.
    this.session = {token, user: user.id, expires: this.clock() + Math.min(remaining, 3600)*1000};
    return {ok: true};
  }
  async rows(table, token) {
    let offset = 0, total = null; const all = [], seen = new Set();
    while (offset < 10000) {
      const query = new URLSearchParams({select: columns[table], order: 'id.asc', limit: '200', offset: String(offset)});
      const {data, headers} = await this.http('/rest/v1/' + table + '?' + query, {token, prefer: 'count=exact'});
      const range = headers.get('content-range') || '';
      const match = range.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
      if (!Array.isArray(data) || !match) throw new ApiError(502, 'Incomplete pagination metadata. No partial queue was shown.');
      const count = Number(match[1]);
      if (count > 10000) throw new ApiError(503, 'This queue exceeds the 10,000-row limit. No partial queue was shown.');
      if (total !== null && count !== total) throw new ApiError(409, 'The queue changed while loading. Refresh to try again.');
      total = count;
      for (const row of data) {
        if (!row || !uuid.test(row.id || '') || seen.has(row.id)) throw new ApiError(502, 'Invalid or repeated result. Refresh to try again.');
        seen.add(row.id); all.push(row);
      }
      offset += data.length;
      if (offset === total) return all;
      if (!data.length || offset > total) throw new ApiError(502, 'Incomplete result. No partial queue was shown.');
    }
    throw new ApiError(503, 'Result limit reached. No partial queue was shown.');
  }
  async list() {
    const token = this.token(), generation = this.generation;
    const {data: user} = await this.http('/auth/v1/user', {token});
    if (user?.id !== this.session?.user) { this.clear(); throw new ApiError(401, 'Account changed. Sign in again.'); }
    const jobs = await this.rows('jobs', token);
    const sightings = await this.rows('source_sightings', token);
    const feedback = await this.rows('review_feedback', token);
    if (generation !== this.generation || !this.session) throw new ApiError(401, 'Session changed. Sign in again.');
    const sources = new Map(), latest = new Map();
    for (const s of sightings) { if (!sources.has(s.job_id)) sources.set(s.job_id, []); sources.get(s.job_id).push(s); }
    feedback.sort((a, b) => String(b.reviewed_at).localeCompare(String(a.reviewed_at)) || b.id.localeCompare(a.id));
    for (const r of feedback) if (!latest.has(r.job_id)) latest.set(r.job_id, r);
    return {jobs: jobs.map(j => ({...j, sources: sources.get(j.id) || [], review: latest.get(j.id) || null})), demo: false};
  }
  save(body) {
    const fields = ['id', 'job_id', 'review_state', 'comment'];
    if (!body || Object.keys(body).sort().join() !== fields.sort().join() || !uuid.test(body.id || '') || !uuid.test(body.job_id || '') || !states.has(body.review_state) || typeof body.comment !== 'string' || body.comment.length > 4000) return Promise.reject(new ApiError(400, 'Invalid feedback.'));
    const payload = {...body}, serialized = JSON.stringify(payload), existing = this.inflight.get(payload.id);
    if (existing) return existing.serialized === serialized ? existing.promise : Promise.reject(new ApiError(409, 'A different decision is already being saved.'));
    const promise = this.saveOnce(payload).finally(() => this.inflight.delete(payload.id));
    this.inflight.set(payload.id, {serialized, promise}); return promise;
  }
  async saveOnce(body) {
    const token = this.token();
    const query = new URLSearchParams({id: 'eq.' + body.id, select: 'id,job_id,review_state,comment'});
    const check = async () => {
      const {data} = await this.http('/rest/v1/review_feedback?' + query, {token});
      if (!Array.isArray(data) || data.length > 1) throw new ApiError(502, 'Invalid save verification response.');
      if (!data.length) return false;
      if (Object.keys(body).some(k => data[0][k] !== body[k])) throw new ApiError(409, 'Conflicting retry. Your previous decision was not overwritten.');
      return true;
    };
    if (await check()) return {saved: true};
    try { await this.http('/rest/v1/review_feedback', {token, body, prefer: 'return=minimal'}); }
    catch (e) { if (e.status !== 409 || !(await check())) throw e; }
    return {saved: true};
  }
  async request(path, body) {
    if (path === 'config') return {demo: false};
    if (path === 'send-code') return this.sendCode(body.email);
    if (path === 'verify-code') return this.verify(body.email, body.code);
    if (path === 'jobs') return this.list();
    if (path === 'feedback') return this.save(body);
    if (path === 'logout') {
      const token = this.session?.token; this.clear();
      if (token) await this.http('/auth/v1/logout?scope=local', {token, body: {}});
      return {ok: true};
    }
    throw new ApiError(404, 'Unknown action.');
  }
}
export function createApi(config) {
  if (config.mode === 'cloud') return new CloudApi(config);
  if (config.mode !== 'local') throw new ApiError(503, 'Review access is not configured.');
  return {async request(path, body) {
    const r = await fetch('/api/' + path, {method: body ? 'POST' : 'GET', headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
    const data = await r.json(); if (!r.ok) throw new ApiError(r.status, data.error || 'Request failed.'); return data;
  }};
}
