import { load } from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { Site, SiteListResponse } from "../types/site.js";
import type { AssignmentListResponse } from "../types/assignment.js";
import type { Announcement, AnnouncementListResponse } from "../types/announcement.js";
import type { CalendarEvent, CalendarListResponse } from "../types/calendar.js";
import type { CurrentSession } from "../types/session.js";
import { KULMS_API_BASE } from "./constants.js";
import { Course } from "./Course.js";
import { Assignment } from "./Assignment.js";

const KULMS_ENTRY = "https://lms.gakusei.kyoto-u.ac.jp/sakai-login-tool/container";
const KULMS_HOST = "lms.gakusei.kyoto-u.ac.jp";
const MAX_ITER = 20;
// The IdP serves UA-sensitive pages; present a mainstream browser UA.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

// Base32 decode (RFC 4648)
function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid Base32 character: ${ch}`);
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

async function generateTOTP(secret: string): Promise<string> {
  const keyBytes = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);

  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  view.setUint32(0, 0, false);
  view.setUint32(4, counter >>> 0, false);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await globalThis.crypto.subtle.sign("HMAC", cryptoKey, counterBuf),
  );

  const offset = (sig[19] ?? 0) & 0x0f;
  const code =
    (((sig[offset] ?? 0) & 0x7f) << 24) |
    (((sig[offset + 1] ?? 0) & 0xff) << 16) |
    (((sig[offset + 2] ?? 0) & 0xff) << 8) |
    ((sig[offset + 3] ?? 0) & 0xff);

  return (code % 1_000_000).toString().padStart(6, "0");
}

class CookieJar {
  private readonly cookies: Map<string, string> = new Map();

  update(headers: Headers): void {
    for (const setCookie of headers.getSetCookie()) {
      const part = setCookie.split(";")[0];
      if (part === undefined) continue;
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const name = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (name.length > 0) this.cookies.set(name, value);
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

function extractFormFields(
  $: CheerioAPI,
  form: Cheerio<AnyNode>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  form.find("input, select, textarea").each((_i, el) => {
    const $el = $(el);
    const name = $el.attr("name");
    if (name === undefined || name.length === 0) return;
    const type = ($el.attr("type") ?? "text").toLowerCase();
    // Browsers don't submit buttons (callers re-inject the relevant fields)
    // nor unchecked checkboxes/radios.
    if (type === "submit" || type === "button" || type === "image") return;
    if (type === "checkbox" || type === "radio") {
      if ($el.attr("checked") !== undefined) {
        fields[name] = $el.attr("value") ?? "on";
      }
      return;
    }
    fields[name] = $el.attr("value") ?? "";
  });
  return fields;
}

/** Last path segment of a form action, stripped of any query string. */
function actionBasename(action: string): string {
  const path = action.split("?")[0] ?? "";
  return path.split("/").pop() ?? "";
}

/**
 * The SimpleSAMLphp password (login.cgi) and OTP (otplogin.cgi) forms share
 * `id="login"` + a `sessid` field, so they must be told apart by the action
 * basename — a plain `includes("login.cgi")` would also match otplogin.cgi.
 */
function findFormByActionBasename(
  $: CheerioAPI,
  basename: string,
): Cheerio<AnyNode> | null {
  const form = $("form")
    .filter((_i, el) => actionBasename($(el).attr("action") ?? "") === basename)
    .first();
  return form.length > 0 ? form : null;
}

const META_REFRESH_RE = /url\s*=\s*['"]?([^'"\s]+)/i;

/** Target URL of a `<meta http-equiv="refresh" content="0;URL=...">` tag. */
function extractMetaRefreshUrl($: CheerioAPI, baseUrl: string): string | null {
  let target: string | null = null;
  $("meta").each((_i, el) => {
    if (target !== null) return;
    const equiv = ($(el).attr("http-equiv") ?? "").toLowerCase();
    if (equiv !== "refresh") return;
    const match = META_REFRESH_RE.exec($(el).attr("content") ?? "");
    if (match && match[1] !== undefined) {
      target = new URL(match[1].trim(), baseUrl).href;
    }
  });
  return target;
}

const JS_REDIRECT_RE = /(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i;

/**
 * Target of a `<body onload="window.location='...'">` JS redirect, used by the
 * 2FA method picker (authselect.php). Returns an absolute URL or null.
 */
function extractJsRedirectUrl(html: string, baseUrl: string): string | null {
  const match = JS_REDIRECT_RE.exec(html);
  if (match === null || match[1] === undefined) return null;
  return new URL(match[1], baseUrl).href;
}

export class KUClient {
  private readonly cookieJar: CookieJar;

  constructor() {
    this.cookieJar = new CookieJar();
  }

  async login(
    username: string,
    password: string,
    totp: string,
  ): Promise<void> {
    // Pass 1: authenticate at the IdP, establishing the _shibsession_* cookie.
    let { url, html } = await this.getFollowingRedirects(KULMS_ENTRY);
    ({ url, html } = await this.walkIdp(url, html, username, password, totp));

    if (new URL(url).hostname !== KULMS_HOST) {
      throw new Error(`Login failed: unexpected state at ${url}`);
    }

    // Pass 2: after SAML the SP hands control back to "/", not the Sakai
    // container, so Sakai itself never logged us in and the API stays
    // anonymous. Re-entering the container now that _shibsession_* exists lets
    // Apache supply REMOTE_USER so Sakai establishes the authenticated session.
    ({ url, html } = await this.getFollowingRedirects(KULMS_ENTRY));
    await this.walkIdp(url, html, username, password, totp);
  }

  /**
   * Walks the SimpleSAMLphp/SP interstitial pages — password form, 2FA method
   * picker, TOTP form, and the SAML auto-submit — until landing back on the SP
   * host. Returns the final page so the caller can inspect where it settled.
   */
  private async walkIdp(
    url: string,
    html: string,
    username: string,
    password: string,
    totp: string,
  ): Promise<{ url: string; html: string }> {
    for (let i = 0; i < MAX_ITER; i++) {
      // SimpleSAMLphp bounces between steps with a <meta refresh>, not a
      // 3xx, so each interstitial page must be resolved before inspection.
      ({ url, html } = await this.followMetaRefresh(url, html));

      const host = new URL(url).hostname;
      const $ = load(html);

      // Password form (action basename login.cgi + sessid field).
      const loginForm = findFormByActionBasename($, "login.cgi");
      if (loginForm !== null && loginForm.find('input[name="sessid"]').length > 0) {
        const action = new URL(loginForm.attr("action") ?? "", url).href;
        const fields = extractFormFields($, loginForm);
        fields["username"] = username;
        fields["password"] = password;
        ({ url, html } = await this.submitForm(action, fields));
        ({ url, html } = await this.followMetaRefresh(url, html));
        if (findFormByActionBasename(load(html), "login.cgi") !== null) {
          throw new Error(
            "Authentication failed: incorrect username or password",
          );
        }
        continue;
      }

      // TOTP form (action basename otplogin.cgi); password field carries OTP.
      const otpForm = findFormByActionBasename($, "otplogin.cgi");
      if (otpForm !== null && otpForm.find('input[name="sessid"]').length > 0) {
        const action = new URL(otpForm.attr("action") ?? "", url).href;
        const fields = extractFormFields($, otpForm);
        fields["username"] = username;
        fields["password"] = await generateTOTP(totp);
        ({ url, html } = await this.submitForm(action, fields));
        ({ url, html } = await this.followMetaRefresh(url, html));
        if (findFormByActionBasename(load(html), "otplogin.cgi") !== null) {
          throw new Error("Authentication failed: incorrect TOTP");
        }
        continue;
      }

      // SAML auto-submit form back to the SP.
      const samlForm = $("form")
        .filter((_i, el) => $(el).find('input[name="SAMLResponse"]').length > 0)
        .first();
      if (samlForm.length > 0) {
        const action = new URL(samlForm.attr("action") ?? "", url).href;
        const fields = extractFormFields($, samlForm);
        ({ url, html } = await this.submitForm(action, fields));
        continue;
      }

      // 2FA method picker (authselect.php): a bodyless JS redirect
      // (<body onload="window.location='…u2flogin.cgi?…'">) that defaults to
      // whichever method the account prefers. We authenticate via TOTP, so
      // force the otplogin.cgi variant. Only honoured on the IdP host — the SP
      // portal carries inline JS that would otherwise false-match.
      if (host !== KULMS_HOST) {
        const jsRedirect = extractJsRedirectUrl(html, url);
        if (jsRedirect !== null) {
          const target = jsRedirect.replace(
            /\/(?:u2flogin|motplogin)\.cgi/,
            "/otplogin.cgi",
          );
          ({ url, html } = await this.getFollowingRedirects(target));
          continue;
        }
      }

      break;
    }

    return { url, html };
  }

  private async followMetaRefresh(
    url: string,
    html: string,
  ): Promise<{ url: string; html: string }> {
    for (let i = 0; i < MAX_ITER; i++) {
      const target = extractMetaRefreshUrl(load(html), url);
      if (target === null) return { url, html };
      ({ url, html } = await this.getFollowingRedirects(target));
    }
    return { url, html };
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
    const cookieStr = this.cookieJar.header();
    if (cookieStr.length > 0) headers.set("Cookie", cookieStr);

    const response = await globalThis.fetch(url, {
      ...init,
      headers,
      redirect: "follow",
    });
    this.cookieJar.update(response.headers);
    return response;
  }

  async getJSON<T>(path: string): Promise<T> {
    const res = await this.fetch(`${KULMS_API_BASE}${path}`);
    if (!res.ok) {
      throw new Error(
        `KULMS request failed: ${res.status} ${res.statusText} (${path})`,
      );
    }
    return (await res.json()) as T;
  }

  /** All sites the user belongs to, including non-course sites (raw data). */
  async sites(): Promise<Site[]> {
    const data = await this.getJSON<SiteListResponse>("/site.json");
    return data.site_collection;
  }

  async courses(): Promise<Course[]> {
    const sites = await this.sites();
    return sites
      .filter((site) => site.type === "course")
      .map((site) => new Course(this, site));
  }

  /** Assignments across all sites (GET /direct/assignment/my.json). */
  async myAssignments(): Promise<Assignment[]> {
    const data = await this.getJSON<AssignmentListResponse>(
      "/assignment/my.json",
    );
    return data.assignment_collection.map((a) => new Assignment(this, a));
  }

  /** Announcements visible to the user (GET /direct/announcement/user.json). */
  async myAnnouncements(): Promise<Announcement[]> {
    const data = await this.getJSON<AnnouncementListResponse>(
      "/announcement/user.json",
    );
    return data.announcement_collection;
  }

  /** Calendar events across all sites (GET /direct/calendar/my.json). */
  async myCalendar(): Promise<CalendarEvent[]> {
    const data = await this.getJSON<CalendarListResponse>("/calendar/my.json");
    return data.calendar_collection;
  }

  /** Current session; authenticated when `userEid` is populated. */
  async session(): Promise<CurrentSession> {
    return this.getJSON<CurrentSession>("/session/current.json");
  }

  private async internalFetch(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
    const cookieStr = this.cookieJar.header();
    if (cookieStr.length > 0) headers.set("Cookie", cookieStr);
    return globalThis.fetch(url, { ...init, headers, redirect: "manual" });
  }

  private async getFollowingRedirects(
    startUrl: string,
  ): Promise<{ url: string; html: string }> {
    let url = startUrl;
    for (let i = 0; i < MAX_ITER; i++) {
      const response = await this.internalFetch(url);
      this.cookieJar.update(response.headers);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location === null)
          throw new Error("Redirect with no Location header");
        url = new URL(location, url).href;
        continue;
      }
      return { url, html: await response.text() };
    }
    throw new Error("Exceeded redirect limit");
  }

  private async submitForm(
    action: string,
    fields: Record<string, string>,
  ): Promise<{ url: string; html: string }> {
    const body = new URLSearchParams(fields).toString();
    let url = action;
    let isPost = true;

    for (let i = 0; i < MAX_ITER; i++) {
      const init: RequestInit = isPost
        ? {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          }
        : { method: "GET" };

      const response = await this.internalFetch(url, init);
      this.cookieJar.update(response.headers);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location === null)
          throw new Error("Redirect with no Location header");
        url = new URL(location, url).href;
        isPost = false;
        continue;
      }

      return { url, html: await response.text() };
    }

    throw new Error("submitForm: exceeded redirect limit");
  }
}