from typing import Dict


def prepare_social_post(upload_id: int, title: str, description: str, hashtags: list[str]) -> Dict[str, object]:
    return {
        "upload_id": upload_id,
        "title": title,
        "description": description,
        "hashtags": hashtags,
        "status": "draft",
    }


def schedule_upload(platform: str, payload: Dict[str, object]) -> Dict[str, object]:
    return {
        "platform": platform,
        "status": "queued",
        "payload": payload,
    }
