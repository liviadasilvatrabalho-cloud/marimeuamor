export interface AuthProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | string;
  needs_pin_setup?: boolean;
}

export interface AuthSession {
  profile: AuthProfile;
  spaces: Array<{ id: string; name: string; slug: string; role_in_space?: string }>;
  expiresAt?: string;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error((body as any)?.error || `Falha na requisição (${res.status})`);
    (error as any).status = res.status;
    (error as any).body = body;
    throw error;
  }
  return body as T;
}

export const AuthService = {
  async profiles(): Promise<AuthProfile[]> {
    return request<AuthProfile[]>('/api/auth/profiles');
  },

  async login(profileId: string, pin: string, setupCode?: string): Promise<AuthSession> {
    return request<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId, pin, setup_code: setupCode }),
    });
  },

  async logout(): Promise<void> {
    await request('/api/auth/logout', { method: 'POST' });
  },

  async me(): Promise<AuthSession> {
    return request<AuthSession>('/api/auth/me');
  },

  async changePin(currentPin: string, newPin: string): Promise<void> {
    await request('/api/auth/change-pin', {
      method: 'POST',
      body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
    });
  },
};
