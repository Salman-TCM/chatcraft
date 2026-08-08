"""
File storage abstraction.

Priority: S3 (AWS) → MinIO → Supabase → local filesystem.

MinIO is S3-compatible. It is selected when AWS_ENDPOINT_URL is set
(pointing at the MinIO container). Files are served via nginx's /files/
proxy so they get a clean public URL without exposing MinIO's port directly.

Celery workers always download via boto3 get_object (internal endpoint)
so they never need to make outbound HTTP calls that would trigger the
SSRF guard or fail due to Docker's internal DNS resolving to private IPs.
"""

import json
import uuid
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings
from app.core.logging import logger

# URL prefix the backend serves local uploads under (StaticFiles mount).
_LOCAL_UPLOADS_PREFIX = "/uploads/"

# Allowed MIME types → document type string used in KnowledgeBaseDocument
ALLOWED_MIME_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "docx",
    "text/plain": "txt",
}

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

def _public_read_policy(bucket: str) -> str:
    """JSON policy granting anonymous GetObject on the bucket."""
    return json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{bucket}/*"],
        }],
    })

_bucket_initialized: set[str] = set()


def detect_doc_type(filename: str, content_type: str) -> str:
    """Resolve document type from filename extension or content-type header."""
    ext = PurePosixPath(filename).suffix.lower()
    ext_map = {".pdf": "pdf", ".docx": "docx", ".doc": "docx", ".txt": "txt"}
    if ext in ext_map:
        return ext_map[ext]
    doc_type = ALLOWED_MIME_TYPES.get(content_type)
    if doc_type:
        return doc_type
    raise ValueError(f"Unsupported file type: {filename!r} ({content_type})")


def _s3_client():
    kwargs: dict = {
        "region_name": settings.aws_region,
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
    }
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
    return boto3.client("s3", **kwargs)


def _ensure_bucket(client, bucket: str) -> None:
    """Create the bucket and set public-read policy if it doesn't exist yet."""
    if bucket in _bucket_initialized:
        return
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchBucket"):
            try:
                client.create_bucket(Bucket=bucket)
            except ClientError:
                pass  # may already exist due to a race; continue
        # For real AWS, head_bucket 403 means it exists but we lack ListBucket —
        # that's fine, put_object only needs s3:PutObject, not ListBucket.
    if settings.aws_endpoint_url:
        # Only set public policy on MinIO — AWS buckets use bucket policies
        # managed outside the app.
        try:
            client.put_bucket_policy(Bucket=bucket, Policy=_public_read_policy(bucket))
        except ClientError:
            pass
    _bucket_initialized.add(bucket)


async def upload_logo(
    data: bytes,
    filename: str,
    content_type: str,
    chatbot_id: str,
) -> str:
    """Upload a chatbot logo and return a public URL. Key path: logos/{chatbot_id}/{filename}"""
    safe_name = PurePosixPath(filename).name
    key = f"logos/{chatbot_id}/{safe_name}"
    return await _dispatch_upload(data, key, content_type)


async def upload_file(
    data: bytes,
    filename: str,
    content_type: str,
    chatbot_id: str,
) -> str:
    """
    Upload file bytes to storage and return a downloadable URL.
    Key path: kb/{chatbot_id}/{uuid}/{filename}
    """
    safe_name = PurePosixPath(filename).name
    key = f"kb/{chatbot_id}/{uuid.uuid4()}/{safe_name}"
    return await _dispatch_upload(data, key, content_type)


async def _dispatch_upload(data: bytes, key: str, content_type: str) -> str:
    """Route upload to the first configured storage backend."""
    if settings.aws_access_key_id and settings.aws_s3_bucket:
        return await _upload_s3(data, key, content_type)
    if settings.supabase_url and settings.supabase_key:
        return await _upload_supabase(data, key, content_type)
    return await _upload_local(data, key)


async def delete_file(file_url: str) -> None:
    """
    Delete a previously uploaded file. Best-effort — logs and swallows errors
    so a storage hiccup never blocks deleting the document record itself.
    """
    try:
        minio_key = minio_key_for_url(file_url)
        if minio_key is not None:
            await _delete_s3(minio_key)
            return

        parts = urlsplit(file_url)
        if (
            settings.aws_s3_bucket
            and not settings.aws_endpoint_url
            and parts.hostname == f"{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com"
        ):
            await _delete_s3(parts.path.lstrip("/"))
        elif settings.supabase_url and file_url.startswith(settings.supabase_url):
            marker = "/storage/v1/object/public/chatcraft-kb/"
            idx = file_url.find(marker)
            if idx == -1:
                logger.warning(f"Could not parse Supabase storage key from {file_url!r}")
                return
            await _delete_supabase(file_url[idx + len(marker):])
        else:
            local = local_path_for_url(file_url)
            if local and local.exists():
                local.unlink(missing_ok=True)
            else:
                logger.warning(f"Unrecognized storage URL, skipping delete: {file_url!r}")
    except (BotoCoreError, ClientError) as exc:
        logger.warning(f"Failed to delete storage object for {file_url!r}: {exc!r}")
    except Exception as exc:
        logger.warning(f"Unexpected error deleting storage object for {file_url!r}: {exc!r}")


# ── MinIO helpers ──────────────────────────────────────────────────────────────


def minio_key_for_url(file_url: str) -> str | None:
    """Return the object key if this URL is a MinIO-stored file, else None.

    Handles both the nginx-proxied form ({minio_public_url}/{key}) and the
    direct MinIO endpoint form ({aws_endpoint_url}/{bucket}/{key}).
    """
    if not settings.aws_endpoint_url or not settings.aws_s3_bucket:
        return None

    # nginx-proxied public URL: {minio_public_url}/{key}
    if settings.minio_public_url:
        prefix = settings.minio_public_url.rstrip("/") + "/"
        if file_url.startswith(prefix):
            return file_url[len(prefix):]

    # Direct MinIO URL: {aws_endpoint_url}/{bucket}/{key}
    direct_prefix = settings.aws_endpoint_url.rstrip("/") + "/" + settings.aws_s3_bucket + "/"
    if file_url.startswith(direct_prefix):
        return file_url[len(direct_prefix):]

    return None


async def download_minio_object(key: str) -> bytes:
    """Download an object from MinIO using the internal S3 API.

    Used by the KB extractor so the celery worker never makes outbound HTTP
    calls (which would hit the SSRF guard and/or fail on Docker-internal DNS).
    """
    import asyncio

    client = _s3_client()

    def _get() -> bytes:
        resp = client.get_object(Bucket=settings.aws_s3_bucket, Key=key)
        return resp["Body"].read()

    return await asyncio.get_event_loop().run_in_executor(None, _get)


# ── S3 / MinIO ─────────────────────────────────────────────────────────────────


async def _upload_s3(data: bytes, key: str, content_type: str) -> str:
    import asyncio

    loop = asyncio.get_event_loop()
    client = _s3_client()
    bucket = settings.aws_s3_bucket

    def _put() -> None:
        _ensure_bucket(client, bucket)
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    await loop.run_in_executor(None, _put)

    if settings.aws_endpoint_url:
        # MinIO: serve via nginx /files/ proxy (or direct endpoint URL in dev)
        if settings.minio_public_url:
            return f"{settings.minio_public_url.rstrip('/')}/{key}"
        return f"{settings.aws_endpoint_url.rstrip('/')}/{bucket}/{key}"

    return f"https://{bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"


async def _delete_s3(key: str) -> None:
    import asyncio

    loop = asyncio.get_event_loop()
    client = _s3_client()
    await loop.run_in_executor(
        None, lambda: client.delete_object(Bucket=settings.aws_s3_bucket, Key=key)
    )


# ── Supabase ───────────────────────────────────────────────────────────────────


async def _upload_supabase(data: bytes, key: str, content_type: str) -> str:
    from supabase import create_client

    sb = create_client(settings.supabase_url, settings.supabase_key)
    bucket = "chatcraft-kb"

    sb.storage.from_(bucket).upload(
        path=key,
        file=data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return sb.storage.from_(bucket).get_public_url(key)


async def _delete_supabase(key: str) -> None:
    from supabase import create_client

    sb = create_client(settings.supabase_url, settings.supabase_key)
    sb.storage.from_("chatcraft-kb").remove([key])


# ── Local filesystem (last resort) ────────────────────────────────────────────


async def _upload_local(data: bytes, key: str) -> str:
    """Store bytes on the local filesystem and return a URL served by StaticFiles."""
    import asyncio

    dest = Path(settings.local_uploads_dir) / key
    dest.parent.mkdir(parents=True, exist_ok=True)

    def _write() -> None:
        dest.write_bytes(data)

    await asyncio.get_event_loop().run_in_executor(None, _write)
    return f"{settings.api_base_url}{_LOCAL_UPLOADS_PREFIX}{key}"


def local_path_for_url(file_url: str) -> Path | None:
    """Return the filesystem Path for a local-upload URL, or None if not local."""
    prefix = f"{settings.api_base_url}{_LOCAL_UPLOADS_PREFIX}"
    if not file_url.startswith(prefix):
        return None
    return Path(settings.local_uploads_dir) / file_url[len(prefix):]
