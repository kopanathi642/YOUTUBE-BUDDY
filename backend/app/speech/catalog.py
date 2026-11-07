"""Exactly which languages and voices the self-hosted speech stack supports, and under which licences.

Only models whose licence allows commercial use are listed. Checked 2026-11-07 against each model card:
- Whisper (faster-whisper conversions by Systran): MIT.
- Argos Translate models (argos-net.com, OPUS data): released by the MIT-licensed Argos project for any use;
  have a lawyer confirm before relying on it commercially (the data sources carry their own attribution terms).
- Kokoro-82M (hexgrad, ONNX export by thewh1teagle): Apache-2.0.
- Piper voices (rhasspy/piper-voices v1.0.0): per-voice dataset licence, listed below. Voices that are
  non-commercial (CC BY-NC-SA: both Hindi Piper voices, en_US-ryan, ...) or of unknown licence are NOT used.
- WeSpeaker ResNet34 speaker model: CC-BY-4.0.

A language is only offered to users when every model on its path is present and verified (see assets.py).
"""
from __future__ import annotations

LANG_NAMES = {
    "af": "Afrikaans", "ar": "Arabic", "az": "Azerbaijani", "bg": "Bulgarian", "bn": "Bengali", "ca": "Catalan", "cs": "Czech",
    "da": "Danish", "de": "German", "el": "Greek", "en": "English", "es": "Spanish", "et": "Estonian", "eu": "Basque",
    "fa": "Persian", "fi": "Finnish", "fr": "French", "gl": "Galician", "gu": "Gujarati", "he": "Hebrew", "hi": "Hindi",
    "hu": "Hungarian", "id": "Indonesian", "it": "Italian", "ja": "Japanese", "kn": "Kannada", "ko": "Korean", "lt": "Lithuanian",
    "lv": "Latvian", "ml": "Malayalam", "mr": "Marathi", "ms": "Malay", "nb": "Norwegian Bokmål", "ne": "Nepali", "nl": "Dutch",
    "or": "Odia", "pa": "Punjabi", "pl": "Polish", "pt": "Portuguese", "ro": "Romanian", "ru": "Russian", "sk": "Slovak",
    "sl": "Slovenian", "sq": "Albanian", "sv": "Swedish", "sw": "Swahili", "ta": "Tamil", "te": "Telugu", "th": "Thai",
    "tl": "Tagalog", "tr": "Turkish", "uk": "Ukrainian", "ur": "Urdu", "vi": "Vietnamese", "zh": "Chinese",
}

# Our language code -> Whisper language token (Whisper says "no" for Norwegian Bokmål).
WHISPER_CODE = {"nb": "no"}
WHISPER_TO_APP = {v: k for k, v in WHISPER_CODE.items()}

# Argos package versions (argospm-index, checked 2026-11-07). Source side: X -> en. Target side: en -> X.
# Portuguese targets use the Brazilian model ("pb") because both Portuguese voices are Brazilian.
ARGOS_TO_EN = {
    "ar": "1.0", "az": "1.5", "bg": "1.9", "bn": "1.9", "ca": "1.7", "cs": "1.9.6", "da": "1.9", "de": "1.3", "el": "1.9",
    "es": "1.9", "et": "1.9", "eu": "1.9", "fa": "1.5", "fi": "1.9", "fr": "1.9", "gl": "1.9", "he": "1.5", "hi": "1.1",
    "hu": "1.9", "id": "1.9", "it": "1.0", "ja": "1.1", "ko": "1.1", "lt": "1.9", "lv": "1.9", "ms": "1.9", "nb": "1.9",
    "nl": "1.8", "pl": "1.9", "pt": "1.9", "ro": "1.9", "ru": "1.9", "sk": "1.9", "sl": "1.9", "sq": "1.9", "sv": "1.5",
    "sw": "1.11", "th": "1.9", "tl": "1.9", "tr": "1.5", "uk": "1.9", "ur": "1.9", "vi": "1.9", "zh": "1.9",
}
ARGOS_FROM_EN = {
    "ca": "1.9", "cs": "1.9.6", "da": "1.9", "de": "1.3", "el": "1.9", "es": "1.0", "fa": "1.5", "fi": "1.9", "fr": "1.9",
    "hi": "1.1", "hu": "1.9", "it": "1.0", "ja": "1.1", "lv": "1.9", "nb": "1.9", "nl": "1.8", "pb": "1.9", "pl": "1.9",
    "ro": "1.9", "ru": "1.9", "sk": "1.9", "sl": "1.9", "sv": "1.5", "tr": "1.5", "uk": "1.4", "vi": "1.9", "zh": "1.9",
}
ARGOS_TARGET_CODE = {"pt": "pb"}   # our target code -> argos model code

