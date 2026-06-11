/**
 * GrammarLens — Google OAuth Service
 *
 * Manages authentication tokens via chrome.identity.getAuthToken.
 * Handles token caching, silent refresh, and account info retrieval.
 * Runs in the background service worker context.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountInfo {
  email:   string;
  name:    string;
  picture: string;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  token:           string | null;
  account:         AccountInfo | null;
  error:           string | null;
}

// ─── GoogleAuth ───────────────────────────────────────────────────────────────

export class GoogleAuth {
  private cachedToken:   string | null  = null;
  private cachedAccount: AccountInfo | null = null;

  // ── Public ─────────────────────────────────────────────────────────────────

  /**
   * Return a valid access token.
   * @param interactive  If true, shows the OAuth consent screen when needed.
   *                     If false, returns null silently when not signed in.
   */
  async getAuthToken(interactive: boolean): Promise<string | null> {
    if (this.cachedToken) return this.cachedToken;

    try {
      const token = await this.chromeGetAuthToken(interactive);
      this.cachedToken = token;
      return token;
    } catch (err) {
      if (!interactive) return null;
      throw err;
    }
  }

  /**
   * Force-refresh the cached token (e.g. after a 401 response).
   */
  async refreshToken(): Promise<string | null> {
    if (this.cachedToken) {
      await this.chromeRemoveCachedToken(this.cachedToken);
      this.cachedToken = null;
    }
    return this.getAuthToken(false);
  }

  /**
   * Sign the user out by revoking and clearing the cached token.
   */
  async signOut(): Promise<void> {
    if (this.cachedToken) {
      await this.chromeRemoveCachedToken(this.cachedToken);
      this.cachedToken   = null;
      this.cachedAccount = null;
    }
  }

  /**
   * Return a snapshot of the current auth state.
   * Does NOT prompt the user — uses cached data only.
   */
  async getStatus(): Promise<AuthStatus> {
    const token = await this.getAuthToken(false);
    if (!token) {
      return { isAuthenticated: false, token: null, account: null, error: null };
    }

    try {
      const account = this.cachedAccount ?? await this.fetchAccountInfo(token);
      this.cachedAccount = account;
      return { isAuthenticated: true, token, account, error: null };
    } catch (err) {
      return {
        isAuthenticated: true,
        token,
        account: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Fetch Google account info for the current token.
   * Uses the OAuth2 UserInfo endpoint — no extra scope beyond openid/email.
   */
  async getAccountInfo(token: string): Promise<AccountInfo> {
    if (this.cachedAccount) return this.cachedAccount;
    const info = await this.fetchAccountInfo(token);
    this.cachedAccount = info;
    return info;
  }

  /** True if a token is cached (does not validate it). */
  isAuthenticated(): boolean {
    return this.cachedToken !== null;
  }

  /** Invalidate all caches without revoking the token. */
  clearCache(): void {
    this.cachedToken   = null;
    this.cachedAccount = null;
  }

  // ── Private: chrome.identity wrappers ──────────────────────────────────────

  private chromeGetAuthToken(interactive: boolean): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message ?? 'getAuthToken failed'));
          return;
        }
        if (!token) {
          reject(new Error('No token returned by chrome.identity'));
          return;
        }
        resolve(token);
      });
    });
  }

  private chromeRemoveCachedToken(token: string): Promise<void> {
    return new Promise<void>((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, resolve);
    });
  }

  // ── Private: Account info ──────────────────────────────────────────────────

  private async fetchAccountInfo(token: string): Promise<AccountInfo> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v1/userinfo?alt=json',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new Error(`UserInfo request failed: HTTP ${response.status}`);
    }

    const data = await response.json() as {
      email?:   string;
      name?:    string;
      picture?: string;
    };

    return {
      email:   data.email   ?? '(unknown)',
      name:    data.name    ?? '(unknown)',
      picture: data.picture ?? '',
    };
  }
}

/** Shared singleton used by the background service worker. */
export const googleAuth = new GoogleAuth();
