'use strict';

const translationCache = new Map();
const CACHE_LIMIT = 1200;

function cacheGet(key) {
  const value = translationCache.get(key);
  if (value === undefined) return undefined;
  translationCache.delete(key);
  translationCache.set(key, value);
  return value;
}

function cacheSet(key, value) {
  translationCache.set(key, value);
  while (translationCache.size > CACHE_LIMIT) {
    translationCache.delete(translationCache.keys().next().value);
  }
}

function timeoutFetch(url, options = {}, ms = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal, cache: 'no-store' })
    .finally(() => clearTimeout(timer));
}

function extractTranslation(data) {
  // dj=1 response: { sentences: [{ trans: "..." }] }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const sentences = Array.isArray(data.sentences) ? data.sentences : [];
    const text = sentences.map((s) => s?.trans || '').join('').trim();
    if (text) return text;
  }

  // Classic response: [[["Привет","Hello",...]], ...]
  if (Array.isArray(data)) {
    if (Array.isArray(data[0])) {
      const pieces = data[0].map((piece) => {
        if (Array.isArray(piece)) return typeof piece[0] === 'string' ? piece[0] : '';
        if (typeof piece === 'string') return piece;
        return '';
      }).join('').trim();
      if (pieces) return pieces;
    }

    // clients5 can occasionally wrap the classic payload one level deeper.
    try {
      const nested = data?.[0]?.[0]?.[0];
      if (typeof nested === 'string') return nested.trim();
      if (Array.isArray(nested)) return nested.filter((x) => typeof x === 'string').join('').trim();
    } catch {}
  }
  return '';
}

async function requestJson(url, options, providerName) {
  const response = await timeoutFetch(url, options, 3800);
  if (response.status === 429) {
    const e = new Error(`${providerName} is temporarily rate-limited.`);
    e.code = 'RATE_LIMIT';
    throw e;
  }
  if (!response.ok) throw new Error(`${providerName} returned HTTP ${response.status}.`);
  const data = await response.json();
  const text = extractTranslation(data);
  if (!text) throw new Error(`${providerName} returned no translated text.`);
  return text;
}

async function googleGtxDj(text, sourceLanguage, targetLanguage) {
  const params = new URLSearchParams({
    client: 'gtx', sl: sourceLanguage || 'auto', tl: targetLanguage,
    dt: 't', dj: '1', q: text
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
  const translated = await requestJson(url, { method: 'GET' }, 'Google Translate');
  return { text: translated, engine: 'Google Translate' };
}

async function googleGtxClassic(text, sourceLanguage, targetLanguage) {
  const params = new URLSearchParams({
    client: 'gtx', sl: sourceLanguage || 'auto', tl: targetLanguage,
    dt: 't', q: text
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
  const translated = await requestJson(url, { method: 'GET' }, 'Google Translate fallback');
  return { text: translated, engine: 'Google Translate fallback' };
}

async function googleChromeDictionary(text, sourceLanguage, targetLanguage) {
  const params = new URLSearchParams({
    client: 'dict-chrome-ex', sl: sourceLanguage || 'auto', tl: targetLanguage, q: text
  });
  const url = `https://clients5.google.com/translate_a/t?${params.toString()}`;
  const translated = await requestJson(url, { method: 'GET' }, 'Google Chrome translation fallback');
  return { text: translated, engine: 'Google Chrome fallback' };
}

async function tryBuiltInTranslator(text, sourceLanguage, targetLanguage) {
  try {
    if (typeof Translator === 'undefined' || sourceLanguage === 'auto') return null;
    const options = { sourceLanguage, targetLanguage };
    if (typeof Translator.availability === 'function') {
      const availability = await Promise.race([
        Translator.availability(options),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 450))
      ]);
      if (!['available', 'readily'].includes(String(availability))) return null;
    }
    const translator = await Promise.race([
      Translator.create(options),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Built-in translator timed out.')), 900))
    ]);
    const translated = await Promise.race([
      translator.translate(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Built-in translation timed out.')), 1800))
    ]);
    if (!translated) return null;
    return { text: String(translated).trim(), engine: 'Chrome on-device' };
  } catch {
    return null;
  }
}

async function translateText(text, sourceLanguage, targetLanguage) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!cleaned) return { text: '', engine: 'none' };
  if (!targetLanguage) throw new Error('No target language selected.');
  if (sourceLanguage && sourceLanguage !== 'auto' && sourceLanguage === targetLanguage) {
    return { text: cleaned, engine: 'same-language' };
  }

  const source = sourceLanguage || 'auto';
  const key = `${source}>${targetLanguage}:${cleaned}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  const builtIn = await tryBuiltInTranslator(cleaned, source, targetLanguage);
  if (builtIn) {
    cacheSet(key, builtIn);
    return builtIn;
  }

  const providers = [googleGtxDj, googleGtxClassic, googleChromeDictionary];
  const errors = [];
  for (const provider of providers) {
    try {
      const result = await provider(cleaned, source, targetLanguage);
      cacheSet(key, result);
      return result;
    } catch (error) {
      errors.push(error?.message || String(error));
      if (error?.code === 'RATE_LIMIT') continue;
    }
  }

  const error = new Error(errors.filter(Boolean).join(' | ') || 'All translation providers failed.');
  error.code = errors.some((e) => /rate-limit/i.test(e)) ? 'RATE_LIMIT' : 'TRANSLATE_FAILED';
  throw error;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'DUALTUBE_TRANSLATE') return;
  translateText(message.text, message.sourceLanguage, message.targetLanguage)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({
      ok: false,
      code: error?.code || 'TRANSLATE_FAILED',
      error: error?.message || 'Translation failed.'
    }));
  return true;
});
