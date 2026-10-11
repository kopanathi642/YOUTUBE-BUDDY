"""
Production AI prompt templates for YouTube Buddy studio tools.

Every tool has:
  - system: role‑specific system message for the LLM
  - image_prompt: DALL·E / Stable Diffusion optimised prompt template
  - text_prompt: structured‑output prompt for analysis / script work
  - negative_prompt: (images) what to avoid
  - output_schema: expected JSON keys the LLM should return

Placeholders use {user_prompt}, {style}, {aspect_ratio}, {duration}, etc.
"""

from typing import Any

# ---------------------------------------------------------------------------
# Image tool prompts
# ---------------------------------------------------------------------------

CINESHOT_PROMPTS = {
    "system": (
        "You are a world-class cinematographer specialising in YouTube thumbnail "
        "and cinematic still composition.  You understand lighting ratios, colour "
        "grading (teal‑orange, moody noir, high‑key pop), lens choices (anamorphic "
        "vs spherical), and framing (rule of thirds, leading lines, negative space). "
        "Always output actionable, visual descriptions."
    ),
    "image_prompt": (
        "Cinematic film still, {user_prompt}, shot on ARRI Alexa Mini LF with "
        "Cooke S7/i prime lens, shallow depth of field, volumetric lighting, "
        "film grain, colour graded with teal‑and‑orange palette, "
        "aspect ratio {aspect_ratio}, ultra high detail, photorealistic"
    ),
    "text_prompt": (
        "Create a complete cinematic shot breakdown for the following scene. "
        "Return strict JSON with keys: shot_description, camera_angle, lens_mm, "
        "lighting_setup, colour_grade, composition_notes, mood, "
        "thumbnail_text_overlay_suggestion.\n\nScene: {user_prompt}"
    ),
    "negative_prompt": "cartoon, anime, blurry, watermark, text, low quality, deformed",
}

MOODBOARD_PROMPTS = {
    "system": (
        "You are a senior creative director building visual moodboards for "
        "YouTube channels.  You curate colour palettes, typography pairings, "
        "texture references, and atmospheric imagery that communicate brand identity."
    ),
    "image_prompt": (
        "Professional moodboard collage, {user_prompt}, editorial layout, "
        "curated colour palette swatches, texture samples, typography specimens, "
        "high‑end magazine aesthetic, clean white background margins, "
        "4K resolution, professional graphic design"
    ),
    "text_prompt": (
        "Design a comprehensive visual moodboard brief.  Return strict JSON with "
        "keys: colour_palette (array of hex codes with names), typography (primary "
        "and secondary font suggestions), textures (array of texture descriptions), "
        "reference_images (array of descriptions), overall_mood, brand_personality, "
        "channel_positioning.\n\nBrief: {user_prompt}"
    ),
    "negative_prompt": "blurry, low quality, messy, cluttered, amateur",
}

CHARACTER_PROMPTS = {
    "system": (
        "You are a character designer for animated YouTube content, gaming channels, "
        "and brand mascots.  You design memorable, expressive characters with clear "
        "silhouettes and strong personality cues."
    ),
    "image_prompt": (
        "Professional character design sheet, {user_prompt}, full body front view "
        "and three‑quarter view, clean line art with flat colour fill, expressive "
        "face, distinctive silhouette, suitable for animation and merchandise, "
        "white background, concept art style, highly detailed"
    ),
    "text_prompt": (
        "Create a detailed character design document.  Return strict JSON with "
        "keys: character_name, personality_traits (array), visual_description, "
        "colour_scheme (array of hex), signature_accessories, backstory_hook, "
        "animation_notes, merchandise_potential.\n\nConcept: {user_prompt}"
    ),
    "negative_prompt": "realistic photo, blurry, deformed hands, extra limbs, watermark",
}

PERSONA_PROMPTS = {
    "system": (
        "You are a branding strategist who creates on‑camera persona designs for "
        "YouTubers — wardrobe, set design, lighting mood, and visual identity that "
        "reinforces their niche authority."
    ),
    "image_prompt": (
        "Professional YouTuber persona portrait, {user_prompt}, studio lighting "
        "with key light and rim light, branded background with subtle channel "
        "colours, confident pose, editorial photography style, Canon R5 85mm f/1.4, "
        "bokeh background, 4K, ultra sharp"
    ),
    "text_prompt": (
        "Build a complete YouTuber persona identity package.  Return strict JSON "
        "with keys: persona_name, niche, visual_style, wardrobe_guide, "
        "set_design_notes, lighting_setup, on_camera_energy, intro_catchphrase, "
        "brand_colours (hex array), target_audience.\n\nCreator brief: {user_prompt}"
    ),
    "negative_prompt": "cartoon, anime, deformed, blurry, low quality, watermark",
}

