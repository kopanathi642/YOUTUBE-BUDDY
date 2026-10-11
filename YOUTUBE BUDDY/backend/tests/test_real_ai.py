"""
Real AI integration tests — makes actual API calls.

Tests marked with @pytest.mark.live require:
  - OPENAI_API_KEY set in environment
  - HUGGINGFACE_API_KEY set (for HF tests)
  - ffmpeg installed (for video tests)

Run with: pytest tests/test_real_ai.py -v -m live
Skip with: pytest tests/test_real_ai.py -v -m "not live"
"""
import os
import json
import pytest
from pathlib import Path

# Skip all tests if no API key
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
HF_KEY = os.getenv("HUGGINGFACE_API_KEY", "")
HAS_OPENAI = bool(OPENAI_KEY and OPENAI_KEY.startswith("sk-"))
HAS_HF = bool(HF_KEY)

live = pytest.mark.live
skip_no_openai = pytest.mark.skipif(not HAS_OPENAI, reason="OPENAI_API_KEY not set")
skip_no_hf = pytest.mark.skipif(not HAS_HF, reason="HUGGINGFACE_API_KEY not set")


# ── OpenAI Text Completion ──────────────────────────────────────────────────

@live
@skip_no_openai
def test_openai_text_completion():
    """Test real OpenAI chat completion API call."""
    from app.utils.openai_client import response_text

    result = response_text(
        "List 3 trending YouTube video ideas for a tech channel. Return as JSON array.",
        system="You are a YouTube content strategist.",
        max_tokens=300,
    )

    assert result is not None
    assert len(result) > 20
    print(f"\n✓ OpenAI text completion ({len(result)} chars):\n{result[:200]}...")


@live
@skip_no_openai
def test_openai_structured_json_output():
    """Test that OpenAI returns parseable JSON when asked."""
    from app.utils.openai_client import response_text

    result = response_text(
        "Generate YouTube metadata for a cooking tutorial. "
        "Return strict JSON with keys: title, description, tags (array), hashtags (array).",
        system="You are a YouTube SEO expert. Always return valid JSON.",
        max_tokens=500,
    )

    # Try to parse as JSON
    clean = result.strip()
    if clean.startswith("```"):
        clean = clean.strip("`")
        if clean.lower().startswith("json"):
            clean = clean[4:].strip()

    parsed = json.loads(clean)
    assert isinstance(parsed, dict)
    assert "title" in parsed or "tags" in parsed
    print(f"\n✓ OpenAI JSON output: {json.dumps(parsed, indent=2)[:300]}...")


# ── OpenAI Image Generation ─────────────────────────────────────────────────

@live
@skip_no_openai
def test_openai_image_generation():
    """Test real DALL·E / gpt-image-1 image generation."""
    from app.utils.openai_client import generate_image

    result = generate_image(
        "A cinematic YouTube thumbnail showing a glowing laptop on a dark desk "
        "with dramatic blue and orange lighting, ultra detailed, 4K"
    )

    assert result is not None
    assert result.startswith("http") or result.startswith("data:image")
    print(f"\n✓ OpenAI image generated: {result[:100]}...")


@live
@skip_no_openai
def test_openai_image_download():
    """Test generating and downloading an image to disk."""
    from app.utils.openai_client import generate_image, download_image

    url = generate_image(
        "Professional moodboard for a tech YouTube channel, clean minimal design"
    )

    output_dir = Path(__file__).parent / "fixtures" / "rendered"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(output_dir / "test_generated_image.png")

    local_path = download_image(url, output_path)
    assert Path(local_path).exists()
    assert Path(local_path).stat().st_size > 1000  # Should be a real image
    print(f"\n✓ Image downloaded to {local_path} ({Path(local_path).stat().st_size} bytes)")


# ── OpenAI Whisper Transcription ─────────────────────────────────────────────

