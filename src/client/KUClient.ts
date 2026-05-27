import { load } from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

const KULMS_ENTRY = "https://lms.gakusei.kyoto-u.ac.jp/sakai-login-tool/container";
const KULMS_HOST = "lms.gakusei.kyoto-u.ac.jp";
const MAX_ITER = 20;

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
    const value = $el.attr("value") ?? "";
    if (name !== undefined && name.length > 0) {
      fields[name] = value;
    }
  });
  return fields;
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
    let { url, html } = await this.getFollowingRedirects(KULMS_ENTRY);

    let loginSubmitted = false;
    let otpSubmitted = false;

    for (let i = 0; i < MAX_ITER; i++) {
      if (new URL(url).hostname === KULMS_HOST) return;

      const $ = load(html);

      // Login form: action contains login.cgi + sessid field
      const loginForm = $("form")
        .filter((_i, el) => {
          const action = $(el).attr("action") ?? "";
          return (
            action.includes("login.cgi") &&
            $(el).find('input[name="sessid"]').length > 0
          );
        })
        .first();

      if (loginForm.length > 0) {
        if (loginSubmitted) {
          throw new Error(
            "Authentication failed: incorrect username or password",
          );
        }
        const action = new URL(
          loginForm.attr("action") ?? "",
          url,
        ).href;
        const fields = extractFormFields($, loginForm);
        fields["username"] = username;
        fields["password"] = password;
        ({ url, html } = await this.submitForm(action, fields));
        loginSubmitted = true;
        continue;
      }

      // AuthSelect form
      const authselectForm = $("form")
        .filter((_i, el) => {
          const action = $(el).attr("action") ?? "";
          return action.includes("authselect");
        })
        .first();

      if (authselectForm.length > 0) {
        const action = new URL(
          authselectForm.attr("action") ?? "",
          url,
        ).href;
        const fields = extractFormFields($, authselectForm);
        ({ url, html } = await this.submitForm(action, fields));
        continue;
      }

      // OTP form: action contains otplogin.cgi + sessid field
      const otpForm = $("form")
        .filter((_i, el) => {
          const action = $(el).attr("action") ?? "";
          return (
            action.includes("otplogin.cgi") &&
            $(el).find('input[name="sessid"]').length > 0
          );
        })
        .first();

      if (otpForm.length > 0) {
        if (otpSubmitted) {
          throw new Error("Authentication failed: incorrect TOTP");
        }
        const action = new URL(otpForm.attr("action") ?? "", url).href;
        const fields = extractFormFields($, otpForm);
        fields["username"] = username;
        fields["password"] = await generateTOTP(totp);
        ({ url, html } = await this.submitForm(action, fields));
        otpSubmitted = true;
        continue;
      }

      // SAML auto-submit form
      const samlForm = $("form")
        .filter((_i, el) => {
          return $(el).find('input[name="SAMLResponse"]').length > 0;
        })
        .first();

      if (samlForm.length > 0) {
        const action = new URL(samlForm.attr("action") ?? "", url).href;
        const fields = extractFormFields($, samlForm);
        ({ url, html } = await this.submitForm(action, fields));
        continue;
      }

      if (new URL(url).hostname === KULMS_HOST) return;

      throw new Error(`Login failed: unexpected state at ${url}`);
    }

    throw new Error("Login flow exceeded maximum iterations");
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
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

  private async internalFetch(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init?.headers);
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
