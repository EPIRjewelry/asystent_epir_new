// Handlers for managing Cloudflare events and configuration via MCP
// Safe, minimal implementations that call Cloudflare Account APIs using
// the account-level token provided in environment: CLOUDFLARE_API_TOKEN

interface EnvLike {
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CONFIG_KV: KVNamespace;
}

const ensureAuth = (env: EnvLike) => {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID in environment');
  }
};

async function cfFetch(path: string, env: EnvLike, options: RequestInit = {}): Promise<any> {
  ensureAuth(env);
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${path}`;
  const headers: Record<string,string> = {
    'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json'
  };

  const res = await fetch(url, { headers, ...options });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body && (body.errors?.[0]?.message || body.message)) || `Cloudflare API error: ${res.status}`;
    const code = (body && body.errors?.[0]?.code) || res.status;
    throw new Error(`${msg} (code: ${code})`);
  }
  return body;
}

export async function createCronTrigger(params: any, env: EnvLike) {
  // params: { name, schedule (cron), script } - Cloudflare uses "schedules" endpoints
  const { name, schedule, script, enabled = true } = params || {};
  if (!name || !schedule || !script) throw new Error('Missing required fields: name, schedule, script');

  // POST /accounts/:account_id/workers/schedules
  const body = { name, schedule, script, enabled };
  const result: any = await cfFetch('/workers/schedules', env, { method: 'POST', body: JSON.stringify(body) });
  return { success: true, trigger: result.result };
}

export async function deleteCronTrigger(params: any, env: EnvLike) {
  const { id } = params || {};
  if (!id) throw new Error('Missing trigger id');
  await cfFetch(`/workers/schedules/${id}`, env, { method: 'DELETE' });
  return { success: true, id };
}

export async function listCronTriggers(params: any, env: EnvLike) {
  // optional filter by script
  const result: any = await cfFetch('/workers/schedules', env, { method: 'GET' });
  let triggers = result.result || [];
  if (params?.script) {
    triggers = triggers.filter((t: any) => t.script === params.script);
  }
  return { success: true, triggers };
}

export async function createRoute(params: any, env: EnvLike) {
  // For account-level routes: POST /accounts/:account_id/workers/routes
  const { pattern, script } = params || {};
  if (!pattern || !script) throw new Error('Missing pattern or script');
  const body = { pattern, script }; // zone is not provided: account-level
  const result: any = await cfFetch('/workers/routes', env, { method: 'POST', body: JSON.stringify(body) });
  return { success: true, route: result.result };
}

export async function deleteRoute(params: any, env: EnvLike) {
  const { id } = params || {};
  if (!id) throw new Error('Missing route id');
  await cfFetch(`/workers/routes/${id}`, env, { method: 'DELETE' });
  return { success: true, id };
}

export async function listRoutes(params: any, env: EnvLike) {
  const result: any = await cfFetch('/workers/routes', env, { method: 'GET' });
  return { success: true, routes: result.result };
}

// Simple KV flag management but scoped to CONFIG_KV binding for safety
export async function setKVFlag(params: any, env: EnvLike) {
  const { key, value } = params || {};
  if (!key) throw new Error('Missing key');
  await env.CONFIG_KV.put(key, String(value));
  return { success: true, key, value: String(value) };
}

export async function getKVFlag(params: any, env: EnvLike) {
  const { key } = params || {};
  if (!key) throw new Error('Missing key');
  const value = await env.CONFIG_KV.get(key);
  return { success: true, key, value };
}

export async function deployWorker(params: any, env: EnvLike) {
  // This is a safe stub - performing direct deployments requires uploading scripts
  // and may be dangerous. Support dryRun=true to validate parameters only.
  const { script_name, dryRun = true } = params || {};
  if (!script_name) throw new Error('Missing script_name');
  if (dryRun) return { success: true, message: 'Dry run OK', script_name };

  // If real deploy requested, require explicit confirmation flag
  if (!params.confirm || params.confirm !== true) {
    throw new Error('Deploy requires { confirm: true } to proceed');
  }

  // Not implementing full upload here; return not implemented message
  return { success: false, message: 'Full deploy not implemented in MCP handler - please use CI/CD or wrangler for actual uploads' };
}

export async function createWorkerFromCode(params: any, env: EnvLike) {
  const { script_name, script_code, dryRun = true, confirm = false } = params || {};
  if (!script_name || !script_code) throw new Error('Missing script_name or script_code');

  if (dryRun) {
    return { success: true, message: 'Dry run OK', script_name };
  }

  if (!confirm) {
    throw new Error('Deployment requires { confirm: true } to proceed');
  }

  // Cloudflare API endpoint for uploading a worker script
  const path = `/workers/scripts/${script_name}`;
  
  // The body needs to be a FormData object for multipart upload
  const formData = new FormData();
  formData.append('script', new Blob([script_code], { type: 'application/javascript+module' }), 'worker.js');
  
  // Metadata part (optional, but good practice)
  const metadata = {
    main_module: 'worker.js'
  };
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

  // Use a custom fetch call that doesn't set Content-Type to JSON
  ensureAuth(env);
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${path}`;
  const headers = {
    'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`
  };

  const response = await fetch(url, {
    method: 'PUT',
    body: formData,
    headers
  });

  const result: any = await response.json();

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${result.errors[0]?.message || 'Unknown error'}`);
  }

  return { success: true, message: `Worker ${script_name} deployed successfully.`, result };
}

export default {
  createCronTrigger,
  deleteCronTrigger,
  listCronTriggers,
  createRoute,
  deleteRoute,
  listRoutes,
  setKVFlag,
  getKVFlag,
  deployWorker,
  createWorkerFromCode
};
