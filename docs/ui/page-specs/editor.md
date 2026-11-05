# Editor (`/edit/:projectId`) — follows EDITOR-MASTER reference
**Layout 1440×900:** top bar 56px (brand, studio tabs — only *Edit* live, others "planned" and inert —, project name, undo/redo, real save status, Export, account) · body: Media bin (≈300px) | Program viewer (flex) | Inspector/Export/History panel (≈330px) · timeline ≈34vh full width.
**Primary action:** Export video.
**States:** loading spinner; empty bin (drag-drop hint + formats); per-file upload progress/cancel/error; processing overlay with real worker stage + %; rejected/failed with reason + retry; empty timeline ("Add media…"); missing media clips striped red; save: saved vN / unsaved / saving / offline-retrying / failed / conflict banner; view-only role disables editing.
**Mobile (≤900px):** stacked viewer → bin → panel → scrollable timeline.
**Deviations from reference (intentional):** AI Creative Assistant and Translate & Voice panels are not shown as working (shown as "Soon" note) because they don't exist yet; resolution/FPS selectors show only what the render worker supports.