# Voices. id, language, engine, model, piper speaker id, gender, label, licence.
KOKORO = "kokoro"
PIPER = "piper"
VOICES: list[dict] = [dict(zip(("id", "language", "engine", "model", "speaker", "gender", "label", "licence"), v)) for v in [
    # Kokoro-82M (Apache-2.0)
    ("hi-female", "hi", KOKORO, "hf_alpha", None, "female", "Alpha (Hindi, female)", "Apache-2.0"),
    ("hi-male", "hi", KOKORO, "hm_omega", None, "male", "Omega (Hindi, male)", "Apache-2.0"),
    ("hi-female-2", "hi", KOKORO, "hf_beta", None, "female", "Beta (Hindi, female)", "Apache-2.0"),
    ("hi-male-2", "hi", KOKORO, "hm_psi", None, "male", "Psi (Hindi, male)", "Apache-2.0"),
    ("en-female", "en", KOKORO, "af_heart", None, "female", "Heart (English, female)", "Apache-2.0"),
    ("en-male", "en", KOKORO, "am_michael", None, "male", "Michael (English, male)", "Apache-2.0"),
    ("en-narrator", "en", KOKORO, "bm_george", None, "male", "George (British narrator)", "Apache-2.0"),
    ("en-young", "en", KOKORO, "af_nicole", None, "female", "Nicole (English, soft)", "Apache-2.0"),
    ("en-studio", "en", KOKORO, "bf_emma", None, "female", "Emma (British, studio)", "Apache-2.0"),
    ("es-female", "es", KOKORO, "ef_dora", None, "female", "Dora (Spanish, female)", "Apache-2.0"),
    ("es-male", "es", KOKORO, "em_alex", None, "male", "Alex (Spanish, male)", "Apache-2.0"),
    ("fr-female", "fr", KOKORO, "ff_siwis", None, "female", "Siwis (French, female)", "Apache-2.0"),
    ("it-female", "it", KOKORO, "if_sara", None, "female", "Sara (Italian, female)", "Apache-2.0"),
    ("it-male", "it", KOKORO, "im_nicola", None, "male", "Nicola (Italian, male)", "Apache-2.0"),
    ("pt-female", "pt", KOKORO, "pf_dora", None, "female", "Dora (Portuguese BR, female)", "Apache-2.0"),
    ("pt-male", "pt", KOKORO, "pm_alex", None, "male", "Alex (Portuguese BR, male)", "Apache-2.0"),
    # Japanese and Chinese Kokoro voices are NOT offered: with kokoro-onnx's espeak phonemizer they failed the pronunciation
    # check (judge CER 309 % ja, 60 % zh, docs/DUBBING_EVAL.md). They need the misaki ja/zh G2P before they can be enabled.
    # Piper voices with commercial-use dataset licences (rhasspy/piper-voices v1.0.0)
    ("de-male", "de", PIPER, "de_DE-thorsten-medium", None, "male", "Thorsten (German, male)", "CC0"),
    ("nl-male", "nl", PIPER, "nl_NL-pim-medium", None, "male", "Pim (Dutch, male)", "CC0"),
    ("nl-female", "nl", PIPER, "nl_BE-nathalie-medium", None, "female", "Nathalie (Flemish, female)", "CC0"),
    ("ru-male", "ru", PIPER, "ru_RU-denis-medium", None, "male", "Denis (Russian, male)", "CC0"),
    ("ru-male-2", "ru", PIPER, "ru_RU-dmitri-medium", None, "male", "Dmitri (Russian, male)", "CC0"),
    ("pl-female", "pl", PIPER, "pl_PL-gosia-medium", None, "female", "Gosia (Polish, female)", "CC0"),
    ("pl-male", "pl", PIPER, "pl_PL-darkman-medium", None, "male", "Darkman (Polish, male)", "CC0"),
    ("tr-male", "tr", PIPER, "tr_TR-fahrettin-medium", None, "male", "Fahrettin (Turkish, male)", "CC0"),
    ("tr-male-2", "tr", PIPER, "tr_TR-fettah-medium", None, "male", "Fettah (Turkish, male)", "CC0"),
    ("uk-female", "uk", PIPER, "uk_UA-ukrainian_tts-medium", 1, "female", "Ukrainian TTS (female)", "CC0"),
    ("uk-male", "uk", PIPER, "uk_UA-ukrainian_tts-medium", 0, "male", "Ukrainian TTS (male)", "CC0"),
    ("vi-female", "vi", PIPER, "vi_VN-vais1000-medium", None, "female", "VAIS1000 (Vietnamese)", "CC-BY-4.0"),
    ("cs-male", "cs", PIPER, "cs_CZ-jirka-medium", None, "male", "Jirka (Czech, male)", "CC0"),
    ("da-male", "da", PIPER, "da_DK-talesyntese-medium", None, "male", "Talesyntese (Danish)", "CC0"),
    ("el-female", "el", PIPER, "el_GR-rapunzelina-low", None, "female", "Rapunzelina (Greek, female)", "CC0"),
    ("fa-male", "fa", PIPER, "fa_IR-amir-medium", None, "male", "Amir (Persian, male)", "CC0"),
    ("fa-male-2", "fa", PIPER, "fa_IR-ganji-medium", None, "male", "Ganji (Persian, male)", "CC0"),
    ("fi-male", "fi", PIPER, "fi_FI-harri-medium", None, "male", "Harri (Finnish, male)", "CC0"),
    ("hu-female", "hu", PIPER, "hu_HU-anna-medium", None, "female", "Anna (Hungarian, female)", "CC0"),
    ("hu-male", "hu", PIPER, "hu_HU-imre-medium", None, "male", "Imre (Hungarian, male)", "CC0"),
    ("lv-male", "lv", PIPER, "lv_LV-aivars-medium", None, "male", "Aivars (Latvian, male)", "CC0"),
    ("nb-male", "nb", PIPER, "no_NO-talesyntese-medium", None, "male", "Talesyntese (Norwegian)", "CC0"),
    ("ro-male", "ro", PIPER, "ro_RO-mihai-medium", None, "male", "Mihai (Romanian, male)", "CC0"),
    ("sk-female", "sk", PIPER, "sk_SK-lili-medium", None, "female", "Lili (Slovak, female)", "CC0"),
    ("sl-male", "sl", PIPER, "sl_SI-artur-medium", None, "male", "Artur (Slovenian, male)", "CC-BY-4.0"),
    ("sv-female", "sv", PIPER, "sv_SE-nst-medium", None, "female", "NST (Swedish)", "CC0"),
    ("ca-female", "ca", PIPER, "ca_ES-upc_ona-medium", None, "female", "Ona (Catalan, female)", "CC-BY-SA-3.0"),
]]
VOICE_BY_ID = {v["id"]: v for v in VOICES}
# Kokoro voice language -> espeak/kokoro language tag
KOKORO_LANG = {"hi": "hi", "en": "en-us", "es": "es", "fr": "fr-fr", "it": "it", "pt": "pt-br"}
BRITISH = {"bm_george", "bf_emma"}

# Whisper speech languages we can translate from (it can also *recognise* every Whisper language; translation needs Argos).
SOURCE_LANGS = sorted({"en", *ARGOS_TO_EN})
TARGET_LANGS = sorted({v["language"] for v in VOICES})


def voices_for(lang: str) -> list[dict]:
    return [v for v in VOICES if v["language"] == lang]


def default_voice(lang: str, gender: str | None = None) -> str | None:
    vs = voices_for(lang)
    for v in vs:
        if gender and v["gender"] == gender:
            return v["id"]
    return vs[0]["id"] if vs else None


def translation_path(src: str, dst: str) -> list[tuple[str, str]]:
    """Argos steps for src -> dst (pivoting through English), or [] when no model exists for a leg."""
    if src == dst:
        return []
    legs = [(src, dst)] if "en" in (src, dst) else [(src, "en"), ("en", dst)]
    out = []
    for a, b in legs:
        if a == "en":
            code = ARGOS_TARGET_CODE.get(b, b)
            if code not in ARGOS_FROM_EN:
                return []
            out.append(("en", code))
        else:
            if a not in ARGOS_TO_EN:
                return []
            out.append((a, "en"))
    return out