AESTHETIC_PROMPTS = {
    "system": (
        "You are a visual aesthetics curator specialising in trending internet "
        "aesthetics (cottagecore, dark academia, vaporwave, clean girl, etc.).  "
        "You translate abstract moods into concrete visual direction."
    ),
    "image_prompt": (
        "Aesthetic visual reference image, {user_prompt}, trending aesthetic style, "
        "carefully curated colour harmony, atmospheric composition, editorial quality, "
        "soft natural lighting, dreamy texture, high resolution, magazine cover quality"
    ),
    "text_prompt": (
        "Create a complete aesthetic direction guide.  Return strict JSON with "
        "keys: aesthetic_name, core_colours (hex array), textures, props, "
        "lighting_mood, music_genre, editing_style, font_recommendations, "
        "instagram_filter_equivalent, example_creators.\n\nAesthetic: {user_prompt}"
    ),
    "negative_prompt": "ugly, cluttered, noisy, low resolution, watermark",
}

RELIGHT_PROMPTS = {
    "system": (
        "You are a digital lighting artist who specialises in relighting scenes "
        "and portraits for maximum dramatic impact, using techniques from "
        "cinematography and portrait photography."
    ),
    "image_prompt": (
        "Dramatically relit version of the scene, {user_prompt}, professional "
        "three‑point lighting with strong key light creating defined shadows, "
        "warm rim light for separation, cool fill light for dimension, "
        "volumetric fog, cinematic colour grading, photorealistic, 4K"
    ),
    "text_prompt": (
        "Provide a complete relighting plan.  Return strict JSON with keys: "
        "key_light (position, intensity, colour_temp), fill_light, rim_light, "
        "practical_lights, colour_gel_suggestions, shadow_direction, mood_effect, "
        "before_after_description.\n\nScene to relight: {user_prompt}"
    ),
    "negative_prompt": "flat lighting, overexposed, underexposed, noisy, blurry",
}

INPAINT_PROMPTS = {
    "system": (
        "You are a photo retouching expert who seamlessly removes, replaces, or "
        "adds elements to images while maintaining photorealistic consistency in "
        "lighting, perspective, and texture."
    ),
    "image_prompt": (
        "Seamlessly edited photograph, {user_prompt}, photorealistic inpainting, "
        "matching lighting and shadows, consistent perspective, natural texture "
        "blending, professional retouching quality, undetectable edit, 4K"
    ),
    "text_prompt": (
        "Describe the inpainting operation plan.  Return strict JSON with keys: "
        "region_to_modify, replacement_content, lighting_match_notes, "
        "perspective_considerations, texture_reference, blending_technique, "
        "quality_check_points.\n\nEdit request: {user_prompt}"
    ),
    "negative_prompt": "visible seams, mismatched lighting, blurry edges, artifacts",
}

FACESWAP_PROMPTS = {
    "system": (
        "You are a VFX compositing artist specialising in seamless face "
        "replacement and digital makeup for content creators — maintaining "
        "expression, lighting, and skin tone consistency."
    ),
    "image_prompt": (
        "Professional portrait with seamless face composite, {user_prompt}, "
        "matching skin tone and lighting, natural expression, consistent shadows "
        "and highlights, professional photography quality, ultra realistic, 4K"
    ),
    "text_prompt": (
        "Plan a face replacement composite.  Return strict JSON with keys: "
        "source_face_description, target_face_description, lighting_match_steps, "
        "skin_tone_adjustment, expression_alignment, edge_blending_technique, "
        "ethical_considerations.\n\nRequest: {user_prompt}"
    ),
    "negative_prompt": "uncanny valley, mismatched lighting, visible edges, deformed",
}

