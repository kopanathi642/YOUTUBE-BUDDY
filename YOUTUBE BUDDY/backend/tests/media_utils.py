"""Utilities for creating test media files."""
import subprocess
from pathlib import Path
from typing import Optional
import json


def create_test_video(
    output_path: str,
    duration: int = 10,
    width: int = 1920,
    height: int = 1080,
    fps: int = 30,
) -> bool:
    """
    Create a test video file using ffmpeg.
    
    Args:
        output_path: Path to output video file
        duration: Video duration in seconds
        width: Video width in pixels
        height: Video height in pixels
        fps: Frames per second
    
    Returns:
        True if successful, False otherwise
    """
    try:
        cmd = [
            "ffmpeg",
            "-f", "lavfi",
            "-i", f"testsrc=duration={duration}:size={width}x{height}:rate={fps}",
            "-f", "lavfi",
            "-i", f"sine=frequency=1000:duration={duration}",
            "-pix_fmt", "yuv420p",
            "-y",  # Overwrite output
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        return result.returncode == 0
    except Exception as e:
        print(f"Error creating test video: {e}")
        return False


def create_test_audio(
    output_path: str,
    duration: int = 5,
    frequency: int = 1000,
) -> bool:
    """
    Create a test audio file using ffmpeg.
    
    Args:
        output_path: Path to output audio file
        duration: Audio duration in seconds
        frequency: Sine wave frequency in Hz
    
    Returns:
        True if successful, False otherwise
    """
    try:
        cmd = [
            "ffmpeg",
            "-f", "lavfi",
            "-i", f"sine=frequency={frequency}:duration={duration}",
            "-q:a", "9",
            "-acodec", "libmp3lame",
            "-y",  # Overwrite output
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        return result.returncode == 0
    except Exception as e:
        print(f"Error creating test audio: {e}")
        return False


def create_test_srt_file(output_path: str) -> bool:
    """Create a test SRT subtitle file."""
    try:
        srt_content = """1
00:00:00,000 --> 00:00:03,000
This is the first subtitle.

2
00:00:03,000 --> 00:00:06,000
This is the second subtitle.

3
00:00:06,000 --> 00:00:10,000
This is the third subtitle with some action.
"""
        Path(output_path).write_text(srt_content)
        return True
    except Exception as e:
        print(f"Error creating test SRT: {e}")
        return False


def create_test_vtt_file(output_path: str) -> bool:
    """Create a test VTT subtitle file."""
    try:
        vtt_content = """WEBVTT

00:00:00.000 --> 00:00:03.000
This is the first subtitle.

00:00:03.000 --> 00:00:06.000
This is the second subtitle.

00:00:06.000 --> 00:00:10.000
This is the third subtitle with some action.
"""
        Path(output_path).write_text(vtt_content)
        return True
    except Exception as e:
        print(f"Error creating test VTT: {e}")
        return False


def extract_audio_from_video(
    video_path: str,
    output_path: str,
    format: str = "mp3",
) -> bool:
    """
    Extract audio from video file.
    
    Args:
        video_path: Path to input video
        output_path: Path to output audio file
        format: Output format (mp3, wav, aac)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        codec_map = {
            "mp3": "libmp3lame",
            "wav": "pcm_s16le",
            "aac": "aac",
        }
        codec = codec_map.get(format, "libmp3lame")
        
        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-vn",  # No video
            "-acodec", codec,
            "-q:a", "9",
            "-y",  # Overwrite output
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        return result.returncode == 0
    except Exception as e:
        print(f"Error extracting audio: {e}")
        return False


def get_video_duration(video_path: str) -> Optional[float]:
    """Get duration of video file in seconds."""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1:csv=p=0",
            video_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return float(result.stdout.strip())
    except Exception as e:
        print(f"Error getting video duration: {e}")
    return None


def create_test_json_transcript(output_path: str) -> bool:
    """Create a test JSON transcript file."""
    try:
        transcript = {
            "text": "This is a test transcript with multiple segments for testing caption generation.",
            "segments": [
                {"start": 0, "end": 3, "text": "This is a test transcript"},
                {"start": 3, "end": 6, "text": "with multiple segments"},
                {"start": 6, "end": 10, "text": "for testing caption generation."},
            ],
        }
        Path(output_path).write_text(json.dumps(transcript, indent=2))
        return True
    except Exception as e:
        print(f"Error creating test transcript: {e}")
        return False
