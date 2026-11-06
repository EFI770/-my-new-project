// All server access goes through this module. It is the ONLY place that knows
// the transport. When the auth/backend vendor is chosen, this module is
// reimplemented over the vendor client; no screen changes.
async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `http_${res.status}`);
    err.status = res.status;
    err.code = data?.error || 'error';
    throw err;
  }
  return data;
}

export const api = {
  register: (b) => call('POST', '/api/auth/register', b),
  login: (b) => call('POST', '/api/auth/login', b),
  logout: () => call('POST', '/api/auth/logout'),
  me: () => call('GET', '/api/me'),
  deleteAccount: () => call('DELETE', '/api/me'),
  updateProfile: (b) => call('PUT', '/api/me/profile', b),
  updateContactMethods: (methods) => call('PUT', '/api/me/contact-methods', { methods }),
  candidates: () => call('GET', '/api/candidates'),
  setInterest: (candidateId, interested) => call('POST', '/api/interests', { candidateId, interested }),
  matches: () => call('GET', '/api/matches'),
  studyRequests: () => call('GET', '/api/study-requests'),
  createStudyRequest: (b) => call('POST', '/api/study-requests', b),
  updateStudyRequest: (id, b) => call('PUT', `/api/study-requests/${id}`, b),
  deleteStudyRequest: (id) => call('DELETE', `/api/study-requests/${id}`),
  connections: () => call('GET', '/api/connections'),
  createConnection: (b) => call('POST', '/api/connections', b),
  respond: (id, decision) => call('POST', `/api/connections/${id}/respond`, { decision }),
  consent: (id, consent) => call('POST', `/api/connections/${id}/consent`, { consent }),
  contact: (id) => call('GET', `/api/connections/${id}/contact`),
  blocks: () => call('GET', '/api/blocks'),
  block: (blockedId) => call('POST', '/api/blocks', { blockedId }),
  unblock: (blockedId) => call('DELETE', `/api/blocks/${blockedId}`),
  report: (b) => call('POST', '/api/reports', b),
};

export const ERROR_HE = {
  invalid_email: 'אימייל לא תקין',
  password_too_short: 'הסיסמה קצרה מדי (לפחות 8 תווים)',
  invalid_display_name: 'יש להזין שם תצוגה',
  email_taken: 'משתמש עם אימייל זה כבר קיים',
  invalid_credentials: 'אימייל או סיסמה שגויים',
  authentication_required: 'יש להתחבר כדי להמשיך',
  not_permitted: 'הפעולה לא אפשרית',
  conflict: 'כבר קיימת בקשה פעילה מול משתמש זה',
  invalid_input: 'קלט לא תקין',
  internal_error: 'שגיאה בשרת, נסו שוב',
};
export function heError(err) {
  return ERROR_HE[err?.code] || 'משהו השתבש, נסו שוב';
}