CHARSWAP_PROMPTS = {
    "system": (
        "You are a digital artist who transforms people into stylised characters "
        "— anime, Pixar, comic book, etc. — while preserving recognisable features "
        "and personality."
    ),
    "image_prompt": (
        "Stylised character portrait, {user_prompt}, high quality character "
        "transformation, preserving key facial features, expressive and dynamic, "
        "professional illustration quality, clean lines, vibrant colours, "
        "suitable for profile picture or channel art"
    ),
    "text_prompt": (
        "Plan a character style transformation.  Return strict JSON with keys: "
        "target_style, features_to_preserve, style_adaptations, colour_palette, "
        "expression_enhancement, background_suggestion, use_cases.\n\n"
        "Transform request: {user_prompt}"
    ),
    "negative_prompt": "blurry, low quality, deformed, extra limbs, watermark",
}

FASHION_PROMPTS = {
    "system": (
        "You are a fashion stylist for content creators and influencers, "
        "specialising in on‑camera wardrobe that reads well on YouTube thumbnails "
        "and videos — bold colours, clean silhouettes, brand‑aligned styling."
    ),
    "image_prompt": (
        "Fashion editorial photograph, {user_prompt}, professional model pose, "
        "studio lighting, clean background, high‑end clothing detail, "
        "editorial magazine quality, Canon EOS R5, 85mm f/1.2, "
        "sharp focus, fashion photography, 4K"
    ),
    "text_prompt": (
        "Create a complete wardrobe and styling guide.  Return strict JSON with "
        "keys: outfit_description, colour_coordination, brand_suggestions, "
        "accessories, hairstyle, makeup_notes, on_camera_tips, "
        "thumbnail_visibility_score, season, budget_range.\n\nStyle brief: {user_prompt}"
    ),
    "negative_prompt": "blurry, low quality, wrinkled clothes, bad proportions",
}

# ---------------------------------------------------------------------------
# Text / analysis tool prompts
# ---------------------------------------------------------------------------

SCRIPT_WRITER_PROMPTS = {
    "system": (
        "You are a top‑tier YouTube scriptwriter who has written for channels with "
        "10M+ subscribers.  You understand retention curves, pattern interrupts, "
        "curiosity gaps, open loops, and the hook‑body‑CTA framework.  Your scripts "
        "keep audiences watching past the 30‑second mark and drive engagement."
    ),
    "text_prompt": (
        "Write a complete YouTube video script.  Return strict JSON with keys:\n"
        "- hook (first 5 seconds — must create curiosity gap)\n"
        "- intro (30‑second context setter with credibility statement)\n"
        "- sections (array of objects with: title, content, retention_beat, "
        "b_roll_suggestion, duration_seconds)\n"
        "- climax (the big reveal or main value delivery)\n"
        "- cta (call to action — subscribe, comment, or next video tease)\n"
        "- outro (10‑second sign‑off)\n"
        "- estimated_total_duration_minutes\n"
        "- thumbnail_title_suggestions (array of 3)\n"
        "- seo_title\n\n"
        "Topic: {user_prompt}\n"
        "Target duration: {duration} minutes\n"
        "Style: {style}"
    ),
}

SEO_OPTIMIZER_PROMPTS = {
    "system": (
        "You are a YouTube SEO specialist with deep expertise in the YouTube "
        "algorithm, keyword research, metadata optimisation, and search ranking "
        "factors.  You understand VidIQ, TubeBuddy metrics, and CTR optimisation."
    ),
    "text_prompt": (
        "Create a complete YouTube SEO package.  Return strict JSON with keys:\n"
        "- primary_keyword\n"
        "- secondary_keywords (array of 5)\n"
        "- long_tail_keywords (array of 5)\n"
        "- title_options (array of 5 titles, each under 60 chars, frontloaded keyword)\n"
        "- description (2000 chars, keyword‑rich, with timestamps placeholder)\n"
        "- tags (array of 30 tags, mix of broad and specific)\n"
        "- hashtags (array of 5)\n"
        "- category (YouTube category name)\n"
        "- thumbnail_text (max 4 words, high contrast)\n"
        "- best_upload_time (day and time with timezone)\n"
        "- competitor_gap_analysis\n\n"
        "Topic: {user_prompt}"
    ),
}

