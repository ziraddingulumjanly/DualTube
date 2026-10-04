const SUPPORT_URL = "https://github.com/ziraddingulumjanly/DualTube";
const DEFAULTS = {
  enabled: true,
  sourceLanguage: 'auto',
  targetLanguage: 'ru',
  display: 'both',
  order: 'original-first',
  fontSize: 30,
  backgroundOpacity: .62,
  position: 'middle',
  selectable: false,
  captionFlow: 'phrase',
  uiTheme: 'rounded-modern'
};

const FIXED_SETTINGS = { position: 'middle', order: 'original-first', selectable: false };

const THEMES = ['clean-light','rounded-modern','colorful-gradient','dark-glass','minimal-compact','dark-minimal'];
const LANGUAGES = [
  ['auto','Auto'],['en','English'],['ru','Russian'],['es','Spanish'],['az','Azerbaijani'],
  ['tr','Turkish'],['de','German'],['fr','French'],['it','Italian'],['pt','Portuguese'],
  ['uk','Ukrainian'],['pl','Polish'],['ja','Japanese'],['ko','Korean'],['zh-CN','Chinese (Simplified)']
];

for (const id of ['sourceLanguage','targetLanguage']) {
  const select = document.getElementById(id);
  for (const [code,name] of LANGUAGES) {
    if (id === 'targetLanguage' && code === 'auto') continue;
    const option = document.createElement('option');
    option.value = code; option.textContent = name; select.appendChild(option);
  }
}

let settings = {...DEFAULTS};

function normalizeTheme(theme){
  if (THEMES.includes(theme)) return theme;
  if (theme === 'light') return 'clean-light';
  if (theme === 'dark') return 'dark-glass';
  return DEFAULTS.uiTheme;
}

function setTheme(theme){
  settings.uiTheme = normalizeTheme(theme);
  document.documentElement.dataset.uiTheme = settings.uiTheme;
  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    button.classList.toggle('active', button.dataset.themeChoice === settings.uiTheme);
  });
}

function paintRange(el){
  if (!el) return;
  const min = Number(el.min || 0), max = Number(el.max || 100), value = Number(el.value || 0);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const root = getComputedStyle(document.documentElement);
  const empty = root.getPropertyValue('--range-empty').trim() || '#d8deec';
  const accent = root.getPropertyValue('--accent').trim() || '#6658ee';
  el.style.background = `linear-gradient(90deg,${accent} 0 ${pct}%,${empty} ${pct}% 100%)`;
}

function applyUI(){
  for (const id of ['enabled','sourceLanguage','targetLanguage','captionFlow','fontSize','backgroundOpacity']) {
    const el = document.getElementById(id); if (!el) continue;
    const value = settings[id];
    if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
  }
  document.querySelectorAll('#displaySegments button').forEach(button => button.classList.toggle('active', button.dataset.value === settings.display));
  setTheme(settings.uiTheme);
  document.getElementById('fontSizeOutput').textContent = `${settings.fontSize}px`;
  document.getElementById('backgroundOpacityOutput').textContent = `${Math.round(settings.backgroundOpacity * 100)}%`;
  paintRange(document.getElementById('fontSize'));
  paintRange(document.getElementById('backgroundOpacity'));
}

chrome.storage.sync.get(DEFAULTS, stored => {
  settings = {...DEFAULTS,...stored,...FIXED_SETTINGS};
  settings.uiTheme = normalizeTheme(settings.uiTheme);
  chrome.storage.sync.set({...FIXED_SETTINGS, uiTheme:settings.uiTheme});
  applyUI();
});

for (const id of ['enabled','sourceLanguage','targetLanguage','captionFlow']) {
  document.getElementById(id).addEventListener('change', event => {
    settings[id] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    chrome.storage.sync.set({[id]:settings[id]});
  });
}
for (const id of ['fontSize','backgroundOpacity']) {
  document.getElementById(id).addEventListener('input', event => {
    settings[id] = Number(event.target.value);
    if (id === 'fontSize') document.getElementById('fontSizeOutput').textContent = `${settings[id]}px`;
    else document.getElementById('backgroundOpacityOutput').textContent = `${Math.round(settings[id] * 100)}%`;
    paintRange(event.target);
    chrome.storage.sync.set({[id]:settings[id]});
  });
}

