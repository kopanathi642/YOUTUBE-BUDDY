# AI Generator Universe — 120-tool audit

Generated 2026-11-06T16:07:00.439Z by `e2e/ai_tools_audit.mjs` against a running server.

Every tool page was opened at 1600×1000 and 1366×768. A tool's UI passes only if: its studio's purpose-built workspace renders, **every** control in its registry entry is on screen, it has input and output areas, its status message is honest (ready → run button; needs key → names the exact key; not built → says so), there is no horizontal overflow at either size, and there are no page or server errors.

Every tool that this server can run was then **executed for real** on real media (video, image, music) through the same API the UI uses; compatible outputs were then placed on a timeline with Edit in Timeline.

| Result | Tools |
|---|---|
| UI checks passed | 120 / 120 |
| Executed successfully here | 40 |
| Runnable but blocked in this sandbox (model download from huggingface.co) | 9 |
| Ready once a provider key is added (not executed — no key here) | 69 |
| Not built yet (shown honestly, cannot run) | 2 |
| Failed | 0 |

Hosted-model tools (fal.ai, Claude/OpenAI, YouTube) were not run live here because this build sandbox has no provider keys and no network route to them. Their request building is covered by `backend/tests/test_ai_tools.py` against a simulated provider (text-to-video camera direction, image style/palette, music BPM/instruments, multi-shot film stitching, thumbnail typesetting, script writing, Director Agent, YouTube trends). Each must get one live smoke test after the keys are added.

