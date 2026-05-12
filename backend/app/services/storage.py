"""
File storage abstraction.
Uploads to S3 when AWS credentials are configured; falls back to Supabase Storage.
Returns a public or pre-signed URL that the document processor can download.
"""
import mimetypes
import uuid
from pathlib import PurePosixPath

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import settings
from app.core.logging import logger

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

    raise RuntimeError(
        "No storage backend configured. Set AWS_ACCESS_KEY_ID + AWS_S3_BUCKET "
        "or SUPABASE_URL + SUPABASE_KEY."
    )


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
