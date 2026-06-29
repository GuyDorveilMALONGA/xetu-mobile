import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PREFERENCES_TOKEN } from './preferences.token';
import { PreferencesPlugin } from '@capacitor/preferences';
import { environment } from '../../../environments/environment';
import { SessionResponse } from '../models/models';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private sessionId: string | null = null;
  private token: string | null = null;
  private sessionPromise: Promise<{ sessionId: string; token: string }> | null = null;

  constructor(
    private http: HttpClient,
    @Inject(PREFERENCES_TOKEN) private preferences: PreferencesPlugin
  ) {}

  /**
   * Generates a unique anonymous session ID prefixing 'web_'
   */
  private generateUUID(): string {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return 'web_' + s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
  }

  /**
   * Restores or creates a new session. Uses an in-flight promise guard to prevent duplicate calls.
   */
  async ensureSession(): Promise<{ sessionId: string; token: string }> {
    if (this.sessionId && this.token) {
      return { sessionId: this.sessionId, token: this.token };
    }

    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    this.sessionPromise = (async () => {
      try {
        const { value: storedId } = await this.preferences.get({ key: 'xetu_session_id' });
        const { value: storedToken } = await this.preferences.get({ key: 'xetu_session_token' });

        if (storedId && storedToken) {
          this.sessionId = storedId;
          this.token = storedToken;
          return { sessionId: this.sessionId, token: this.token };
        }

        // If not found, request a new session from the backend
        const res = await firstValueFrom(
          this.http.post<SessionResponse>(`${environment.apiBase}/api/session`, {})
        );

        this.sessionId = res.session_id;
        this.token = res.token;

        await this.preferences.set({ key: 'xetu_session_id', value: this.sessionId });
        await this.preferences.set({ key: 'xetu_session_token', value: this.token });

        return { sessionId: this.sessionId, token: this.token };
      } catch (error) {
        console.error('Failed to ensure session, generating local fallback:', error);
        // Fallback to local generation if backend is unreachable
        if (!this.sessionId) {
          this.sessionId = this.generateUUID();
          await this.preferences.set({ key: 'xetu_session_id', value: this.sessionId });
        }
        return { sessionId: this.sessionId, token: this.token || '' };
      }
    })();

    try {
      return await this.sessionPromise;
    } finally {
      this.sessionPromise = null;
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getToken(): string | null {
    return this.token;
  }

  getAuthHeaders(): { Authorization: string } {
    return { Authorization: `Bearer ${this.token || ''}` };
  }

  /**
   * Resets the current session, generates a new anonymous session ID, and clears the token.
   */
  async resetSession(): Promise<string> {
    this.sessionId = this.generateUUID();
    this.token = null;
    this.sessionPromise = null;

    await this.preferences.set({ key: 'xetu_session_id', value: this.sessionId });
    await this.preferences.remove({ key: 'xetu_session_token' });

    return this.sessionId;
  }
}
