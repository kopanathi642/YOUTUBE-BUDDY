"""
Production AI agent pipelines.

Each agent is a purpose‑built pipeline that calls the AI generation service
with professional prompt templates and returns structured, actionable output.
"""
import logging

from app.services.ai_generation import (
    generate_metadata_for_upload,
    generate_script,
    generate_seo_package,
    generate_trend_report,
    analyze_transcript_for_clips,
)

logger = logging.getLogger(__name__)


def run_trend_agent(context: str, provider: str = "openai") -> dict:
    """
    Trend analysis agent — identifies trending topics, content gaps,
    seasonal opportunities, and algorithm insights for the creator's niche.
    """
    logger.info("Running trend agent | provider=%s", provider)
    result = generate_trend_report(context, provider=provider)
    return result


def run_script_agent(topic: str, provider: str = "openai") -> dict:
    """
    Script generation agent — produces a complete YouTube video script
    with hook, intro, sections with retention beats, climax, CTA, and outro.
    """
    logger.info("Running script agent | topic=%s provider=%s", topic[:60], provider)
    result = generate_script(topic, provider=provider)
    return result


def run_seo_agent(topic: str, provider: str = "openai") -> dict:
    """
    SEO optimisation agent — generates a complete metadata package:
    title options, description, tags, hashtags, category, and
    publish time recommendations.
    """
    logger.info("Running SEO agent | topic=%s provider=%s", topic[:60], provider)
    result = generate_seo_package(topic, provider=provider)
    return result


def run_shorts_agent(upload_name: str, provider: str = "openai") -> dict:
    """
    Shorts / viral clip agent — analyses content for viral potential
    and recommends clip timestamps, titles, and hashtags.
    """
    logger.info("Running shorts agent | upload=%s provider=%s", upload_name, provider)
    result = analyze_transcript_for_clips(upload_name, provider=provider)
    return result


def run_upload_agent(context: str, provider: str = "openai") -> dict:
    """
    Upload metadata agent — generates optimised title, description,
    tags, and scheduling recommendations for a new upload.
    """
    logger.info("Running upload agent | provider=%s", provider)
    result = generate_metadata_for_upload("new-upload", context, provider=provider)
    return result
