from fastapi import HTTPException


def enforce_upload_size(size_bytes: int, max_bytes: int) -> None:
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Upload exceeds maximum allowed size of {max_bytes} bytes",
        )