| ID | Tool | Studio | Engine · models | UI (controls) | Executed here | Timeline | Verdict |
|---|---|---|---|---|---|---|---|
| 001 | Text to Video | A · AI Video Generation | fal · fal-ai/veo3.1, fal-ai/veo3.1/fast +5 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 002 | Image to Video | A · AI Video Generation | fal · fal-ai/kling-video/v3/pro/image-to-video, fal-ai/veo3.1/image-to-video +3 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 003 | First & Last Frame | A · AI Video Generation | fal · fal-ai/kling-video/v3/pro/image-to-video, fal-ai/veo3.1/first-last-frame-to-video | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 004 | Reference to Video | A · AI Video Generation | fal · fal-ai/kling-video/o3/pro/reference-to-video, minimax/h3/reference-to-video +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 005 | Multi-Shot Film Builder | A · AI Video Generation | pipeline · fal-ai/veo3.1, fal-ai/veo3.1/fast +5 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 006 | Talking Avatar | A · AI Video Generation | fal · fal-ai/kling-video/ai-avatar/v2/pro, fal-ai/bytedance/omnihuman/v1.5 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 007 | Video Extend | A · AI Video Generation | pipeline · fal-ai/kling-video/v3/pro/image-to-video, fal-ai/veo3.1/image-to-video +3 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 008 | Product Ad Video | A · AI Video Generation | pipeline · fal-ai/kling-video/v3/pro/image-to-video, fal-ai/veo3.1/image-to-video +3 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 009 | Motion Transfer | A · AI Video Generation | fal · fal-ai/kling-video/v3/pro/motion-control | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 010 | Music to Video | A · AI Video Generation | fal · fal-ai/ltx-2.3/audio-to-video | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 011 | Text to Image | B · AI Image Generation | fal · fal-ai/nano-banana-pro, fal-ai/flux-2-pro +2 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 012 | Thumbnail Generator | B · AI Image Generation | pipeline · fal-ai/nano-banana-pro, fal-ai/flux-2-pro +2 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 013 | Consistent Character | B · AI Image Generation | fal · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 014 | Style Transfer | B · AI Image Generation | fal · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 015 | Poster & Social Post | B · AI Image Generation | fal · fal-ai/nano-banana-pro, openai/gpt-image-2 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 016 | Logo & Icon Concepts | B · AI Image Generation | fal · fal-ai/nano-banana-pro, fal-ai/flux-2-pro +2 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | n/a | 🔑 Ready once key added |
| 017 | Product Photography | B · AI Image Generation | fal · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 018 | Storyboard Frames | B · AI Image Generation | pipeline · fal-ai/nano-banana-pro, fal-ai/flux-2-pro +2 | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY + FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 019 | Pattern & Texture | B · AI Image Generation | fal · fal-ai/nano-banana-pro, fal-ai/flux-2-pro +2 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 020 | Image Variations | B · AI Image Generation | fal · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 021 | Video Restyle | C · AI Video Transformation | fal · fal-ai/kling-video/o3/pro/video-to-video/edit | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 022 | Background Replace | C · AI Video Transformation | local | ✅ all controls | ✅ 126s · 1 file(s) | placed | ✅ Works (executed) |
| 023 | Background Removal | C · AI Video Transformation | local | ✅ all controls | ✅ 122s · 1 file(s) | placed | ✅ Works (executed) |
| 024 | Object Removal | C · AI Video Transformation | fal · fal-ai/kling-video/o3/pro/video-to-video/edit | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 025 | Relight & Weather | C · AI Video Transformation | fal · fal-ai/kling-video/o3/pro/video-to-video/edit | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 026 | Video Upscale | C · AI Video Transformation | fal · fal-ai/bytedance-upscaler/upscale/video | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 027 | Stabilization | C · AI Video Transformation | local | ✅ all controls | ✅ 18s · 1 file(s) | placed | ✅ Works (executed) |
| 028 | Slow Motion & Frame Interpolation | C · AI Video Transformation | local | ✅ all controls | ✅ 598s · 1 file(s) | placed | ✅ Works (executed) |
| 029 | Denoise & Sharpen | C · AI Video Transformation | local | ✅ all controls | ✅ 10s · 1 file(s) | placed | ✅ Works (executed) |
| 030 | Auto Colour Grade | C · AI Video Transformation | local | ✅ all controls | ✅ 10s · 1 file(s) | placed | ✅ Works (executed) |
| 031 | Photo Animate | D · AI Animation | fal · fal-ai/kling-video/v3/pro/image-to-video, fal-ai/veo3.1/image-to-video +3 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 032 | Character Performance | D · AI Animation | fal · fal-ai/kling-video/v3/pro/image-to-video, fal-ai/veo3.1/image-to-video +3 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 033 | Lip Sync | D · AI Animation | fal · fal-ai/sync-lipsync/v3, fal-ai/kling-video/lipsync/audio-to-video | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 034 | Text to 3D Model | D · AI Animation | fal · tripo3d/h3.1/text-to-3d | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | n/a | 🔑 Ready once key added |
| 035 | Image to 3D Model | D · AI Animation | fal · fal-ai/hunyuan-3d/v3.1/pro/image-to-3d, fal-ai/trellis-2 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | n/a | 🔑 Ready once key added |
| 036 | Auto Rig | D · AI Animation | fal · fal-ai/meshy/rigging | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | n/a | 🔑 Ready once key added |
| 037 | Text to Motion | D · AI Animation | fal · fal-ai/hunyuan-motion | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | n/a | 🔑 Ready once key added |
| 038 | Kinetic Typography | D · AI Animation | local | ✅ all controls | ✅ 4s · 1 file(s) | placed | ✅ Works (executed) |
| 039 | Ken Burns & Parallax | D · AI Animation | local | ✅ all controls | ✅ 4s · 1 file(s) | placed | ✅ Works (executed) |
| 040 | Animated Captions | D · AI Animation | local | ✅ all controls | ⚠️ model download blocked in this build sandbox | compatible | ⚠️ Blocked here (model download) |
| 041 | Voice Studio (Text to Speech) | E · AI Audio & Music | local · elevenlabs/tts/eleven-v4, fal-ai/minimax/speech-2.8-hd | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 042 | Music Generator | E · AI Audio & Music | fal · fal-ai/elevenlabs/music | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 043 | Sound Effects | E · AI Audio & Music | fal · fal-ai/elevenlabs/sound-effects/v2 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 044 | Video to Sound | E · AI Audio & Music | fal · mirelo-ai/sfx-v1.5/video-to-audio, sonilo/v1.1/video-to-sound-effects | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 045 | Voice Changer | E · AI Audio & Music | fal · resemble-ai/chatterboxhd/speech-to-speech | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 046 | Stem Splitter | E · AI Audio & Music | fal · fal-ai/demucs | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 047 | Noise Removal | E · AI Audio & Music | local | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 048 | Loudness Mastering | E · AI Audio & Music | local | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 049 | Silence Trimmer | E · AI Audio & Music | local | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 050 | Beat & Tempo Detector | E · AI Audio & Music | local | ✅ all controls | ✅ 2s · result | n/a | ✅ Works (executed) |
| 051 | Script Writer | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 052 | Hook Generator | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 053 | Title Lab | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 054 | Description & Tags | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 055 | Story Structure | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 056 | Dialogue Writer | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 057 | Script to Shot List | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 058 | Prompt Director | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 059 | Social Post Writer | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 060 | Rewrite & Tone Shift | F · AI Creative Writing | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 061 | Scene Breakdown | G · AI Content Intelligence | local | ✅ all controls | ✅ 2s · scenes | n/a | ✅ Works (executed) |
| 062 | Transcript | G · AI Content Intelligence | local | ✅ all controls | ⚠️ model download blocked in this build sandbox | n/a | ⚠️ Blocked here (model download) |
| 063 | Face & People Detection | G · AI Content Intelligence | local | ✅ all controls | ✅ 10s · faces | n/a | ✅ Works (executed) |
| 064 | Ask the Video | G · AI Content Intelligence | fal · fal-ai/video-understanding | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | n/a | 🔑 Ready once key added |
| 065 | Highlight Finder | G · AI Content Intelligence | local | ✅ all controls | ✅ 2s · highlights | n/a | ✅ Works (executed) |
| 066 | Retention Risk Check | G · AI Content Intelligence | local | ✅ all controls | ✅ 2s · retention | n/a | ✅ Works (executed) |
| 067 | Audio Quality Report | G · AI Content Intelligence | local | ✅ all controls | ✅ 2s · audio | n/a | ✅ Works (executed) |
| 068 | Visual Quality Report | G · AI Content Intelligence | local | ✅ all controls | ✅ 2s · visual | n/a | ✅ Works (executed) |
| 069 | Content Safety Check | G · AI Content Intelligence | pipeline · fal-ai/imageutils/nsfw | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | n/a | 🔑 Ready once key added |
| 070 | Chapter Generator | G · AI Content Intelligence | pipeline | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 071 | Channel Analyzer | H · AI Creator Intelligence | youtube | ✅ all controls | — needs YOUTUBE_API_KEY (free Google Cloud key) + ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 072 | Topic Discovery | H · AI Creator Intelligence | youtube | ✅ all controls | — needs YOUTUBE_API_KEY (free Google Cloud key) + ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 073 | Competitor Compare | H · AI Creator Intelligence | youtube | ✅ all controls | — needs YOUTUBE_API_KEY (free Google Cloud key) + ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 074 | Content Opportunity Map | H · AI Creator Intelligence | youtube | ✅ all controls | — needs YOUTUBE_API_KEY (free Google Cloud key) + ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 075 | Trend Explorer | H · AI Creator Intelligence | youtube | ✅ all controls | — needs YOUTUBE_API_KEY (free Google Cloud key) + ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 076 | Title A/B Scorer | H · AI Creator Intelligence | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 077 | Thumbnail A/B Analyzer | H · AI Creator Intelligence | local | ✅ all controls | ✅ 2s · thumb_ab | n/a | ✅ Works (executed) |
| 078 | SEO Analyzer | H · AI Creator Intelligence | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 079 | Content Calendar | H · AI Creator Intelligence | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 080 | Growth Strategy | H · AI Creator Intelligence | youtube | ✅ all controls | — needs YOUTUBE_API_KEY (free Google Cloud key) + ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 081 | Background Remover | I · AI Image Editing | local | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 082 | Inpaint / Erase | I · AI Image Editing | local · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 083 | Outpaint / Expand | I · AI Image Editing | fal · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 084 | Image Upscale | I · AI Image Editing | fal · fal-ai/esrgan | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 085 | Relight | I · AI Image Editing | fal · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 086 | Colour Adjust | I · AI Image Editing | local | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 087 | Edit with Words | I · AI Image Editing | fal · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 088 | Portrait Retouch | I · AI Image Editing | fal · fal-ai/nano-banana-pro/edit, openai/gpt-image-2/edit +1 | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 089 | Background Replace | I · AI Image Editing | local | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 090 | Text on Image | I · AI Image Editing | local | ✅ all controls | ✅ 2s · 1 file(s) | placed | ✅ Works (executed) |
| 091 | Shot Detection to Timeline | J · AI Video Intelligence | local | ✅ all controls | ✅ 2s · 1 sequence(s) | placed | ✅ Works (executed) |
| 092 | Smart Reframe | J · AI Video Intelligence | local | ✅ all controls | ✅ 2s · 1 sequence(s) | placed | ✅ Works (executed) |
| 093 | Auto Cut Silences | J · AI Video Intelligence | local | ✅ all controls | ✅ 2s · 1 sequence(s) | placed | ✅ Works (executed) |
| 094 | Auto Shorts | J · AI Video Intelligence | local | ✅ all controls | ✅ 2s · 1 sequence(s) | placed | ✅ Works (executed) |
| 095 | B-roll Suggestions | J · AI Video Intelligence | pipeline | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 096 | Auto Punch-in | J · AI Video Intelligence | local | ✅ all controls | ✅ 2s · 1 sequence(s) | placed | ✅ Works (executed) |
| 097 | Continuity Check | J · AI Video Intelligence | local | ✅ all controls | ✅ 2s · continuity | n/a | ✅ Works (executed) |
| 098 | Subject Tracking | J · AI Video Intelligence | local | ✅ all controls | ✅ 12s · tracking | n/a | ✅ Works (executed) |
| 099 | Multi-Format Versions | J · AI Video Intelligence | local | ✅ all controls | ✅ 2s · 2 sequence(s) | placed | ✅ Works (executed) |
| 100 | Auto Markers | J · AI Video Intelligence | local | ✅ all controls | ✅ 2s · 1 sequence(s) | placed | ✅ Works (executed) |
| 101 | Transcribe | K · AI Localization | local | ✅ all controls | ⚠️ model download blocked in this build sandbox | n/a | ⚠️ Blocked here (model download) |
| 102 | Translate Subtitles | K · AI Localization | local | ✅ all controls | ⚠️ model download blocked in this build sandbox | n/a | ⚠️ Blocked here (model download) |
| 103 | Subtitle Burn-in | K · AI Localization | local | ✅ all controls | ⚠️ model download blocked in this build sandbox | compatible | ⚠️ Blocked here (model download) |
| 104 | AI Dubbing | K · AI Localization | local | ✅ all controls | ⚠️ model download blocked in this build sandbox | compatible | ⚠️ Blocked here (model download) |
| 105 | Voice-Preserving Dub | K · AI Localization | fal · fal-ai/elevenlabs/dubbing | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 106 | Lip-Synced Dub | K · AI Localization | pipeline · fal-ai/sync-lipsync/v3, fal-ai/kling-video/lipsync/audio-to-video | ✅ all controls | — needs FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 107 | Speaker Diarization | K · AI Localization | unbuilt | ✅ all controls | — Needs a speaker-diarization model (e.g. pyannote) — not integrated yet | n/a | 🔒 Not built (shown honestly) |
| 108 | Multi-Language Pack | K · AI Localization | local | ✅ all controls | ⚠️ model download blocked in this build sandbox | n/a | ⚠️ Blocked here (model download) |
| 109 | Translation Compare | K · AI Localization | pipeline | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 110 | Subtitle Timing Fix | K · AI Localization | local | ✅ all controls | ✅ 2s · subtitles | n/a | ✅ Works (executed) |
| 111 | Workflow Builder | L · AI Creative Automation | pipeline | ✅ all controls | ✅ 12s · workflow | compatible | ✅ Works (executed) |
| 112 | Long Video → Shorts | L · AI Creative Automation | pipeline | ✅ all controls | ⚠️ model download blocked in this build sandbox | compatible | ⚠️ Blocked here (model download) |
| 113 | Faceless Video Maker | L · AI Creative Automation | pipeline | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY + FAL_KEY (fal.ai account — pay per generation) | compatible | 🔑 Ready once key added |
| 114 | Podcast to Clips | L · AI Creative Automation | pipeline | ✅ all controls | ✅ 2s · 1 sequence(s) | placed | ✅ Works (executed) |
| 115 | Auto Localize | L · AI Creative Automation | pipeline | ✅ all controls | ⚠️ model download blocked in this build sandbox | compatible | ⚠️ Blocked here (model download) |
| 116 | Batch Processor | L · AI Creative Automation | pipeline | ✅ all controls | ✅ 2s · batch | compatible | ✅ Works (executed) |
| 117 | Scheduled Workflows | L · AI Creative Automation | unbuilt | ✅ all controls | — Needs a scheduler service (cron worker) — not built yet | n/a | 🔒 Not built (shown honestly) |
| 118 | Approval Gates | L · AI Creative Automation | pipeline | ✅ all controls | ✅ 12s · workflow | compatible | ✅ Works (executed) |
| 119 | Director Agent | L · AI Creative Automation | llm | ✅ all controls | — needs ANTHROPIC_API_KEY or OPENAI_API_KEY | n/a | 🔑 Ready once key added |
| 120 | Workflow Templates | L · AI Creative Automation | pipeline | ✅ all controls | ✅ 2s · templates | n/a | ✅ Works (executed) |

## How the UI differs per studio

Each studio has its own workspace layout and controls built for its job (camera rig and director's monitor; art-direction artboard; before/after split; animation stage with keyframe lane; multitrack audio bench; writer's paper; analysis timeline; strategy dashboard; layered image canvas with mask brush; shot timeline with reframe guide; localization desk; node canvas). Within a studio, the 10 tools share that studio's workspace and each shows only its own controls (for example Image to Video adds a start-frame picker and motion controls; Multi-Shot Film Builder replaces the prompt with a reorderable storyboard). Bespoke one-off layouts exist for the shot builder, lip-sync alignment, mask painting, beat grid, and workflow canvas.
