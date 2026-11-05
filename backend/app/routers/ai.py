"""Which AI capabilities are actually available. The UI enables an AI action only when it reports `ready`."""
import os

from fastapi import APIRouter, Depends

from ..models import User
from ..security import current_user

router = APIRouter(prefix="/ai", tags=["ai"])

BUILT_IN = "Built in (runs on the cloud worker, no extra cost)"

CAPABILITIES = [
    # id, label, built-in?, env var(s) that enable a provider, what is needed
    ("scene_detect", "Scene detection", True, (), BUILT_IN),
    ("silence_remove", "Silence removal", True, (), BUILT_IN),
    ("auto_color", "Auto colour & exposure", True, (), BUILT_IN),
    ("loudness", "Audio level / loudness", True, (), BUILT_IN),
    ("smart_reframe", "Smart reframe (9:16, 1:1, 4:5)", True, (), BUILT_IN + " — static subject-centred crop"),
    ("transcribe", "Speech to text / captions", False, ("OPENAI_API_KEY", "DEEPGRAM_API_KEY"), "Speech-to-text provider key (OpenAI Whisper or Deepgram)"),
    ("translate", "Translation", False, ("OPENAI_API_KEY", "GOOGLE_TRANSLATE_API_KEY"), "Translation provider key (OpenAI or Google Cloud Translation)"),
    ("tts", "AI voice / text to speech", False, ("ELEVENLABS_API_KEY", "OPENAI_API_KEY"), "Voice provider key (ElevenLabs or OpenAI TTS)"),
    ("dubbing", "Translate & dub", False, ("ELEVENLABS_API_KEY",), "ElevenLabs key (dubbing) + consent workflow"),
    ("lip_sync", "Lip sync", False, ("SYNC_API_KEY", "REPLICATE_API_TOKEN"), "Lip-sync model provider (e.g. sync.so or Replicate GPU) + consent workflow"),
    ("background_remove", "Background removal", False, ("REPLICATE_API_TOKEN",), "Segmentation model on a GPU provider (e.g. Replicate)"),
    ("object_remove", "Object removal", False, ("REPLICATE_API_TOKEN",), "Video inpainting model on a GPU provider"),
    ("stabilize", "Stabilisation", False, (), "Planned: FFmpeg vidstab on the worker (no provider needed)"),
]


@router.get("/capabilities")
def capabilities(user: User = Depends(current_user)):
    out = []
    for cid, label, builtin, envs, needs in CAPABILITIES:
        ready = builtin or any(os.environ.get(e) for e in envs)
        # Provider adapters are not wired yet: having a key alone does not make the feature work.
        if not builtin:
            ready = False
        out.append({"id": cid, "label": label, "ready": ready, "built_in": builtin,
                    "provider_key_present": any(os.environ.get(e) for e in envs), "needs": needs})
    return out
