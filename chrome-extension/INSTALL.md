# Walk Of Life — Chrome Extension

## Installation (Mac)

1. Download the Chrome extension files from the `chrome-extension` folder in the Walk Of Life GitHub repository.
2. Put the four extension files (`manifest.json`, `background.js`, `content.js`, and `popup.html`) together in one folder on your Mac. Keep `wol_music_host.rb` outside this folder.
3. Install the separate Mac helper program (wol_music_host.rb). **Downloading the helper file alone does not complete installation.**
4. Open Google Chrome and go to `chrome://extensions`.
5. Turn on **Developer mode**.
6. Click **Load unpacked**.
7. Select the folder containing `manifest.json`.

## Important

This is a community project and is not currently published in the Chrome Web Store.

The Apple Music connection requires a separate local helper program on your Mac. The helper allows the Chrome extension to communicate with the macOS Music app. That is what wol_music_host.rb is.

Only install software you trust. Review the helper code and understand the permissions it requires before installing it.

The extension and helper must both be installed and configured for Apple Music controls to work.