@live
@skip_no_openai
def test_openai_whisper_transcription():
    """Test real Whisper transcription — requires a test audio file."""
    from tests.media_utils import create_test_audio

    audio_dir = Path(__file__).parent / "fixtures"
    audio_path = str(audio_dir / "test_audio.mp3")

    # Create a test audio file with ffmpeg
    if not Path(audio_path).exists():
        success = create_test_audio(audio_path, duration=3)
        if not success:
            pytest.skip("ffmpeg not available to create test audio")

    from app.utils.openai_client import transcribe_audio_file

    result = transcribe_audio_file(audio_path, language="en")

    assert isinstance(result, dict)
    assert "text" in result or "segments" in result
    print(f"\n✓ Whisper transcription: {result.get('text', '')[:200]}...")


# ── Studio Tool Prompts ──────────────────────────────────────────────────────

@live
@skip_no_openai
def test_studio_script_generation():
    """Test real script generation with production prompt templates."""
    from app.services.ai_generation import generate_script

    result = generate_script(
        "How AI is changing YouTube content creation in 2025",
        duration="8",
        style="educational",
    )

    assert "raw" in result
    assert "parsed" in result
    assert len(result["raw"]) > 100
    print(f"\n✓ Script generated ({len(result['raw'])} chars)")
    print(f"  Parsed keys: {list(result['parsed'].keys())[:5]}...")


@live
@skip_no_openai
def test_studio_seo_generation():
    """Test real SEO package generation."""
    from app.services.ai_generation import generate_seo_package

    result = generate_seo_package("Python programming tutorial for beginners")

    assert "parsed" in result
    parsed = result["parsed"]
    print(f"\n✓ SEO package generated")
    print(f"  Keys: {list(parsed.keys())}")


@live
@skip_no_openai
def test_studio_trend_analysis():
    """Test real trend analysis."""
    from app.services.ai_generation import generate_trend_report

    result = generate_trend_report("Gaming and tech review channel")

    assert "parsed" in result
    print(f"\n✓ Trend report generated ({len(result['raw'])} chars)")


@live
@skip_no_openai
def test_studio_image_with_template():
    """Test image generation using professional prompt templates."""
    from app.services.ai_generation import generate_image_from_prompt

    result = generate_image_from_prompt(
        "A futuristic gaming setup with RGB lighting",
        provider="openai",
        tool_id="cineshot",
        style="cinematic",
        aspect_ratio="16:9",
    )

    assert result is not None
    assert result.startswith("http") or result.startswith("data:image")
    print(f"\n✓ Templated image generated: {result[:80]}...")


# ── Agent Pipeline Tests ─────────────────────────────────────────────────────

@live
@skip_no_openai
def test_trend_agent_pipeline():
    """Test the full trend agent pipeline."""
    from app.services.agent_manager import run_trend_agent

    result = run_trend_agent("Fitness and health YouTube channel")

    assert isinstance(result, dict)
    assert "raw" in result or "parsed" in result
    print(f"\n✓ Trend agent completed")


@live
@skip_no_openai
def test_script_agent_pipeline():
    """Test the full script agent pipeline."""
    from app.services.agent_manager import run_script_agent

    result = run_script_agent("Top 10 productivity apps for students")

    assert isinstance(result, dict)
    print(f"\n✓ Script agent completed ({len(str(result))} chars)")


@live
@skip_no_openai
def test_seo_agent_pipeline():
    """Test the full SEO agent pipeline."""
    from app.services.agent_manager import run_seo_agent

    result = run_seo_agent("How to edit YouTube videos like a pro")

    assert isinstance(result, dict)
    print(f"\n✓ SEO agent completed")


# ── HuggingFace Tests ────────────────────────────────────────────────────────

@live
@skip_no_hf
def test_huggingface_text_generation():
    """Test real HuggingFace text generation."""
    from app.utils.huggingface_client import generate_text

    result = generate_text(
        "Generate 3 YouTube video title ideas for a cooking channel:",
        max_new_tokens=100,
    )

    assert result is not None
    assert len(result) > 5
    print(f"\n✓ HF text generated: {result[:150]}...")


@live
@skip_no_hf
def test_huggingface_image_generation():
    """Test real HuggingFace Stable Diffusion image generation."""
    from app.utils.huggingface_client import generate_image

    result = generate_image(
        "Professional YouTube thumbnail, vibrant colors, text overlay space",
        negative_prompt="blurry, low quality, watermark",
    )

    assert result is not None
    assert result.startswith("data:image") or len(result) > 100
    print(f"\n✓ HF image generated: {result[:80]}...")
