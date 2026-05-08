
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { isPrivateHost } from './htmlParser';

/**
 * Manages a single Playwright browser instance shared across the extension session.
 *
 * - Lazy-initialises on first use.
 * - Auto-closes after IDLE_TIMEOUT_MS of inactivity to free memory.
 * - Provides a consistent BrowserContext (cookies/localStorage preserved).
 * - Prevents navigation to private/internal network addresses (SSRF protection).
 */
export class BrowserManager {
  private static _browser: Browser | null = null;
  private static _context: BrowserContext | null = null;
  private static _page: Page | null = null;
  private static _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private static _lastActivity = 0;

  /** How long (ms) the browser stays open after the last action. */
  private static readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  /** Max time to wait for page to load (navigate / waitForSelector). */
  private static readonly NAVIGATION_TIMEOUT_MS = 30_000;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Get (or create) the shared Page instance.
   * Call this before every browser action.
   */
  static async getPage(): Promise<Page> {
    this._touchActivity();
    if (this._page && !this._page.isClosed()) {
      return this._page;
    }
    // Browser or context may have been closed; re-create from scratch
    this._page = await this._createPage();
    return this._page;
  }

  /** Close the browser instance and release resources. */
  static async close(): Promise<void> {
    this._clearIdleTimer();
    try {
      if (this._page && !this._page.isClosed()) {
        await this._page.close().catch(() => {});
      }
    } finally {
      this._page = null;
      try {
        if (this._context) {
          await this._context.close().catch(() => {});
        }
      } finally {
        this._context = null;
        try {
          if (this._browser) {
            await this._browser.close().catch(() => {});
          }
        } finally {
          this._browser = null;
        }
      }
    }
  }

  /** Force-close the browser (used on extension deactivate). */
  static async forceClose(): Promise<void> {
    this._clearIdleTimer();
    const b = this._browser;
    this._browser = null;
    this._context = null;
    this._page = null;
    if (b?.isConnected()) {
      try { await b.close(); } catch { /* ignore */ }
    }
  }

  // ─── Navigation helpers ───────────────────────────────────────────────────

  /** Navigate to a URL with SSRF protection. Returns true on success. */
  static async navigate(url: string): Promise<boolean> {
    const parsed = new URL(url);
    if (isPrivateHost(parsed.hostname)) {
      throw new Error(`Access to internal/private address "${parsed.hostname}" is blocked.`);
    }
    const page = await this.getPage();
    try {
      await page.goto(url, {
        waitUntil: 'load',
        timeout: this.NAVIGATION_TIMEOUT_MS,
      });
    } catch {
      // Fallback: if page keeps loading scripts, try domcontentloaded
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.NAVIGATION_TIMEOUT_MS,
      });
    }
    return true;
  }

  /** Take a screenshot (returns base64 data URI). */
  static async screenshot(): Promise<string> {
    const page = await this.getPage();
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    return `data:image/png;base64,${buf.toString('base64')}`;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private static async _createPage(): Promise<Page> {
    if (!this._browser || !this._browser.isConnected()) {
      this._browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      this._context = await this._browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
      });
    } else if (!this._context) {
      this._context = await this._browser.newContext();
    }

    const page = await this._context.newPage();
    page.setDefaultTimeout(this.NAVIGATION_TIMEOUT_MS);

    // Reset idle timer when page closes
    page.on('close', () => {
      if (this._page === page) {
        this._page = null;
      }
      this._scheduleIdleClose();
    });

    return page;
  }

  private static _touchActivity(): void {
    this._lastActivity = Date.now();
    this._clearIdleTimer();
  }

  private static _scheduleIdleClose(): void {
    this._clearIdleTimer();
    this._idleTimer = setTimeout(() => {
      const elapsed = Date.now() - this._lastActivity;
      if (elapsed >= this.IDLE_TIMEOUT_MS) {
        this.forceClose();
      }
    }, this.IDLE_TIMEOUT_MS);
  }

  private static _clearIdleTimer(): void {
    if (this._idleTimer !== null) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }
}
