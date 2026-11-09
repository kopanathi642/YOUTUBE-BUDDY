# Shorts Creative Studio (`/shorts/:projectId`)

An upgrade of the existing Shorts tools: multi-layer compositions for Shorts and Reels, rendered by the normal export
pipeline. You can open it from:
- the editor rail (Shorts → Shorts Creative Studio)
- each project card ("Shorts studio")

The older one-click tools are unchanged:
- Video to Shorts (Auto)
- Reels formatter
- Smart Reframe
- Auto Clips & Highlights

## How it works
- **Composition** (`frontend/src/compose.ts`): a stack of layers with **normalized** canvas positions (centre x/y and size as
  fractions of the canvas), so a layout survives any ratio or resolution.
  - Layer kinds: media (video, image, generated graphic), text and audio.
  - Each layer has its own transform, effects, timing (start, length, source in-point), entrance and exit animation, Ken Burns
    zoom and position keyframes.
- **Compile**: `compileComposition()` turns it into an ordinary timeline, one video track per layer, top layer first.
  - Crop and scale make each picture fill (cover) or fit (contain) its box. Nothing is ever stretched.
  - The composition JSON is stored on the sequence (`timeline.composition`).
- **Same picture in preview and export**: the studio previews with the editor's `Viewer`, and exports with `compile_ffmpeg`.
  - The new clip effects are implemented in both: `ClipFx` covers blur, rounded corners, border, drop shadow and mirror.
    Text styles cover alignment, outline and shadow.
  - FFmpeg: `gblur`, then an `alphamerge` rounded mask, then shadow and border stills drawn by Pillow at the exact picture size.
  - Browser: CSS `blur()`, `border-radius` and `box-shadow`.
  - Measured difference between preview and export: **1.7/255** mean absolute difference (`e2e/shorts.mjs`).
- **Ratios**:
  - 9:16 1080×1920
  - 4:5 1080×1350
  - 2:3 1080×1620
  - 1:1 1080×1080
  - 16:9 1920×1080
  - 3:2 1620×1080
  - Custom (any even size from 144 to 3840)
  - Resolution choices: 720p, 1080p, 1440p, 2160p short side. FPS: 24, 25, 30, 50, 60.
  - Changing the ratio rebuilds generated layouts for the new shape. Layers you placed by hand keep their normalized place.
- **Styles**:
  1. Stacked multi-video (2–6 panels; rows on tall canvases, columns on wide ones)
  2. Full-screen cinematic (face-aware cover crop, grade, vignette, slow zoom)
  3. Top/bottom text
  4. Blurred background (same clip, blurred and dimmed, muted)
  5. Centered video (colour, gradient, blur or image background; corners, border, shadow)
  6. Image + video (background image, main video, picture-in-picture, logo)
  7. **Shorts player preview**: an overlay toggle, never exported.
- **Templates**: 21 built-in templates across all 15 categories, made of real layers.
  - Creators can save their own (stored per workspace in `composition_templates`, with media replaced by numbered slots).
  - Custom templates can be duplicated, favourited and deleted. Favourites of built-in templates are kept in the browser.
- **AI Composition Assistant** (`suggestLayouts`): rule-based suggestions from measured facts:
  - source size and shape
  - number of faces (`analysis.face_count`, OpenCV)
  - scene changes
  - whether there is a transcript
  - how many clips and images are used

  Every suggestion lists its reasons and is applied only when the creator clicks Apply (Ctrl+Z undoes it). No AI key is needed.
- **Graphics**: `POST /projects/{id}/graphics` creates real image files, made with Pillow:
  - solid colour
  - gradient
  - vignette
  - light leak
- **Export**: render one or several shapes, each as its own sequence ("<name> · 4:5"). Renders queue politely when the
  workspace's render slots are busy. Download each file, or all of them as a ZIP (`POST /exports/zip` → `export.zip` worker job).

## Editing
- **On the canvas**:
  - Drag to move. The background never moves with the foreground unless you move it.
  - Corner handles scale and keep the shape. Edge handles change the frame; media is re-cropped, never stretched.
  - Moves snap to the centre, the edges, the safe area and other layers. Hold Alt to turn snapping off.
- **Keyboard**: arrow keys nudge 0.5% (Shift: 5%). Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes, Delete removes the
  layer, Space plays, Ctrl+S saves.
- **Inspector**:
  - position, size, scale, rotation, opacity, align buttons and reset
  - fit, zoom and focus point, including "Focus on the detected face"
  - volume
  - blur, brightness, contrast, saturation, corners, border, shadow, mirror
  - text: size, colour, box, alignment, outline, shadow
  - animation (in, out, duration, slow zoom)
  - timing, and position keyframes at the playhead
- **Layer timeline**:
  - per layer: rename, hide, lock, duplicate, delete
  - reorder by dragging or with the up/down buttons
  - move or trim bars on the timeline
  - seek, step frame by frame, play
- **Full editor**: split, ripple delete, colour wheels, curves and LUTs, transitions, per-clip speed, captions and dubbing.
  The studio warns when a sequence was changed there afterwards, because the studio rebuilds sequences from their layout.

## Tests
- `frontend/src/compose.test.ts` (44 tests):
  - geometry (cover and contain, no stretch, subject kept in view)
  - every style on every ratio
  - templates and categories
  - ratio changes keeping hand-placed layers
  - template slots
  - suggestions
- `backend/tests/test_composition_matrix.py`: **36 real FFmpeg renders**, 6 styles × 6 ratios, compiled by the browser's composer
  (fixture `tests/fixtures/compositions/matrix.json`). Each is checked with ffprobe (size, duration) and frame sampling.
  Regenerate the fixture with `WRITE_FIXTURES=1 npx vitest run src/compose.test.ts`.
- `backend/tests/test_clip_fx.py`: rounded corners, border and shadow, blur, mirror, wide crops, text styles. Measured on real
  frames.
- `backend/tests/test_compose_api.py`:
  - new formats
  - composition saved with the sequence
  - generated graphics
  - template create, read, update, delete and workspace isolation
  - ZIP of real exports
- `e2e/shorts.mjs` (16 browser steps) covers the whole flow:
  1. Upload, then create the short.
  2. Drag the foreground up while the background stays put.
  3. Nudge, undo and redo.
  4. Switch through all 6 ratios and a custom size.
  5. Stack a second video.
  6. Add text.
  7. Reorder, hide, lock, duplicate and delete layers.
  8. Add keyframes.
  9. Apply templates; save, favourite and delete one.
  10. Apply an AI suggestion.
  11. Apply a background and effects.
  12. Check the Shorts preview never reaches the timeline.
  13. Reload.
  14. Compare preview and export pixels.
  15. Batch-export 3 shapes and download the ZIP.
  16. Check mobile width.

## Not built yet (honest list)
- Motion tracking (the crop follows the median face position; it doesn't track movement frame by frame) and stabilization
  inside the studio (stabilization exists in the editor's Video tools).
- Glow, film grain, directional blur, masks and transitions between stacked panels.
- Per-layer playback speed in the studio (the full editor has clip speed).
- Lyrics sync. Text is typed or pasted; auto-captions are in the editor.