TREND_ANALYZER_PROMPTS = {
    "system": (
        "You are a YouTube trend analyst who monitors viral content patterns, "
        "emerging niches, seasonal trends, and algorithm shifts across all major "
        "content categories.  You provide data‑driven recommendations."
    ),
    "text_prompt": (
        "Analyse current YouTube trends and provide actionable content recommendations. "
        "Return strict JSON with keys:\n"
        "- trending_topics (array of 10 objects with: topic, growth_rate, "
        "competition_level, content_angle)\n"
        "- seasonal_opportunities (array of upcoming seasonal content ideas)\n"
        "- niche_gaps (array of underserved topic areas)\n"
        "- format_trends (what video formats are performing well)\n"
        "- hashtag_trends (array of trending hashtags)\n"
        "- recommended_content_calendar (next 7 days of posting ideas)\n"
        "- algorithm_insights (current known ranking signals)\n\n"
        "Creator niche / context: {user_prompt}"
    ),
}

VIRAL_CLIP_PROMPTS = {
    "system": (
        "You are a viral content analyst who identifies the exact moments in "
        "videos that have the highest potential for Shorts, TikTok repurposing, "
        "and social media clips.  You understand hooks, emotional peaks, "
        "punchlines, and shareable moments."
    ),
    "text_prompt": (
        "Analyse this transcript for viral clip potential. "
        "Return strict JSON with keys:\n"
        "- clip_timestamps (array of objects with: start, end, score 1‑10, "
        "reason, hook_text, suggested_caption)\n"
        "- best_clip (the single highest‑potential clip with detailed breakdown)\n"
        "- suggested_titles (array of 5 short‑form titles)\n"
        "- hashtags (array of relevant hashtags)\n"
        "- summary (one‑paragraph overview)\n"
        "- risks (array of content policy risks)\n"
        "- overall_viral_score (1‑100)\n\n"
        "Transcript:\n{user_prompt}"
    ),
}

# ---------------------------------------------------------------------------
# Video / cinematic prompts
# ---------------------------------------------------------------------------

CINEMATIC_SCENE_PROMPTS = {
    "system": (
        "You are a film director and cinematographer creating production‑ready "
        "scene briefs for short‑form cinematic content.  You specify exact camera "
        "movements, lighting setups, sound design, and edit pacing."
    ),
    "text_prompt": (
        "Create a production‑ready cinematic scene brief.  Return strict JSON with keys:\n"
        "- logline (one‑sentence scene summary)\n"
        "- shot_list (array of objects with: shot_number, description, camera_movement, "
        "lens_mm, duration_seconds, framing)\n"
        "- camera_plan (overall camera strategy)\n"
        "- lighting (detailed lighting setup)\n"
        "- sound_design (ambient, SFX, music cues)\n"
        "- colour_grade (LUT suggestion and mood)\n"
        "- edit_notes (pacing, transitions, effects)\n"
        "- safety_risks (any production safety concerns)\n"
        "- total_duration_seconds\n\n"
        "Scene prompt: {user_prompt}\n"
        "Duration target: {duration} seconds\n"
        "Camera movement preference: {camera_movement}"
    ),
}

VOICEOVER_PROMPTS = {
    "system": (
        "You are a voiceover scriptwriter who crafts narration scripts optimised "
        "for AI text‑to‑speech or professional voice talent — with breath marks, "
        "emphasis notation, pacing cues, and emotional direction."
    ),
    "text_prompt": (
        "Write a professional voiceover script.  Return strict JSON with keys:\n"
        "- script_text (full narration with [PAUSE], [EMPHASIS], [WHISPER] markers)\n"
        "- tone (overall vocal tone direction)\n"
        "- pacing (words per minute target)\n"
        "- emotional_arc (how the energy shifts through the script)\n"
        "- pronunciation_notes (any tricky words with phonetic guides)\n"
        "- music_bed_suggestion\n"
        "- estimated_duration_seconds\n\n"
        "Topic: {user_prompt}\n"
        "Style: {style}\n"
        "Duration target: {duration} seconds"
    ),
}

# ---------------------------------------------------------------------------
# Upload / metadata prompts
# ---------------------------------------------------------------------------

