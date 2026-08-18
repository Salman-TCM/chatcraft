"""
Fernet-symmetric encryption for API credentials stored in integration_credentials.

The encryption key comes from INTEGRATION_ENCRYPTION_KEY env var.
Generate one with:  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    key = os.environ.get("INTEGRATION_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError(
            "INTEGRATION_ENCRYPTION_KEY is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt_credential(plaintext: str) -> str:
    """Encrypt a credential value. Returns a URL-safe base64 token."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_credential(token: str) -> str:
    """Decrypt a credential token. Raises ValueError on bad key or tampered data."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt credential — key mismatch or tampered data") from exc