document.querySelectorAll('#displaySegments button').forEach(button => button.addEventListener('click', () => {
  settings.display = button.dataset.value; applyUI(); chrome.storage.sync.set({display:settings.display});
}));

document.getElementById('swapLanguages').addEventListener('click', () => {
  let source = settings.sourceLanguage, target = settings.targetLanguage;
  if (source === 'auto') { source = target; target = 'en'; } else [source,target] = [target,source];
  settings.sourceLanguage = source; settings.targetLanguage = target; applyUI();
  chrome.storage.sync.set({sourceLanguage:source,targetLanguage:target});
});

async function activeTab(){ const [tab] = await chrome.tabs.query({active:true,currentWindow:true}); return tab; }
async function send(type){ const tab = await activeTab(); if (!tab?.id) throw new Error('No active tab'); return chrome.tabs.sendMessage(tab.id,{type}); }
function flashCc(kind){ const b=document.getElementById('forceCc'); b.classList.remove('flash-ok','flash-error'); void b.offsetWidth; b.classList.add(kind==='ok'?'flash-ok':'flash-error'); setTimeout(()=>b.classList.remove('flash-ok','flash-error'),700); }
document.getElementById('forceCc').addEventListener('click', async()=>{ try{const r=await send('DUALTUBE_FORCE_CC');flashCc(r?.ok?'ok':'error')}catch{flashCc('error')} });

const settingsOverlay = document.getElementById('settingsOverlay');
const infoOverlay = document.getElementById('infoOverlay');
function openOverlay(el){ el.hidden = false; }
function closeOverlay(el){ el.hidden = true; }
document.getElementById('settingsButton').addEventListener('click',()=>openOverlay(settingsOverlay));
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>{closeOverlay(settingsOverlay);closeOverlay(infoOverlay)}));
for (const overlay of [settingsOverlay,infoOverlay]) overlay.addEventListener('click',e=>{if(e.target===overlay) closeOverlay(overlay)});

document.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>{
  settings.uiTheme = normalizeTheme(button.dataset.themeChoice); setTheme(settings.uiTheme);
  paintRange(document.getElementById('fontSize')); paintRange(document.getElementById('backgroundOpacity'));
  chrome.storage.sync.set({uiTheme:settings.uiTheme});
}));

function showInfo(title, subtitle, html, primaryLabel='', primaryHandler=null){
  document.getElementById('infoTitle').textContent = title;
  document.getElementById('infoSubtitle').textContent = subtitle;
  document.getElementById('infoContent').innerHTML = html;
  const primary = document.getElementById('infoPrimary');
  primary.hidden = !primaryLabel; primary.textContent = primaryLabel || '';
  primary.onclick = primaryHandler || null;
  openOverlay(infoOverlay);
}

document.getElementById("supportBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: SUPPORT_URL });
});

document.getElementById('supportButton').addEventListener('click',()=>showInfo('Support','Troubleshooting',
  '<p>If a video is not translating, first confirm that YouTube captions are available for that video.</p><p>Reloading the YouTube tab after updating the extension also refreshes the injected DualTube panel.</p><p><strong>Tip:</strong> when you publish DualTube, this button can point to your support page or support email.</p>'
));

document.getElementById('rateButton').addEventListener('click',()=>showInfo('Rate DualTube','Chrome Web Store',
  '<p>Thanks for supporting DualTube. Once the extension is published, this opens its Chrome Web Store listing.</p>',
  'Open Chrome Web Store',()=>{
    const url = `https://chromewebstore.google.com/detail/${chrome.runtime.id}`;
    chrome.tabs.create({url});
  }
));

chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='sync') return;
  for(const [key,change] of Object.entries(changes)) if(key in DEFAULTS) settings[key]=change.newValue;
  Object.assign(settings,FIXED_SETTINGS); settings.uiTheme=normalizeTheme(settings.uiTheme); applyUI();
});
