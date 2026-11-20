/* Shared logic: card payload compatible with the desktop program (v3: name + stage + HMAC mark). */
(function (root) {
  'use strict';
  const ALL = 'الكل', PREFIX = 'QRA3';

  function normName(s) {
    s = String(s == null ? '' : s).replace(/[ً-ْـ]/g, '');
    s = s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    return s.replace(/\s+/g, ' ').trim();
  }

  const keyCache = new Map();
  async function hmacKey(secret) {
    if (!keyCache.has(secret)) {
      keyCache.set(secret, await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
    }
    return keyCache.get(secret);
  }
  async function sig(name, stage, secret) {
    const buf = await crypto.subtle.sign('HMAC', await hmacKey(secret),
      new TextEncoder().encode('v3|' + normName(name) + '|' + normName(stage)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
  }
  async function makePayload(name, stage, secret) {
    return `${PREFIX}|${String(name).trim()}|${String(stage || '').trim()}|${await sig(name, stage || '', secret)}`;
  }
  async function parsePayload(text, secret) {
    text = String(text || '').trim();
    if (/^QRA[12]:/.test(text)) return { status: 'old' };
    const p = text.split('|');
    if (p.length !== 4 || p[0] !== PREFIX) return { status: 'bad' };
    const ok = (await sig(p[1], p[2], secret)) === p[3].toUpperCase();
    return { status: ok ? 'ok' : 'bad', name: p[1], stage: p[2] };
  }
  function randomSecret() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const api = { ALL, PREFIX, normName, sig, makePayload, parsePayload, randomSecret };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CORE = api;
})(typeof window !== 'undefined' ? window : globalThis);
