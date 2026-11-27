export const tokens = {
  has: () => !!localStorage.getItem('at') || !!localStorage.getItem('rt'),
  set: (d) => {
    localStorage.setItem('at', d.accessToken);
    localStorage.setItem('rt', d.refreshToken);
  },
  clear: () => {
    localStorage.removeItem('at');
    localStorage.removeItem('rt');
  },
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function refresh() {
  try {
    const res = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: localStorage.getItem('rt') }),
    });
    const json = await res.json();
    if (!json.success) return false;
    tokens.set(json.data);
    return true;
  } catch {
    return false;
  }
}

export async function api(path, { method = 'GET', body } = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json' };
  const at = localStorage.getItem('at');
  if (at) headers.Authorization = `Bearer ${at}`;

  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });

  const isLogin = path === '/auth/login' || path === '/auth/register';
  if (res.status === 401 && retry && !isLogin && localStorage.getItem('rt')) {
    if (await refresh()) return api(path, { method, body }, false);
    tokens.clear();
    window.dispatchEvent(new Event('auth-lost'));
  }

  if (res.status === 204) return { success: true };
  const json = await res.json().catch(() => null);
  if (!json || !json.success) {
    const details = (json?.error?.details || [])
      .map((d) => (d.field ? `${d.field}: ` : '') + d.message)
      .join('; ');
    throw new ApiError((json?.error?.message || 'Ошибка сервера') + (details ? ` (${details})` : ''), res.status);
  }
  return json;
}