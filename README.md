# Image Downloader – Custom Names

A Chrome extension that downloads images from any website using a custom filename format and automatic sequential numbering.

## Features

- Works on **any website**
- Custom base filename (e.g. `221549--YS152`)
- Automatic numbering: `_1`, `_2`, `_3`, …
- Prefers the largest / full-size version of each image:
  - Parent `<a href="full.jpg">` (common for lightbox / open-in-new-tab)
  - `srcset` (largest width)
  - Common lazy-load / zoom attributes (`data-src`, `data-original`, `data-zoom-src`, etc.)
- Options:
  - Only visible images
  - Ignore images smaller than 50×50 px
- Remembers the last used filename format

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `image-downloader-extension` folder

## Usage

1. Navigate to any page that contains images
2. Click the extension icon in the toolbar
3. Enter the desired **filename format** (e.g. `221549--YS152`)
4. Optionally adjust the checkboxes
5. Click **Download all images**

Images are saved to your default Downloads folder as:

- `221549--YS152_1.jpg`
- `221549--YS152_2.jpg`
- `221549--YS152_3.jpg`
- …

## Project structure
image-downloader-extension/
├── manifest.json      # Extension manifest (MV3)
├── popup.html         # Popup UI
├── popup.js           # Popup logic (UI + download orchestration)
├── content.js         # Content script – image collection on the page
├── styles.css         # Popup styles
├── icon16.png
├── icon48.png
├── icon128.png
├── README.md          # Hebrew readme
└── README.en.md       # This file
text## How it works

1. The **content script** (`content.js`) is injected into every page.
2. When you click the download button, the **popup** sends a message asking for images.
3. The content script scans all `<img>` elements, picks the best URL for each (full-size when available), and returns the list.
4. The popup uses the Chrome Downloads API to save each image with the chosen name + sequential number.

## Notes

- Data-URI images are skipped
- If a filename already exists, Chrome automatically makes it unique
- Some sites that load the full-size image only after a click (pure JS, no URL in the DOM) may st