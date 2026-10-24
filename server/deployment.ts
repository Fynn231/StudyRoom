// Validate operator configuration before creating listeners or subprocesses.
// Config never comes from Host, Forwarded, X-Forwarded-Host or a browser payload.
export function assertLocalDeployment(env: NodeJS.ProcessEnv = process.env): void {
  const mode = env.STUDY_DEPLOYMENT_MODE ?? 'local';
  if (mode !== 'local' && mode !== 'hosted') throw new Error('STUDY_DEPLOYMENT_MODE must be local or hosted.');
  if (env.STUDY_PUBLIC_ORIGIN !== undefined) {
    if (mode !== 'hosted') throw new Error('STUDY_PUBLIC_ORIGIN requires hosted mode; it cannot broaden local trust.');
    let valid = false;
    try {
      const url = new URL(env.STUDY_PUBLIC_ORIGIN);
      const labels = url.hostname.split('.');
      valid = url.protocol === 'https:' && url.origin === env.STUDY_PUBLIC_ORIGIN && !url.username && !url.password
        && labels.length >= 2 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
        && !/^[\d.]+$/.test(url.hostname);
    } catch { /* Fail closed without reflecting potentially sensitive config. */ }
    if (!valid) throw new Error('STUDY_PUBLIC_ORIGIN must be one canonical exact HTTPS DNS origin, without credentials, path, query, fragment or wildcard.');
  }
  if (mode === 'hosted') {
    const missing = [];
    if (!env.STUDY_PUBLIC_ORIGIN) missing.push('STUDY_PUBLIC_ORIGIN');
    if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
    if (missing.length > 0) {
      throw new Error(`Hosted mode is unavailable: authentication is not configured. Set STUDY_PUBLIC_ORIGIN, ${missing.join(', ')} before enabling hosted mode.`);
    }
    let supabaseUrlValid = false;
    try {
      const url = new URL(env.SUPABASE_URL!);
      supabaseUrlValid = url.protocol === 'https:' && url.origin === env.SUPABASE_URL && !url.username && !url.password;
    } catch {
      supabaseUrlValid = false;
    }
    if (!supabaseUrlValid) {
      throw new Error('Hosted mode is unavailable: SUPABASE_URL must be an absolute https:// URL with no username or password.');
    }
    if (env.STUDY_PROXY_POLICY !== 'render') throw Error('Hosted mode requires STUDY_PROXY_POLICY=render: TLS terminates at Render, only canonical Host/Origin are accepted, and forwarded headers are never trusted.');
    if (!isPublishableKey(env.SUPABASE_ANON_KEY ?? '')) throw Error('Hosted mode requires a publishable key, never a secret or service_role key.');
    if (typeof env.SUPABASE_ANON_KEY !== 'string' || env.SUPABASE_ANON_KEY.trim().length === 0) {
      throw new Error('Hosted mode is unavailable: SUPABASE_ANON_KEY must be a non-empty string.');
    }
  }
}

export function isPublishableKey(key: string): boolean {
 if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
 try { const parts = key.split('.'); if (parts.length !== 3) return false; const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); return p.role === 'anon' && !!parts[2]; } catch { return false; }
}
