Fourier demo: cleaned structure

What changed:
- Added `lib/fourier-core.js` (shared `Complex` and `dft`) to centralize core functionality.
- Updated `time/index.html` and `space/index.html` to reference the shared lib.

Notes:
- Existing files remain in place for compatibility; sketches continue to reference `Complex` and `dft` as globals.
- Next steps could include extracting shared UI helpers and breaking very large files (e.g. `space/sketch.js`) into smaller modules.
