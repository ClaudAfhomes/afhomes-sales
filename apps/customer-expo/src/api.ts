import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://afhomes-sales-api-afhomes.vercel.app';

export class ApiError extends Error {}

export class ApiClient {
  private accessToken: string | null = null;

  async restore() {
    this.accessToken = await SecureStore.getItemAsync('customer_access_token');
    return this.accessToken !== null;
  }

  async register(email: string, displayName: string, password: string) {
    return this.request('/api/v1/auth/register', { method: 'POST', body: { email, display_name: displayName, password, device_name: 'AFhomes Expo Customer' }, authenticated: false });
  }

  async verify(email: string, code: string) {
    const data = await this.request('/api/v1/auth/verify-email', { method: 'POST', body: { email, code, device_name: 'AFhomes Expo Customer' }, authenticated: false });
    await this.saveTokens(data);
  }

  async login(email: string, password: string) {
    const data = await this.request('/api/v1/auth/login', { method: 'POST', body: { email, password }, authenticated: false });
    await this.saveTokens(data);
  }

  async logout() {
    const refreshToken = await SecureStore.getItemAsync('customer_refresh_token');
    if (refreshToken) await this.request('/api/v1/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, authenticated: false }).catch(() => undefined);
    await Promise.all([SecureStore.deleteItemAsync('customer_access_token'), SecureStore.deleteItemAsync('customer_refresh_token')]);
    this.accessToken = null;
  }

  async request(path: string, options: { method?: string; body?: Record<string, unknown>; authenticated?: boolean } = {}) {
    const { method = 'GET', body, authenticated = true } = options;
    let response = await this.send(path, method, body, authenticated ? this.accessToken : null);
    if (response.status === 401 && authenticated && await this.refresh()) response = await this.send(path, method, body, this.accessToken);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(payload.message ?? 'Request failed');
    return payload;
  }

  private send(path: string, method: string, body: Record<string, unknown> | undefined, token: string | null) {
    return fetch(`${API_URL}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  }

  private async refresh() {
    const refreshToken = await SecureStore.getItemAsync('customer_refresh_token');
    if (!refreshToken) return false;
    const response = await this.send('/api/v1/auth/refresh', 'POST', { refresh_token: refreshToken, device_name: 'AFhomes Expo Customer' }, null);
    if (!response.ok) return false;
    await this.saveTokens(await response.json());
    return true;
  }

  private async saveTokens(data: Record<string, string>) {
    this.accessToken = data.access_token;
    await Promise.all([SecureStore.setItemAsync('customer_access_token', data.access_token), SecureStore.setItemAsync('customer_refresh_token', data.refresh_token)]);
  }
}
