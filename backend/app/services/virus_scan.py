"""
ClamAV virus scanning for uploaded files.

Uses the clamd Unix socket or TCP interface.  When ClamAV is not configured
(CLAMAV_HOST unset / socket absent) the scan is skipped and a warning is logged
so local dev and CI environments are unaffected.
"""
import asyncio
import socket
from typing import Literal

from loguru import logger

from app.core.config import settings

# Maximum bytes sent to clamd in one chunk (ClamAV default stream limit is 25 MB)
_CHUNK = 4096


class VirusScanResult:
    __slots__ = ("clean", "threat")

    def __init__(self, clean: bool, threat: str | None = None):
        self.clean = clean
        self.threat = threat  # virus name reported by ClamAV


async def scan_bytes(data: bytes) -> VirusScanResult:
    """
    Stream `data` to clamd and return the scan result.

    Returns a "clean" result without raising when:
      - ClamAV is not configured (CLAMAV_HOST / CLAMAV_SOCKET absent)
      - The clamd daemon is unreachable

    Raises nothing — callers should check result.clean and raise HTTPException
    themselves so the API layer controls the HTTP status code.
    """
    host = getattr(settings, "clamav_host", None)
    port = getattr(settings, "clamav_port", 3310)
    unix_socket = getattr(settings, "clamav_socket", None)  # e.g. /var/run/clamav/clamd.sock

    if not host and not unix_socket:
        logger.debug("ClamAV not configured — skipping virus scan")
        return VirusScanResult(clean=True)

    try:
        return await asyncio.wait_for(
            _scan(data, host=host, port=port, unix_socket=unix_socket),
            timeout=30,
        )
    except asyncio.TimeoutError:
        logger.warning("ClamAV scan timed out — allowing upload")
        return VirusScanResult(clean=True)
    except OSError as exc:
        logger.warning(f"ClamAV unreachable ({exc}) — allowing upload")
        return VirusScanResult(clean=True)


async def _scan(
    data: bytes,
    *,
    host: str | None,
    port: int,
    unix_socket: str | None,
) -> VirusScanResult:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _scan_sync, data, host, port, unix_socket)


def _scan_sync(
    data: bytes,
    host: str | None,
    port: int,
    unix_socket: str | None,
) -> VirusScanResult:
    """Synchronous ClamAV INSTREAM scan — runs in a thread pool executor."""
    if unix_socket:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.connect(unix_socket)
    else:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((host, port))

    with sock:
        sock.settimeout(25)
        # INSTREAM protocol: send "nINSTREAM\n", then chunks with 4-byte big-endian length prefix
        sock.sendall(b"nINSTREAM\n")

        offset = 0
        while offset < len(data):
            chunk = data[offset : offset + _CHUNK]
            size = len(chunk).to_bytes(4, "big")
            sock.sendall(size + chunk)
            offset += _CHUNK

        # Signal end of stream
        sock.sendall(b"\x00\x00\x00\x00")

        # Read response: "stream: OK\0" or "stream: <virus-name> FOUND\0"
        response = b""
        while not response.endswith(b"\n"):
            chunk = sock.recv(256)
            if not chunk:
                break
            response += chunk

    response_str = response.decode(errors="replace").strip()
    logger.debug(f"ClamAV response: {response_str}")

    if response_str.endswith("OK"):
        return VirusScanResult(clean=True)

    # "stream: Eicar-Test-Signature FOUND"
    if "FOUND" in response_str:
        parts = response_str.split(":")
        threat = parts[-1].strip().removesuffix(" FOUND").strip() if len(parts) > 1 else "unknown"
        logger.warning(f"Malware detected: {threat}")
        return VirusScanResult(clean=False, threat=threat)

    # Unexpected response — treat as clean but log
    logger.warning(f"Unexpected ClamAV response: {response_str!r}")
    return VirusScanResult(clean=True)
