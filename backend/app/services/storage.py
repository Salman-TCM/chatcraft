"""
File storage abstraction.
Priority: S3 → Supabase → local filesystem (uploads_data volume).
Returns a URL the document processor can use to retrieve the file.
"""

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
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )


async def upload_logo(
    data: bytes,
    filename: str,
    content_type: str,
    chatbot_id: str,
) -> str:
    """Upload a chatbot logo and return a public URL. Key path: logos/{chatbot_id}/{filename}"""
    safe_name = PurePosixPath(filename).name
    key = f"logos/{chatbot_id}/{safe_name}"

    if settings.aws_access_key_id and settings.aws_s3_bucket:
        return await _upload_s3(data, key, content_type)
    if settings.supabase_url and settings.supabase_key:
        return await _upload_supabase(data, key, content_type)
    return await _upload_local(data, key)


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

    if settings.aws_access_key_id and settings.aws_s3_bucket:
        return await _upload_s3(data, key, content_type)
    if settings.supabase_url and settings.supabase_key:
        return await _upload_supabase(data, key, content_type)
    return await _upload_local(data, key)


async def delete_file(file_url: str) -> None:
    """
    Delete a previously uploaded file given the URL returned by upload_file/
    upload_logo. Best-effort — logs and swallows errors so a storage hiccup
    never blocks deleting the document record itself.
    """
    try:
        parts = urlsplit(file_url)
        if (
            settings.aws_s3_bucket
            and parts.hostname == f"{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com"
        ):
            key = parts.path.lstrip("/")
            await _delete_s3(key)
        elif settings.supabase_url and file_url.startswith(settings.supabase_url):
            marker = "/storage/v1/object/public/chatcraft-kb/"
            idx = file_url.find(marker)
            if idx == -1:
                logger.warning(f"Could not parse Supabase storage key from {file_url!r}")
                return
            key = file_url[idx + len(marker) :]
            await _delete_supabase(key)
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


async def _delete_s3(key: str) -> None:
    import asyncio

    loop = asyncio.get_event_loop()
    client = _s3_client()
    await loop.run_in_executor(
        None, lambda: client.delete_object(Bucket=settings.aws_s3_bucket, Key=key)
    )


async def _delete_supabase(key: str) -> None:
    from supabase import create_client

    sb = create_client(settings.supabase_url, settings.supabase_key)
    sb.storage.from_("chatcraft-kb").remove([key])


async def _upload_s3(data: bytes, key: str, content_type: str) -> str:
    import asyncio

    loop = asyncio.get_event_loop()
    client = _s3_client()

    def _put():
        client.put_object(
            Bucket=settings.aws_s3_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    await loop.run_in_executor(None, _put)
    return f"https://{settings.aws_s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"


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
    key = file_url[len(prefix):]
    return Path(settings.local_uploads_dir) / key


async def _upload_supabase(data: bytes, key: str, content_type: str) -> str:
    from supabase import create_client

    sb = create_client(settings.supabase_url, settings.supabase_key)
    bucket = "chatcraft-kb"

    resp = sb.storage.from_(bucket).upload(
        path=key,
        file=data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    public = sb.storage.from_(bucket).get_public_url(key)
    return public