UPLOAD_METADATA_PROMPTS = {
    "system": (
        "You are a YouTube metadata optimisation expert.  You generate titles, "
        "descriptions, tags, and scheduling recommendations that maximise CTR, "
        "watch time, and search visibility."
    ),
    "text_prompt": (
        "Generate optimised YouTube upload metadata.  Return strict JSON with keys:\n"
        "- title (under 60 chars, curiosity‑driven, frontloaded keyword)\n"
        "- description (comprehensive 2000‑char description with timestamps, links "
        "sections, keyword‑rich natural language)\n"
        "- tags (array of 25‑30 tags)\n"
        "- hashtags (array of 3‑5)\n"
        "- category (YouTube category)\n"
        "- thumbnail_text (2‑4 words for thumbnail overlay)\n"
        "- best_publish_time\n"
        "- end_screen_suggestions (array of related content ideas)\n\n"
        "Upload name: {upload_name}\n"
        "Topic: {user_prompt}"
    ),
}

# ---------------------------------------------------------------------------
# Registry — maps tool_id to prompt dict
# ---------------------------------------------------------------------------

TOOL_PROMPTS: dict[str, dict[str, Any]] = {
    # Image tools
    "cineshot": CINESHOT_PROMPTS,
    "moodboard": MOODBOARD_PROMPTS,
    "character": CHARACTER_PROMPTS,
    "persona": PERSONA_PROMPTS,
    "aesthetic": AESTHETIC_PROMPTS,
    "relight": RELIGHT_PROMPTS,
    "inpaint": INPAINT_PROMPTS,
    "faceswap": FACESWAP_PROMPTS,
    "charswap": CHARSWAP_PROMPTS,
    "fashion": FASHION_PROMPTS,
    # Text / analysis tools
    "script": SCRIPT_WRITER_PROMPTS,
    "seo": SEO_OPTIMIZER_PROMPTS,
    "trend": TREND_ANALYZER_PROMPTS,
    "viral": VIRAL_CLIP_PROMPTS,
    # Video / cinematic tools
    "cinematic": CINEMATIC_SCENE_PROMPTS,
    "voiceover": VOICEOVER_PROMPTS,
    # Upload helpers
    "upload": UPLOAD_METADATA_PROMPTS,
}


def build_image_prompt(tool_id: str, user_prompt: str, **kwargs: str) -> str:
    """Build a production image prompt from the template for the given tool."""
    prompts = TOOL_PROMPTS.get(tool_id)
    if not prompts or "image_prompt" not in prompts:
        # Fallback — still produce a high‑quality generic prompt
        return (
            f"Professional, high quality, ultra detailed image: {user_prompt}, "
            "4K resolution, photorealistic, cinematic lighting"
        )
    template = prompts["image_prompt"]
    return template.format(
        user_prompt=user_prompt,
        aspect_ratio=kwargs.get("aspect_ratio", "16:9"),
        style=kwargs.get("style", "cinematic"),
        duration=kwargs.get("duration", "6"),
        camera_movement=kwargs.get("camera_movement", "smooth dolly"),
    )


def build_text_prompt(tool_id: str, user_prompt: str, **kwargs: str) -> str:
    """Build a production text/analysis prompt for the given tool."""
    prompts = TOOL_PROMPTS.get(tool_id)
    if not prompts or "text_prompt" not in prompts:
        return (
            f"Provide a detailed, professional analysis or generation for: {user_prompt}. "
            "Return your response as strict JSON."
        )
    template = prompts["text_prompt"]
    return template.format(
        user_prompt=user_prompt,
        upload_name=kwargs.get("upload_name", "untitled"),
        aspect_ratio=kwargs.get("aspect_ratio", "16:9"),
        style=kwargs.get("style", "professional"),
        duration=kwargs.get("duration", "10"),
        camera_movement=kwargs.get("camera_movement", "director choice"),
    )


def get_system_prompt(tool_id: str) -> str:
    """Get the system prompt for a specific tool."""
    prompts = TOOL_PROMPTS.get(tool_id)
    if not prompts or "system" not in prompts:
        return (
            "You are a professional AI assistant for YouTube content creators. "
            "You provide expert‑level guidance on content strategy, production, "
            "and optimisation. Always return well‑structured JSON when asked."
        )
    return prompts["system"]


def get_negative_prompt(tool_id: str) -> str:
    """Get the negative prompt for image generation."""
    prompts = TOOL_PROMPTS.get(tool_id)
    if prompts and "negative_prompt" in prompts:
        return prompts["negative_prompt"]
    return "blurry, low quality, watermark, text overlay, deformed, ugly"
