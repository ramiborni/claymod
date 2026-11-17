---
"@claymod/extension": minor
"@claymod/core": minor
---

Create mods with no API key: choose “On this device (WebLLM)” and a small coding model runs on
your GPU. Claymod looks at your GPU, suggests the largest model that leaves about half its
memory free for your other apps, downloads it once with progress, and frees the GPU after a few
idle minutes. Model code ships inside the extension and every downloaded file is checked
against pinned hashes.
