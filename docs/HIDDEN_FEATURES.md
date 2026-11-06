# Hidden features — come back later

Only features that work right now are shown in the app. Everything below is **built but hidden** because it needs a key
or a model, and **reappears automatically** as soon as that key is added in the hosting settings (no code change).
Two items are not built yet.

## Editor Universe
| Feature | Shows again when | Cost |
|---|---|---|
| Lip Sync (sidebar, Voice panel) | `FAL_KEY` is set (opens AI tool 033) | paid per run |
| Object Removal (sidebar, Quick Actions) | `FAL_KEY` is set (opens AI tool 024) | paid per run |
| Stock Library (sidebar + media bin tab) | `PEXELS_API_KEY` or `PIXABAY_API_KEY` | free |
| Publish to YouTube (export queue, Settings card) | `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` + `TOKEN_ENCRYPTION_KEY` | free |
| Any editor tool whose engine fails its server check | the engine is installed/reachable | — |

Still visible but locked by choice: **Super Universe** (unlock in `frontend/src/universes.ts`).

## AI Generator Universe — 71 of 120 tools hidden

### Needs FAL_KEY (fal.ai account — pay per generation) (44)

| # | Tool | Studio |
|---|---|---|
| 001 | Text to Video | AI Video Generation |
| 002 | Image to Video | AI Video Generation |
| 003 | First & Last Frame | AI Video Generation |
| 004 | Reference to Video | AI Video Generation |
| 005 | Multi-Shot Film Builder | AI Video Generation |
| 006 | Talking Avatar | AI Video Generation |
| 007 | Video Extend | AI Video Generation |
| 008 | Product Ad Video | AI Video Generation |
| 009 | Motion Transfer | AI Video Generation |
| 010 | Music to Video | AI Video Generation |
| 011 | Text to Image | AI Image Generation |
| 012 | Thumbnail Generator | AI Image Generation |
| 013 | Consistent Character | AI Image Generation |
| 014 | Style Transfer | AI Image Generation |
| 015 | Poster & Social Post | AI Image Generation |
| 016 | Logo & Icon Concepts | AI Image Generation |
| 017 | Product Photography | AI Image Generation |
| 019 | Pattern & Texture | AI Image Generation |
| 020 | Image Variations | AI Image Generation |
| 021 | Video Restyle | AI Video Transformation |
| 024 | Object Removal | AI Video Transformation |
| 025 | Relight & Weather | AI Video Transformation |
| 026 | Video Upscale | AI Video Transformation |
| 031 | Photo Animate | AI Animation |
| 032 | Character Performance | AI Animation |
| 033 | Lip Sync | AI Animation |
| 034 | Text to 3D Model | AI Animation |
| 035 | Image to 3D Model | AI Animation |
| 036 | Auto Rig | AI Animation |
| 037 | Text to Motion | AI Animation |
| 042 | Music Generator | AI Audio & Music |
| 043 | Sound Effects | AI Audio & Music |
| 044 | Video to Sound | AI Audio & Music |
| 045 | Voice Changer | AI Audio & Music |
| 046 | Stem Splitter | AI Audio & Music |
| 064 | Ask the Video | AI Content Intelligence |
| 069 | Content Safety Check | AI Content Intelligence |
| 083 | Outpaint / Expand | AI Image Editing |
| 084 | Image Upscale | AI Image Editing |
| 085 | Relight | AI Image Editing |
| 087 | Edit with Words | AI Image Editing |
| 088 | Portrait Retouch | AI Image Editing |
| 105 | Voice-Preserving Dub | AI Localization |
| 106 | Lip-Synced Dub | AI Localization |

### Needs ANTHROPIC_API_KEY or OPENAI_API_KEY (17)

| # | Tool | Studio |
|---|---|---|
| 051 | Script Writer | AI Creative Writing |
| 052 | Hook Generator | AI Creative Writing |
| 053 | Title Lab | AI Creative Writing |
| 054 | Description & Tags | AI Creative Writing |
| 055 | Story Structure | AI Creative Writing |
| 056 | Dialogue Writer | AI Creative Writing |
| 057 | Script to Shot List | AI Creative Writing |
| 058 | Prompt Director | AI Creative Writing |
| 059 | Social Post Writer | AI Creative Writing |
| 060 | Rewrite & Tone Shift | AI Creative Writing |
| 070 | Chapter Generator | AI Content Intelligence |
| 076 | Title A/B Scorer | AI Creator Intelligence |
| 078 | SEO Analyzer | AI Creator Intelligence |
| 079 | Content Calendar | AI Creator Intelligence |
| 095 | B-roll Suggestions | AI Video Intelligence |
| 109 | Translation Compare | AI Localization |
| 119 | Director Agent | AI Creative Automation |

### Needs YOUTUBE_API_KEY (free Google Cloud key) + ANTHROPIC_API_KEY or OPENAI_API_KEY (6)

| # | Tool | Studio |
|---|---|---|
| 071 | Channel Analyzer | AI Creator Intelligence |
| 072 | Topic Discovery | AI Creator Intelligence |
| 073 | Competitor Compare | AI Creator Intelligence |
| 074 | Content Opportunity Map | AI Creator Intelligence |
| 075 | Trend Explorer | AI Creator Intelligence |
| 080 | Growth Strategy | AI Creator Intelligence |

### Needs ANTHROPIC_API_KEY or OPENAI_API_KEY + FAL_KEY (fal.ai account — pay per generation) (2)

| # | Tool | Studio |
|---|---|---|
| 018 | Storyboard Frames | AI Image Generation |
| 113 | Faceless Video Maker | AI Creative Automation |

### Not built yet (2)

| # | Tool | Studio |
|---|---|---|
| 107 | Speaker Diarization | AI Localization |
| 117 | Scheduled Workflows | AI Creative Automation |

