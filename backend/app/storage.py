"""S3-compatible object storage adapter (Cloudflare R2 in production).

Buckets are private. The browser only ever receives short-lived signed URLs; credentials stay server-side.
"""
from functools import lru_cache

import boto3
from botocore.config import Config

from .config import get_settings


@lru_cache
def _client(public: bool = False):
    s = get_settings()
    endpoint = (s.s3_public_endpoint_url or s.s3_endpoint_url) if public else s.s3_endpoint_url
    return boto3.client(
        "s3", endpoint_url=endpoint, region_name=s.s3_region,
        aws_access_key_id=s.s3_access_key_id, aws_secret_access_key=s.s3_secret_access_key,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}, retries={"max_attempts": 5}),
    )


def client():
    return _client(False)


def bucket() -> str:
    return get_settings().s3_bucket


def ensure_bucket(cors_origins: list[str]) -> None:
    """Dev/test convenience. In production the bucket + CORS are provisioned by infra (see docs/DEPLOYMENT.md)."""
    c = client()
    try:
        c.head_bucket(Bucket=bucket())
    except Exception:
        c.create_bucket(Bucket=bucket())
    c.put_bucket_cors(Bucket=bucket(), CORSConfiguration={"CORSRules": [{
        "AllowedOrigins": cors_origins, "AllowedMethods": ["GET", "PUT", "HEAD"],
        "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600,
    }]})


def create_multipart(key: str, content_type: str) -> str:
    return client().create_multipart_upload(Bucket=bucket(), Key=key, ContentType=content_type)["UploadId"]


def presign_part(key: str, upload_id: str, part_number: int) -> str:
    return _client(True).generate_presigned_url(
        "upload_part", Params={"Bucket": bucket(), "Key": key, "UploadId": upload_id, "PartNumber": part_number},
        ExpiresIn=get_settings().signed_url_ttl_seconds)


def list_parts(key: str, upload_id: str) -> list[dict]:
    out, marker = [], 0
    while True:
        r = client().list_parts(Bucket=bucket(), Key=key, UploadId=upload_id, PartNumberMarker=marker)
        out += [{"part_number": p["PartNumber"], "etag": p["ETag"], "size": p["Size"]} for p in r.get("Parts", [])]
        if not r.get("IsTruncated"):
            return out
        marker = r["NextPartNumberMarker"]


def complete_multipart(key: str, upload_id: str, parts: list[dict]) -> None:
    client().complete_multipart_upload(
        Bucket=bucket(), Key=key, UploadId=upload_id,
        MultipartUpload={"Parts": [{"PartNumber": p["part_number"], "ETag": p["etag"]} for p in sorted(parts, key=lambda p: p["part_number"])]})


def abort_multipart(key: str, upload_id: str) -> None:
    client().abort_multipart_upload(Bucket=bucket(), Key=key, UploadId=upload_id)


def head(key: str) -> dict | None:
    try:
        return client().head_object(Bucket=bucket(), Key=key)
    except Exception:
        return None


def signed_get(key: str, filename: str | None = None) -> str:
    params = {"Bucket": bucket(), "Key": key}
    if filename:
        safe = "".join(ch for ch in filename if ch.isalnum() or ch in "._- ")[:120] or "download"
        params["ResponseContentDisposition"] = f'attachment; filename="{safe}"'
    return _client(True).generate_presigned_url("get_object", Params=params, ExpiresIn=get_settings().signed_url_ttl_seconds)


def download(key: str, path: str) -> None:
    client().download_file(bucket(), key, path)


def upload(path: str, key: str, content_type: str) -> None:
    client().upload_file(path, bucket(), key, ExtraArgs={"ContentType": content_type})


def delete_prefix(prefix: str) -> int:
    c, n = client(), 0
    for page in c.get_paginator("list_objects_v2").paginate(Bucket=bucket(), Prefix=prefix):
        objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
        if objs:
            c.delete_objects(Bucket=bucket(), Delete={"Objects": objs})
            n += len(objs)
    return n
