"""
Document conversion service.

Uses LibreOffice headless for DOCX → PDF (and other Office formats).
PyMuPDF (fitz) is used for PDF → image if needed in future.

LibreOffice can only run one conversion at a time per user profile,
so we serialise calls through an asyncio lock.
"""

import asyncio
import os
import tempfile
import uuid
from pathlib import Path

_SOFFICE = "/usr/bin/soffice"
_TIMEOUT = 60  # seconds before we kill LibreOffice
_lock = asyncio.Lock()

# Supported input types and what LibreOffice calls the output format
SUPPORTED_INPUT_EXT = {
    ".docx": "pdf",
    ".doc":  "pdf",
    ".odt":  "pdf",
    ".rtf":  "pdf",
    ".pptx": "pdf",
    ".ppt":  "pdf",
    ".xlsx": "pdf",
    ".xls":  "pdf",
    ".ods":  "pdf",
    ".odp":  "pdf",
    ".html": "pdf",
    ".htm":  "pdf",
    ".txt":  "pdf",
}


class ConversionError(Exception):
    pass


async def convert_to_pdf(data: bytes, filename: str) -> tuple[bytes, str]:
    """Convert *data* (raw bytes of *filename*) to PDF bytes.

    Returns (pdf_bytes, pdf_filename).
    Raises ConversionError on failure.
    """
    if not os.path.exists(_SOFFICE):
        raise ConversionError(
            "LibreOffice is not installed on this server. "
            "Ask your administrator to install it."
        )

    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_INPUT_EXT:
        raise ConversionError(
            f"Unsupported file type '{ext}'. "
            f"Supported: {', '.join(SUPPORTED_INPUT_EXT)}"
        )

    # LibreOffice cannot handle concurrent conversions from the same user
    # profile directory, so we serialise behind a process-level lock.
    async with _lock:
        return await _run_conversion(data, filename, ext)


async def _run_conversion(data: bytes, filename: str, ext: str) -> tuple[bytes, str]:
    # Use an isolated --user-installation per conversion to avoid profile
    # contention when two requests arrive close together.
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir) / filename
        tmp_path.write_bytes(data)

        user_install = Path(tmpdir) / "lo-profile"
        user_install.mkdir()

        cmd = [
            _SOFFICE,
            f"-env:UserInstallation=file://{user_install}",
            "--headless",
            "--convert-to", "pdf",
            "--outdir", tmpdir,
            str(tmp_path),
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=_TIMEOUT
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            raise ConversionError("Conversion timed out after 60 seconds.")
        except Exception as exc:
            raise ConversionError(f"Failed to launch LibreOffice: {exc}")

        if proc.returncode != 0:
            err = stderr.decode(errors="replace").strip()
            raise ConversionError(f"LibreOffice conversion failed: {err or 'unknown error'}")

        pdf_name = Path(filename).stem + ".pdf"
        pdf_path = Path(tmpdir) / pdf_name
        if not pdf_path.exists():
            raise ConversionError("Conversion produced no output file.")

        return pdf_path.read_bytes(), pdf_name
