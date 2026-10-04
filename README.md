# DualTube Subtitles

<p align="center">
  <img src="icons/icon256.png" alt="DualTube Logo" width="150">
</p>

<h1 align="center">DualTube</h1>

<p align="center">
  Watch YouTube with two subtitle languages at the same time.
</p>

<p align="center">
  A lightweight Chrome extension for bilingual YouTube subtitles, language learning, and easier multilingual viewing.
</p>

---

## Features

DualTube adds a second subtitle layer to YouTube while keeping the original captions available.

### Dual subtitles

Display:

- Both languages
- Original subtitles only
- Translation only

Choose the original language and translation language independently.

### Whole-sentence subtitles

DualTube can use YouTube's timed caption cues instead of relying only on the rolling word-by-word subtitle text shown on screen.

This provides more stable subtitle lines and makes bilingual subtitles easier to read.

### YouTube translation support

When YouTube provides its own translated caption track, DualTube can use it directly.

If that is unavailable, DualTube can fall back to sentence-based translation.

### Language controls

Quickly:

- select original language
- select translation language
- swap languages
- use Auto Detect
- change subtitle order

### Subtitle customization

Adjust:

- subtitle position
- font size
- background opacity
- subtitle timing
- language order
- display mode

### Six built-in themes

DualTube includes six synchronized interface themes:

- Clean Light
- Rounded Modern
- Colorful Gradient
- Dark Glass
- Minimal Compact
- Dark Minimal

The selected theme is shared between the extension popup and the DualTube panel inside YouTube.

Your theme preference is saved automatically.

### Built-in controls

The popup also includes quick access to:

- Help
- Support
- Rate

Diagnostics are available through the small `•••` menu when needed.

---

## Screenshots

Screenshots and previews can be added here as the project develops.

---

## Install locally

1. Download or clone this repository.
2. Open:

   `chrome://extensions/`

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json`.
6. Open or refresh YouTube.
7. Enable YouTube captions on a video.
8. Open DualTube and choose your languages.

---

## Recommended setup

A simple starting configuration:

**Original language**

`Auto Detect` or `English`

**Translation language**

`Spanish`, `Russian`, or another supported language

**Display**

`Both`

**Subtitle timing**

`Whole sentences`

---

## How it works

DualTube reads the available YouTube caption information and displays an additional subtitle layer over the video.

When timed caption data is available, DualTube can prepare stable caption cues ahead of playback.

This helps avoid subtitles constantly changing one word at a time.

If the preferred timed-caption method is unavailable, DualTube retains a live subtitle fallback.

---

## Privacy

DualTube does not require an account.

The extension currently includes:

- no user accounts
- no profiles
- no analytics
- no advertising tracking

When YouTube provides a translated caption track, DualTube uses YouTube's caption system.

When translation fallback is required, subtitle text may be sent to the translation endpoint configured by the extension.

---

## Project structure

```text
DualTube/
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
├── content.js
├── content.css
├── inject.js
├── background.js
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon64.png
│   ├── icon128.png
│   ├── icon256.png
│   └── icon512.png
└── README.md# DualTube Subtitles

<p align="center">
  <img src="icons/icon256.png" alt="DualTube Logo" width="150">
</p>

<h1 align="center">DualTube</h1>

<p align="center">
  Watch YouTube with two subtitle languages at the same time.
</p>

<p align="center">
  A lightweight Chrome extension for bilingual YouTube subtitles, language learning, and easier multilingual viewing.
</p>

---

## Features

DualTube adds a second subtitle layer to YouTube while keeping the original captions available.

### Dual subtitles

Display:

- Both languages
- Original subtitles only
- Translation only

Choose the original language and translation language independently.

### Whole-sentence subtitles

DualTube can use YouTube's timed caption cues instead of relying only on the rolling word-by-word subtitle text shown on screen.

This provides more stable subtitle lines and makes bilingual subtitles easier to read.

### YouTube translation support

When YouTube provides its own translated caption track, DualTube can use it directly.

If that is unavailable, DualTube can fall back to sentence-based translation.

### Language controls

Quickly:

- select original language
- select translation language
- swap languages
- use Auto Detect
- change subtitle order

### Subtitle customization

Adjust:

- subtitle position
- font size
- background opacity
- subtitle timing
- language order
- display mode

### Six built-in themes

DualTube includes six synchronized interface themes:

- Clean Light
- Rounded Modern
- Colorful Gradient
- Dark Glass
- Minimal Compact
- Dark Minimal

The selected theme is shared between the extension popup and the DualTube panel inside YouTube.

Your theme preference is saved automatically.

### Built-in controls

The popup also includes quick access to:

- Help
- Support
- Rate

Diagnostics are available through the small `•••` menu when needed.

---

## Screenshots

Screenshots and previews can be added here as the project develops.

---

## Install locally

1. Download or clone this repository.
2. Open:

   `chrome://extensions/`

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json`.
6. Open or refresh YouTube.
7. Enable YouTube captions on a video.
8. Open DualTube and choose your languages.

---

## Recommended setup

A simple starting configuration:

**Original language**

`Auto Detect` or `English`

**Translation language**

`Spanish`, `German` `French`, or another supported language

**Display**

`Both`

**Subtitle timing**

`Whole sentences`

---

## How it works

DualTube reads the available YouTube caption information and displays an additional subtitle layer over the video.

When timed caption data is available, DualTube can prepare stable caption cues ahead of playback.

This helps avoid subtitles constantly changing one word at a time.

If the preferred timed-caption method is unavailable, DualTube retains a live subtitle fallback.

---

## Privacy

DualTube does not require an account.

The extension currently includes:

- no user accounts
- no profiles
- no analytics
- no advertising tracking

When YouTube provides a translated caption track, DualTube uses YouTube's caption system.

When translation fallback is required, subtitle text may be sent to the translation endpoint configured by the extension.

---
2026 Ziraddin Gulumjanli