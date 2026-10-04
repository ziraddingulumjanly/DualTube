(() => {
  'use strict';

  if (window.__dualTubeV050Loaded) return;
  window.__dualTubeV050Loaded = true;

  const DEFAULTS = {
    enabled: true,
    sourceLanguage: 'auto',
    targetLanguage: 'ru',
    display: 'both',
    order: 'original-first',
    fontSize: 30,
    backgroundOpacity: 0.62,
    position: 'middle',
    selectable: false,
    captionFlow: 'phrase',
    uiTheme: 'rounded-modern'
  };

  const FIXED_SETTINGS = {
    position: 'middle',
    order: 'original-first',
    selectable: false
  };

  const LANGUAGES = [
    ['auto', 'Auto detect'], ['en', 'English'], ['ru', 'Russian'], ['es', 'Spanish'],
    ['az', 'Azerbaijani'], ['tr', 'Turkish'], ['de', 'German'], ['fr', 'French'],
    ['it', 'Italian'], ['pt', 'Portuguese'], ['uk', 'Ukrainian'], ['pl', 'Polish'],
    ['ja', 'Japanese'], ['ko', 'Korean'], ['zh-CN', 'Chinese (Simplified)']
  ];


  const UI_THEMES = ['clean-light','rounded-modern','colorful-gradient','dark-glass','minimal-compact','dark-minimal'];
  function normalizeUITheme(theme) {
    if (UI_THEMES.includes(theme)) return theme;
    if (theme === 'light') return 'clean-light';
    if (theme === 'dark') return 'dark-glass';
    return DEFAULTS.uiTheme;
  }

  const CAPTION_SELECTORS = [
    '.ytp-caption-window-container .ytp-caption-segment',
    '.caption-window .ytp-caption-segment',
    '.ytp-caption-window-container .caption-visual-line',
    '.ytp-caption-window-container .captions-text',
    '.caption-window .captions-text',
    '.ytp-caption-window-container span'
  ];

  let settings = { ...DEFAULTS };
  let player = null;
  let video = null;
  let overlay = null;
  let originalLine = null;
  let translationLine = null;
  let controlButton = null;
  let panel = null;
  let statusEl = null;
  let engineEl = null;
  let currentOriginal = '';
  let currentTranslation = '';
  let captionRevision = 0;
  let translationCache = new Map();
  let lastCaptionSeenAt = 0;
  let lastError = '';
  let currentEngine = '';
  let translateTimer = 0;
  let translationInFlight = false;
  let pendingTranslationText = '';
  let lastRequestedText = '';
  let translationRequestId = 0;
  let firstPendingAt = 0;
  let testUntil = 0;
  let testTimer = 0;
  let rawCaption = '';
  let phraseTimer = 0;
  let phraseStartedAt = 0;
  const PHRASE_STABLE_MS = 850;
  const PHRASE_MAX_WAIT_MS = 4200;

  // Whole-track cue mode. A MAIN-world helper (inject.js, MIT-licensed third-
  // party engine) captures YouTube's own pot-bearing /api/timedtext request and
  // gives us the complete json3 cue track. That lets DualTube paint stable
  // phrases from timed cues instead of mirroring the word-by-word DOM caption.
  let cueConfigNonce = 0;
  let cueMode = false;
  let cueGroups = [];
  let cueRaw = [];
  let cueActiveIndex = -1;
  let cueTimer = 0;
  let cueTrackKind = '';
  let cueTrackId = '';
  let cueAligned = null;
  let cueSameLang = false;
  let cueFallbackAnnounced = false;
  const cueTranslationCache = new Map();
  const CUE_PAUSE_BREAK_MS = 620;
  const CUE_MAX_WORDS = 30;
  const CUE_MAX_CHARS = 190;

  const diag = {
    playerFound: false,
    videoFound: false,
    ccButtonFound: false,
    ccPressed: false,
    captionNodeCount: 0,
    selector: 'none',
    captionPreview: '',
    scanAt: 0,
    forceClicks: 0
  };

  const getStorage = (defaults) => new Promise((resolve) => chrome.storage.sync.get(defaults, resolve));
  const setStorage = (values) => new Promise((resolve) => chrome.storage.sync.set(values, resolve));

  async function init() {
    settings = { ...(await getStorage(DEFAULTS)), ...FIXED_SETTINGS };
    settings.uiTheme = normalizeUITheme(settings.uiTheme);
    await setStorage(FIXED_SETTINGS);
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    window.addEventListener('message', onPageCueMessage, false);
    document.addEventListener('yt-navigate-finish', () => {
      resetCueMode();
      setTimeout(() => { setup(); sendCueConfig(); }, 120);
    });
    document.addEventListener('play', onPlay, true);
    document.addEventListener('pause', applySelectable, true);
    document.addEventListener('click', closePanelOnOutsideClick, true);

    setup();
    sendCueConfig();
    setInterval(setup, 900);
    setInterval(scanCaption, 120);
    cueTimer = window.setInterval(renderCueAtCurrentTime, 90);
    setInterval(() => {
      if (settings.enabled) ensureCaptionsOn(false);
    }, 1400);
  }

  function setup() {
    const nextPlayer = document.querySelector('.html5-video-player');
    const nextVideo = nextPlayer?.querySelector('video') || document.querySelector('video.html5-main-video');

    diag.playerFound = Boolean(nextPlayer);
    diag.videoFound = Boolean(nextVideo);

    if (!nextPlayer || !nextVideo) return;

    const changed = nextPlayer !== player;
    player = nextPlayer;
    video = nextVideo;

    ensureOverlay();
    ensureControlButton();
    ensurePanel();
    applySettings();
    if (changed) {
      currentOriginal = '';
      currentTranslation = '';
      rawCaption = '';
      cueActiveIndex = -1;
      phraseStartedAt = 0;
      clearTimeout(phraseTimer);
      phraseTimer = 0;
      lastCaptionSeenAt = 0;
      setTimeout(() => ensureCaptionsOn(false), 350);
    }
  }

  function ensureOverlay() {
    if (overlay?.isConnected && overlay.parentElement === player) return;
    overlay?.remove();

    overlay = document.createElement('div');
    overlay.className = 'dualtube-overlay-v2';
    overlay.innerHTML = `
      <div class="dualtube-box-v2">
        <div class="dualtube-line-v2 dualtube-original-v2"></div>
        <div class="dualtube-line-v2 dualtube-translation-v2"></div>
      </div>`;
    player.appendChild(overlay);
    originalLine = overlay.querySelector('.dualtube-original-v2');
    translationLine = overlay.querySelector('.dualtube-translation-v2');
  }

  function ensureControlButton() {
    const rightControls = player?.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    const existing = rightControls.querySelector('.dualtube-control-v2');
    if (existing) {
      controlButton = existing;
      return;
    }

    controlButton = document.createElement('button');
    controlButton.type = 'button';
    controlButton.className = 'ytp-button dualtube-control-v2';
    controlButton.title = 'Dual subtitles';
    controlButton.setAttribute('aria-label', 'Dual subtitles');
    controlButton.innerHTML = '<span class="dualtube-control-icon-v2">A<span>文</span></span><span class="dualtube-control-label-v2">DUAL</span>';
    controlButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) syncPanel();
    });

    const ccButton = rightControls.querySelector('.ytp-subtitles-button');

    // YouTube sometimes nests the CC button inside one or more wrappers.
    // insertBefore() requires its reference node to be a *direct* child of
    // rightControls, so walk upward until we reach that direct child.
    let anchor = ccButton;
    while (anchor && anchor.parentElement && anchor.parentElement !== rightControls) {
      anchor = anchor.parentElement;
    }

    if (anchor && anchor.parentElement === rightControls) {
      anchor.insertAdjacentElement('afterend', controlButton);
    } else if (rightControls.firstElementChild) {
      rightControls.insertBefore(controlButton, rightControls.firstElementChild);
    } else {
      rightControls.appendChild(controlButton);
    }
  }

  function ensurePanel() {
    if (panel?.isConnected && panel.parentElement === player) return;
    panel?.remove();

    panel = document.createElement('section');
    panel.className = 'dualtube-panel-v2';
    panel.hidden = true;
    panel.dataset.dualtubeTheme = normalizeUITheme(settings.uiTheme);
    const logoUrl = chrome.runtime.getURL('icons/icon128.png');
    panel.innerHTML = `
      <header class="dualtube-panel-head-v2">
        <div class="dualtube-panel-brand-v2"><img class="dualtube-panel-logo-v2" src="${logoUrl}" alt=""><div><strong>DualTube</strong><small>YouTube in Two Languages</small></div></div>
        <label class="dualtube-switch-v2" title="Enable Dual Subtitles"><input type="checkbox" data-setting="enabled"><span></span></label>
      </header>
      <div class="dualtube-language-row-v2">
        <label><span>From (Original)</span><select data-setting="sourceLanguage"></select></label>
        <button type="button" class="dualtube-swap-v2" data-role="swap" aria-label="Swap languages" title="Swap languages">⇄</button>
        <label><span>To (Translation)</span><select data-setting="targetLanguage"></select></label>
      </div>
      <div class="dualtube-divider-v2"></div>
      <span class="dualtube-label-v2">Display</span>
      <div class="dualtube-segments-v2" data-role="display">
        <button type="button" data-value="both">Both</button><button type="button" data-value="original">Original</button><button type="button" data-value="translation">Translation</button>
      </div>
      <label class="dualtube-range-v2"><span>Text size <output data-output="fontSize"></output></span><input type="range" min="18" max="46" step="1" data-setting="fontSize"></label>
      <label class="dualtube-range-v2"><span>Background <output data-output="backgroundOpacity"></output></span><input type="range" min="0" max="0.9" step="0.05" data-setting="backgroundOpacity"></label>
      <label class="dualtube-flow-v2"><span>Timing</span><select data-setting="captionFlow"><option value="phrase">Whole sentences</option><option value="live">Live cues</option></select></label>
      <div class="dualtube-status-v2" data-kind="ready"><i></i><span data-role="status">Ready</span></div>
      <footer><span data-role="engine">Engine: waiting</span><span class="dualtube-shortcut-v2">Theme synced with popup</span></footer>`
    player.appendChild(panel);
    statusEl = panel.querySelector('[data-role="status"]');
    engineEl = panel.querySelector('[data-role="engine"]');

    for (const select of panel.querySelectorAll('select[data-setting="sourceLanguage"], select[data-setting="targetLanguage"]')) {
      for (const [code, name] of LANGUAGES) {
        if (select.dataset.setting === 'targetLanguage' && code === 'auto') continue;
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        select.appendChild(option);
      }
    }

    panel.querySelectorAll('[data-setting]').forEach((input) => {
      const eventName = input.type === 'range' ? 'input' : 'change';
      input.addEventListener(eventName, async () => {
        const key = input.dataset.setting;
        let value = input.type === 'checkbox' ? input.checked : input.value;
        if (input.type === 'range') value = Number(value);
        settings[key] = value;
        await setStorage({ [key]: value });
        applySettings();
        syncPanel();
        if (key === 'sourceLanguage' || key === 'targetLanguage') retranslateCurrent();
        if (key === 'enabled' && value) ensureCaptionsOn(true);
      });
    });

    panel.querySelectorAll('.dualtube-segments-v2 button').forEach((button) => {
      button.addEventListener('click', async () => {
        settings.display = button.dataset.value;
        await setStorage({ display: settings.display });
        applySettings();
        syncPanel();
      });
    });

    panel.querySelector('[data-role="swap"]')?.addEventListener('click', async () => {
      let source = settings.sourceLanguage;
      let target = settings.targetLanguage;
      if (source === 'auto') {
        source = target;
        target = 'en';
      } else {
        [source, target] = [target, source];
      }
      settings.sourceLanguage = source;
      settings.targetLanguage = target;
      await setStorage({ sourceLanguage: source, targetLanguage: target });
      syncPanel();
      retranslateCurrent();
    });

    syncPanel();
  }

  function sendCueConfig() {
    try {
      const nonce = ++cueConfigNonce;
      window.postMessage({
        source: 'ytds-content',
        type: 'config',
        targetLang: settings.targetLanguage,
        // Auto asks YouTube for its aligned whole-track translation and lets
        // our sentence translator take over only when that track is unavailable.
        mode: 'auto',
        nonce
      }, '*');
    } catch {}
  }

  function resetCueMode() {
    cueMode = false;
    cueGroups = [];
    cueRaw = [];
    cueActiveIndex = -1;
    cueTrackKind = '';
    cueTrackId = '';
    cueAligned = null;
    cueSameLang = false;
    cueFallbackAnnounced = false;
    cueTranslationCache.clear();
  }

  function onPageCueMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'ytds-inject') return;
    if (typeof data.nonce === 'number' && data.nonce !== cueConfigNonce) return;

    if (data.type === 'cues') {
      acceptCueTrack(data);
      return;
    }
    if (data.type === 'nocues') {
      cueMode = false;
      cueGroups = [];
      cueRaw = [];
      cueActiveIndex = -1;
      cueFallbackAnnounced = true;
      setStatus('Whole-track cues unavailable — using live caption fallback.', 'working');
    }
  }

  function computeCueEnds(list) {
    for (let i = 0; i < list.length; i++) {
      const cue = list[i];
      let end = cue.start + (cue.dur > 0 ? cue.dur : 0);
      if (!(end > cue.start)) {
        end = i + 1 < list.length ? list[i + 1].start : cue.start + 1800;
        if (!(end > cue.start)) end = cue.start + 900;
      }
      cue.end = end;
    }
  }

  function wordCount(text) {
    return normalize(text).split(/\s+/).filter(Boolean).length;
  }

  function mergeTextParts(parts) {
    const clean = parts.map(normalize).filter(Boolean);
    if (!clean.length) return '';
    let out = clean[0];
    for (let p = 1; p < clean.length; p++) {
      const next = clean[p];
      if (!next) continue;
      if (out === next || out.endsWith(next)) continue;
      if (next.startsWith(out)) { out = next; continue; }

      // Remove repeated rolling-caption overlap (e.g. "I went to" +
      // "to school today" -> "I went to school today").
      const a = out.split(/\s+/);
      const b = next.split(/\s+/);
      let overlap = 0;
      const max = Math.min(10, a.length, b.length);
      for (let n = max; n >= 1; n--) {
        const left = a.slice(-n).join(' ').toLocaleLowerCase();
        const right = b.slice(0, n).join(' ').toLocaleLowerCase();
        if (left === right) { overlap = n; break; }
      }
      out = `${out} ${b.slice(overlap).join(' ')}`.trim();
    }
    return normalize(out);
  }

  function buildCueGroups(list, useSentenceGroups) {
    if (!useSentenceGroups) {
      return list.map((cue, i) => ({
        start: cue.start,
        end: cue.end,
        startIdx: i,
        endIdx: i,
        text: cue.text,
        trans: normalize(cue.trans || '')
      }));
    }

    const groups = [];
    let startIdx = 0;
    let words = 0;
    let chars = 0;
    const sentenceEnd = /[.!?…]["'”’)]?$/;

    const flush = (endIdx) => {
      if (endIdx < startIdx) return;
      const slice = list.slice(startIdx, endIdx + 1);
      const original = mergeTextParts(slice.map((c) => c.text));
      const translated = cueAligned === true
        ? mergeTextParts(slice.map((c) => c.trans || ''))
        : '';
      if (original) {
        groups.push({
          start: slice[0].start,
          end: slice[slice.length - 1].end,
          startIdx,
          endIdx,
          text: original,
          trans: translated
        });
      }
      startIdx = endIdx + 1;
      words = 0;
      chars = 0;
    };

    for (let i = 0; i < list.length; i++) {
      const cue = list[i];
      words += wordCount(cue.text);
      chars += normalize(cue.text).length + 1;
      const last = i === list.length - 1;
      const anchor = Math.max(cue.start, typeof cue.lastOff === 'number' ? cue.lastOff : cue.start);
      const pause = last ? Infinity : list[i + 1].start - anchor;
      const nextWords = last ? 0 : wordCount(list[i + 1].text);
      const nextChars = last ? 0 : normalize(list[i + 1].text).length + 1;
      const boundary = last || sentenceEnd.test(normalize(cue.text)) || pause > CUE_PAUSE_BREAK_MS;
      const cap = !last && (words + nextWords > CUE_MAX_WORDS || chars + nextChars > CUE_MAX_CHARS);
      if (boundary || cap) flush(i);
    }
    // Give every sentence a clean, non-overlapping display window. ASR cue
    // durations can overlap heavily; the next sentence's start is the least
    // surprising hand-off point for a stable subtitle overlay.
    for (let i = 0; i < groups.length - 1; i++) {
      const nextStart = groups[i + 1].start;
      if (nextStart > groups[i].start) groups[i].end = Math.max(groups[i].start + 350, nextStart);
    }
    return groups;
  }

  function acceptCueTrack(data) {
    const list = Array.isArray(data.cues) ? data.cues
      .map((cue) => ({
        start: Number(cue.start) || 0,
        dur: Number(cue.dur) || 0,
        lastOff: typeof cue.lastOff === 'number' ? cue.lastOff : Number(cue.start) || 0,
        text: normalize(cue.text),
        trans: normalize(cue.trans || '')
      }))
      .filter((cue) => cue.text)
      .sort((a, b) => a.start - b.start) : [];

    if (!list.length) return;
    computeCueEnds(list);
    cueRaw = list;
    cueAligned = data.aligned;
    cueSameLang = Boolean(data.sameLang);
    cueTrackKind = data.trackKind === 'asr' ? 'asr' : (data.trackKind || 'manual');
    cueTrackId = String(data.trackId || '');
    const wholeSentences = settings.captionFlow !== 'live';
    cueGroups = buildCueGroups(list, wholeSentences);
    cueMode = cueGroups.length > 0;
    cueActiveIndex = -1;
    cueFallbackAnnounced = false;
    cueTranslationCache.clear();

    // Kill any DOM-scrape translation that was in flight before the complete
    // track arrived; cue mode is now authoritative.
    translationRequestId += 1;
    pendingTranslationText = '';
    currentOriginal = '';
    currentTranslation = '';
    rawCaption = '';
    clearTimeout(phraseTimer);
    phraseTimer = 0;
    player?.classList.add('dualtube-native-hidden-v2');
    setStatus(wholeSentences ? 'Whole-sentence track ready.' : 'Timed caption track ready.', 'ready');
    currentEngine = cueAligned === true ? 'YouTube whole-track' : 'Smart sentence fallback';
    updateEngine();
    renderCueAtCurrentTime(true);
  }

  function cueIndexAt(ms) {
    if (!cueGroups.length) return -1;
    let lo = 0, hi = cueGroups.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const group = cueGroups[mid];
      if (ms < group.start) hi = mid - 1;
      else if (ms >= group.end) lo = mid + 1;
      else return mid;
    }
    return -1;
  }

  function renderCueAtCurrentTime(force = false) {
    if (!cueMode || !settings.enabled || !video || !cueGroups.length) return;
    const index = cueIndexAt(video.currentTime * 1000);
    if (!force && index === cueActiveIndex) return;
    cueActiveIndex = index;

    if (index < 0) {
      currentOriginal = '';
      currentTranslation = '';
      setOverlayText('', '');
      return;
    }

    const group = cueGroups[index];
    currentOriginal = group.text;
    currentTranslation = cueSameLang && settings.display === 'translation'
      ? group.text
      : (cueSameLang ? '' : normalize(group.trans || ''));
    player?.classList.add('dualtube-native-hidden-v2');
    setOverlayText(currentOriginal, currentTranslation);

    if (cueSameLang) {
      currentEngine = 'Original track';
      setStatus('Live — source already matches the second language.', 'ready');
      updateEngine();
      return;
    }

    if (currentTranslation) {
      currentEngine = 'YouTube whole-track';
      setStatus('Live — whole sentences.', 'ready');
      updateEngine();
      prefetchCueTranslations(index + 1);
      return;
    }

    currentEngine = 'Smart sentence fallback';
    setStatus('Live — translating whole sentence…', 'working');
    updateEngine();
    translateCueGroup(index);
    prefetchCueTranslations(index + 1);
  }

  async function translateCueGroup(index, quiet = false) {
    const group = cueGroups[index];
    if (!group || group.trans || cueSameLang) return;
    const key = `${settings.sourceLanguage}>${settings.targetLanguage}:${group.text}`;
    if (cueTranslationCache.has(key)) {
      group.trans = cueTranslationCache.get(key);
      if (index === cueActiveIndex) {
        currentTranslation = group.trans;
        setOverlayText(currentOriginal, currentTranslation);
        if (!quiet) setStatus('Live — whole sentences.', 'ready');
      }
      return;
    }
    if (group._translating) return;
    group._translating = true;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'DUALTUBE_TRANSLATE',
        text: group.text,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage
      });
      if (!result?.ok) throw Object.assign(new Error(result?.error || 'Translation failed.'), { code: result?.code });
      const translated = normalize(result.text);
      if (!translated) throw new Error('Translation returned empty text.');
      cueTranslationCache.set(key, translated);
      group.trans = translated;
      if (index === cueActiveIndex) {
        currentTranslation = translated;
        currentEngine = result.engine || 'Smart sentence fallback';
        lastError = '';
        setOverlayText(currentOriginal, currentTranslation);
        setStatus('Live — whole sentences.', 'ready');
        updateEngine();
      }
    } catch (error) {
      if (index === cueActiveIndex) {
        lastError = error?.message || 'Translation failed.';
        setStatus(error?.code === 'RATE_LIMIT' ? 'Translation is rate-limited — retrying later.' : 'Translation fallback unavailable.', 'error');
      }
    } finally {
      group._translating = false;
    }
  }

  function prefetchCueTranslations(fromIndex) {
    if (cueAligned === true || cueSameLang) return;
    for (let i = fromIndex; i < Math.min(cueGroups.length, fromIndex + 3); i++) {
      setTimeout(() => translateCueGroup(i, true), (i - fromIndex) * 180);
    }
  }

  function getCaptionSnapshot() {
    if (!player) return { text: '', selector: 'none', count: 0 };

    for (const selector of CAPTION_SELECTORS) {
      const nodes = Array.from(player.querySelectorAll(selector));
      if (!nodes.length) continue;

      const texts = [];
      for (const node of nodes) {
        const text = normalize(node.textContent);
        if (!text) continue;
        // Ignore parent nodes that only duplicate a child already selected.
        if (texts[texts.length - 1] !== text && !texts.includes(text)) texts.push(text);
      }
      const joined = normalize(texts.join(' '));
      if (joined) return { text: joined.slice(0, 1200), selector, count: nodes.length };
    }

    // Last-resort container read. Some YouTube/Windows combinations expose text
    // in the caption container before the normal segment classes appear.
    const container = player.querySelector('.ytp-caption-window-container');
    const fallback = normalize(container?.textContent);
    if (fallback) {
      return { text: fallback.slice(0, 1200), selector: '.ytp-caption-window-container (fallback)', count: 1 };
    }

    return { text: '', selector: 'none', count: 0 };
  }

  function scanCaption() {
    if (!player || !settings.enabled) return;
    if (cueMode && cueGroups.length) {
      player.classList.add('dualtube-native-hidden-v2');
      return;
    }

    const snapshot = getCaptionSnapshot();
    const now = Date.now();
    diag.scanAt = now;
    diag.selector = snapshot.selector;
    diag.captionNodeCount = snapshot.count;
    diag.captionPreview = snapshot.text.slice(0, 110);

    const ccButton = player.querySelector('.ytp-subtitles-button');
    diag.ccButtonFound = Boolean(ccButton);
    diag.ccPressed = ccButton?.getAttribute('aria-pressed') === 'true';

    if (now < testUntil) return;

    if (!snapshot.text) {
      // In smooth-phrase mode, a disappearing native cue is a strong signal
      // that YouTube has finished the phrase. Commit the final buffered text
      // before clearing anything from our overlay.
      if (settings.captionFlow === 'phrase' && rawCaption && currentOriginal !== rawCaption && now - lastCaptionSeenAt > 180) {
        commitPhrase(rawCaption);
      }

      const clearDelay = settings.captionFlow === 'phrase' ? 1800 : 850;
      if (now - lastCaptionSeenAt > clearDelay) {
        currentOriginal = '';
        currentTranslation = '';
        rawCaption = '';
        phraseStartedAt = 0;
        clearTimeout(phraseTimer);
        phraseTimer = 0;
        setOverlayText('', '');
        player.classList.remove('dualtube-native-hidden-v2');
        if (!diag.ccButtonFound) setStatus('No YouTube CC button found for this video.', 'error');
        else if (!diag.ccPressed) setStatus('YouTube CC is off — trying to turn it on…', 'working');
        else setStatus('CC is on. Waiting for spoken caption text…', 'waiting');
      }
      return;
    }

    lastCaptionSeenAt = now;
    // Hide YouTube's native rolling caption immediately. In smooth mode this
    // intentionally creates a short quiet pause while we build a whole phrase.
    player.classList.add('dualtube-native-hidden-v2');

    if (settings.captionFlow === 'live') {
      processLiveCaption(snapshot.text);
      return;
    }

    processPhraseCaption(snapshot.text);
  }

  function processLiveCaption(text) {
    if (text === currentOriginal) return;

    const previousOriginal = currentOriginal;
    currentOriginal = text;
    rawCaption = text;
    captionRevision += 1;

    const sameCueGrowth = previousOriginal &&
      (currentOriginal.startsWith(previousOriginal) || previousOriginal.startsWith(currentOriginal));
    if (!sameCueGrowth && currentTranslation && previousOriginal) firstPendingAt = 0;

    setOverlayText(currentOriginal, currentTranslation || '…');
    setStatus('Caption found — translating…', 'working');
    queueTranslation(currentOriginal);
  }

  function processPhraseCaption(text) {
    if (text === rawCaption) return;

    const now = Date.now();
    const previousRaw = rawCaption;
    const sameCueGrowth = previousRaw &&
      (text.startsWith(previousRaw) || previousRaw.startsWith(text));

    rawCaption = text;

    // A non-overlapping replacement usually means YouTube moved to the next
    // caption cue. The old raw text is therefore our best completed phrase.
    if (previousRaw && !sameCueGrowth) {
      commitPhrase(previousRaw);
      phraseStartedAt = now;
    } else if (!phraseStartedAt) {
      phraseStartedAt = now;
    }

    schedulePhraseCommit();
    setStatus('Building a complete phrase…', 'working');
  }

  function schedulePhraseCommit() {
    clearTimeout(phraseTimer);
    phraseTimer = 0;
    if (!rawCaption) return;

    const now = Date.now();
    if (!phraseStartedAt) phraseStartedAt = now;
    const age = now - phraseStartedAt;
    const wordCount = rawCaption.split(/\s+/).filter(Boolean).length;
    const hasTerminalPunctuation = /[.!?…]["'”’)]?$/.test(rawCaption);

    // Punctuation is a strong sentence boundary, so commit quickly. Otherwise
    // wait for ~850 ms of stability. Very long unpunctuated auto-captions are
    // flushed after 4.2 s so the viewer is never left staring at a blank screen.
    let delay = PHRASE_STABLE_MS;
    if (hasTerminalPunctuation && wordCount >= 3) delay = 180;
    if (age >= PHRASE_MAX_WAIT_MS) delay = 0;
    else delay = Math.min(delay, Math.max(0, PHRASE_MAX_WAIT_MS - age));

    phraseTimer = setTimeout(() => {
      phraseTimer = 0;
      commitPhrase(rawCaption);
    }, delay);
  }

  function commitPhrase(text) {
    text = normalize(text);
    if (!text || text === currentOriginal) return;

    currentOriginal = text;
    currentTranslation = '';
    captionRevision += 1;
    phraseStartedAt = Date.now();

    // Show the completed original phrase once, then add its translation when
    // ready. No word-by-word animation and no permanent ellipsis placeholder.
    setOverlayText(currentOriginal, '');
    setStatus('Phrase ready — translating…', 'working');
    queueTranslation(currentOriginal, true);
  }

  function queueTranslation(text, immediate = false) {
    if (!settings.enabled || !text) return;
    pendingTranslationText = text;
    if (!firstPendingAt) firstPendingAt = Date.now();

    // One timer at a time. This is a throttle, not a debounce: continuous
    // word-by-word captions can no longer postpone translation forever.
    if (translationInFlight || translateTimer) return;

    const age = Date.now() - firstPendingAt;
    const delay = immediate ? 0 : (age >= 650 ? 0 : 240);
    translateTimer = setTimeout(() => {
      translateTimer = 0;
      runQueuedTranslation();
    }, delay);
  }

  async function runQueuedTranslation() {
    if (translationInFlight || !settings.enabled) return;
    const text = pendingTranslationText;
    if (!text) return;

    pendingTranslationText = '';
    firstPendingAt = 0;

    if (text === lastRequestedText && currentTranslation) return;
    lastRequestedText = text;
    translationInFlight = true;
    const requestId = ++translationRequestId;
    const key = `${settings.sourceLanguage}>${settings.targetLanguage}:${text}`;

    try {
      let value = translationCache.get(key);
      if (!value) {
        const result = await chrome.runtime.sendMessage({
          type: 'DUALTUBE_TRANSLATE',
          text,
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage
        });
        if (!result?.ok) throw Object.assign(new Error(result?.error || 'Translation failed.'), { code: result?.code });
        value = { text: normalize(result.text), engine: result.engine || 'Translation service' };
        translationCache.set(key, value);
        if (translationCache.size > 500) translationCache.delete(translationCache.keys().next().value);
      }

      if (requestId !== translationRequestId) return;

      // If YouTube expanded the same cue while the request was in flight, this
      // slightly older translation is still useful and will be replaced by the
      // queued newest version moments later. For a completely different cue,
      // don't flash unrelated text.
      const stillSameCue = currentOriginal === text ||
        currentOriginal.startsWith(text) || text.startsWith(currentOriginal);
      if (stillSameCue) {
        currentTranslation = value.text;
        currentEngine = value.engine || currentEngine;
        lastError = '';
        setOverlayText(currentOriginal, currentTranslation);
        setStatus(pendingTranslationText && pendingTranslationText !== text ? 'Updating translation…' : 'Live', pendingTranslationText ? 'working' : 'ready');
        updateEngine();
      }
    } catch (error) {
      if (requestId === translationRequestId) {
        lastError = error?.message || 'Translation failed.';
        // Keep any previous successful translation instead of replacing it with
        // a permanent ellipsis/error during a temporary network failure.
        setOverlayText(currentOriginal, currentTranslation || 'Translation unavailable');
        setStatus(error?.code === 'RATE_LIMIT' ? 'Translation paused briefly — rate limit.' : 'Translation retrying…', 'error');
      }
    } finally {
      translationInFlight = false;
      if (pendingTranslationText && pendingTranslationText !== text) {
        queueTranslation(pendingTranslationText, true);
      }
    }
  }

  function retranslateCurrent() {
    if (cueMode && cueGroups.length) {
      cueTranslationCache.clear();
      // A language change makes every previous translated line stale, even if
      // it came from an aligned YouTube track. Clear it immediately while the
      // MAIN-world cue engine fetches the new target track.
      cueAligned = null;
      for (const group of cueGroups) {
        group.trans = '';
        group._translating = false;
      }
      cueActiveIndex = -1;
      renderCueAtCurrentTime(true);
      return;
    }
    translationCache.clear();
    lastRequestedText = '';
    pendingTranslationText = '';
    firstPendingAt = 0;
    translationRequestId += 1;
    clearTimeout(translateTimer);
    translateTimer = 0;
    if (!currentOriginal) return;
    currentTranslation = '';
    setOverlayText(currentOriginal, settings.captionFlow === 'live' ? '…' : '');
    queueTranslation(currentOriginal, true);
  }

  function normalize(value) {
    return String(value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
  }

  function setOverlayText(original, translated) {
    if (!overlay || !originalLine || !translationLine) return;
    originalLine.textContent = original || '';
    translationLine.textContent = translated || '';
    overlay.classList.toggle('has-text', Boolean(original || translated));
    applySelectable();
  }

  function applySettings() {
    if (!overlay || !player) return;
    overlay.style.setProperty('--dualtube-font-size-v2', `${settings.fontSize}px`);
    overlay.style.setProperty('--dualtube-bg-opacity-v2', String(settings.backgroundOpacity));
    settings.position = FIXED_SETTINGS.position;
    settings.order = FIXED_SETTINGS.order;
    settings.selectable = FIXED_SETTINGS.selectable;
    overlay.dataset.position = FIXED_SETTINGS.position;
    overlay.dataset.order = FIXED_SETTINGS.order;
    overlay.dataset.display = settings.display;

    // Do not rely only on CSS attribute selectors for the display modes.
    // YouTube changes/overrides styles aggressively; set the visibility directly too.
    if (originalLine) originalLine.style.display = settings.display === 'translation' ? 'none' : '';
    if (translationLine) translationLine.style.display = settings.display === 'original' ? 'none' : '';

    overlay.classList.toggle('is-enabled', Boolean(settings.enabled));
    controlButton?.classList.toggle('is-on', Boolean(settings.enabled));
    if (!settings.enabled) {
      player.classList.remove('dualtube-native-hidden-v2');
      setOverlayText('', '');
    }
    applySelectable();
  }

  function applySelectable() {
    if (!overlay || !video) return;
    overlay.classList.remove('is-selectable');
  }

  function syncPanel() {
    if (!panel) return;
    settings.uiTheme = normalizeUITheme(settings.uiTheme);
    panel.dataset.dualtubeTheme = settings.uiTheme;
    if (player) player.dataset.dualtubeTheme = settings.uiTheme;
    panel.querySelectorAll('[data-setting]').forEach((input) => {
      const key = input.dataset.setting;
      if (!(key in settings)) return;
      if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
      else input.value = settings[key];
    });
    panel.querySelectorAll('.dualtube-segments-v2 button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.value === settings.display);
    });
    const fontOutput = panel.querySelector('[data-output="fontSize"]');
    const bgOutput = panel.querySelector('[data-output="backgroundOpacity"]');
    if (fontOutput) fontOutput.textContent = `${settings.fontSize}px`;
    if (bgOutput) bgOutput.textContent = `${Math.round(settings.backgroundOpacity * 100)}%`;
    updateEngine();
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    const row = statusEl.closest('.dualtube-status-v2');
    if (row) row.dataset.kind = kind;
  }

  function updateEngine() {
    if (engineEl) engineEl.textContent = `Engine: ${currentEngine || 'waiting'}`;
  }

  function ensureCaptionsOn(force) {
    if (!settings.enabled || !player) return false;
    const button = player.querySelector('.ytp-subtitles-button');
    diag.ccButtonFound = Boolean(button);
    if (!button) return false;

    const pressed = button.getAttribute('aria-pressed') === 'true';
    diag.ccPressed = pressed;
    if (!pressed) {
      try {
        button.click();
        diag.forceClicks += 1;
        if (force) setStatus('Turning YouTube CC on…', 'working');
        return true;
      } catch {}
    }
    return pressed;
  }

  function showTestOverlay() {
    if (!player) return false;
    testUntil = Date.now() + 3500;
    clearTimeout(testTimer);
    player.classList.add('dualtube-native-hidden-v2');
    setOverlayText('DualTube overlay is working.', 'Тестовая строка / Línea de prueba');
    setStatus('Overlay test — if you can read both lines, rendering works.', 'ready');
    testTimer = setTimeout(() => {
      testUntil = 0;
      player.classList.remove('dualtube-native-hidden-v2');
      setOverlayText('', '');
      scanCaption();
    }, 3500);
    return true;
  }

  function onPlay() {
    applySelectable();
    setTimeout(() => ensureCaptionsOn(false), 120);
    setTimeout(() => {
      if (cueMode) renderCueAtCurrentTime(true);
      else scanCaption();
    }, 260);
  }

  function closePanelOnOutsideClick(event) {
    if (!panel || panel.hidden) return;
    if (panel.contains(event.target) || controlButton?.contains(event.target)) return;
    panel.hidden = true;
  }

  function onStorageChanged(changes, area) {
    if (area !== 'sync') return;
    let languageChanged = false;
    let flowChanged = false;
    for (const [key, change] of Object.entries(changes)) {
      if (!(key in DEFAULTS)) continue;
      if (key in FIXED_SETTINGS) {
        settings[key] = FIXED_SETTINGS[key];
        continue;
      }
      settings[key] = change.newValue;
      if (key === 'sourceLanguage' || key === 'targetLanguage') languageChanged = true;
      if (key === 'captionFlow') flowChanged = true;
    }
    applySettings();
    syncPanel();
    if (flowChanged) {
      clearTimeout(phraseTimer);
      phraseTimer = 0;
      phraseStartedAt = 0;
      rawCaption = '';
      currentOriginal = '';
      currentTranslation = '';
      setOverlayText('', '');
      if (cueRaw.length) {
        cueGroups = buildCueGroups(cueRaw, settings.captionFlow !== 'live');
        cueActiveIndex = -1;
        cueMode = cueGroups.length > 0;
        renderCueAtCurrentTime(true);
      } else {
        scanCaption();
      }
    }
    if (languageChanged) {
      cueTranslationCache.clear();
      sendCueConfig();
      retranslateCurrent();
    }
    if (settings.enabled) {
      ensureCaptionsOn(false);
      if (cueMode) renderCueAtCurrentTime(true);
    }
  }

  function onRuntimeMessage(message, sender, sendResponse) {
    if (!message) return;

    if (message.type === 'DUALTUBE_GET_STATUS') {
      const ccButton = player?.querySelector('.ytp-subtitles-button');
      if (ccButton) {
        diag.ccButtonFound = true;
        diag.ccPressed = ccButton.getAttribute('aria-pressed') === 'true';
      }
      sendResponse({
        loaded: true,
        enabled: settings.enabled,
        hasPlayer: Boolean(player),
        hasVideo: Boolean(video),
        hasCaption: Boolean(currentOriginal),
        translatingTo: settings.targetLanguage,
        engine: currentEngine,
        error: lastError,
        display: settings.display,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        original: currentOriginal,
        translation: currentTranslation,
        cueMode,
        cueTrackKind,
        cueGroupCount: cueGroups.length,
        diag: { ...diag, selector: cueMode ? `timedtext/${cueTrackKind || 'track'}` : diag.selector }
      });
      return;
    }

    if (message.type === 'DUALTUBE_FORCE_CC') {
      sendResponse({ ok: ensureCaptionsOn(true) });
      return;
    }

    if (message.type === 'DUALTUBE_TEST_OVERLAY') {
      sendResponse({ ok: showTestOverlay() });
    }
  }

  init();
})();
