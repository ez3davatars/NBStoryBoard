# Biometric Scan Sounds

Drop custom scan-complete audio files in this folder.

NanoCast looks for these files, in this order:

- `center.mp3`, `center.wav`, `center.ogg`, `center.m4a`
- `left.mp3`, `left.wav`, `left.ogg`, `left.m4a`
- `right.mp3`, `right.wav`, `right.ogg`, `right.m4a`
- `up.mp3`, `up.wav`, `up.ogg`, `up.m4a`
- `down.mp3`, `down.wav`, `down.ogg`, `down.m4a`

Short files work best: 100-700 ms. If a file is missing or cannot be decoded, NanoCast falls back to its built-in synthesized tone for that angle.

After replacing files, reload the app so the audio cache refreshes.
