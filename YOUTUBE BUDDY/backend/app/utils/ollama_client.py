from typing import Any

import requests

from app.core.config import settings


def chat_completion(prompt: str, system: str | None = None, **kwargs: Any) -> dict[str, Any]:
    """
    Call the Ollama chat API.
    """
    url = f"{settings.OLLAMA_BASE_URL}/api/chat"
    
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    else:
        messages.append({"role": "system", "content": "You are an AI assistant for YouTube creators."})
    
    messages.append({"role": "user", "content": prompt})
    
    payload = {
        "model": kwargs.pop("model", settings.OLLAMA_MODEL),
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": kwargs.pop("temperature", 0.7),
            "num_predict": kwargs.pop("max_tokens", 1024),
        }
    }
    payload.update(kwargs)

    try:
        response = requests.post(
            url,
            json=payload,
            timeout=settings.AI_REQUEST_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        data = response.json()
        
        # Format it to be somewhat compatible with OpenAI response structure where it makes sense
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": data.get("message", {}).get("content", "")
                    }
                }
            ],
            "raw": data
        }
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Ollama API error: {str(e)}")


def generate_text(prompt: str, **kwargs: Any) -> str:
    """
    Simple wrapper to get text back from Ollama.
    """
    response = chat_completion(prompt, **kwargs)
    return response["choices"][0]["message"]["content"]
