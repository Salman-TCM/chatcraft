"""
Apple Wallet PKPass builder.

Requires environment variables:
  APPLE_PASS_TYPE_IDENTIFIER  — e.g. pass.com.example.loyalty
  APPLE_TEAM_IDENTIFIER       — 10-char Apple Developer team ID
  APPLE_PASS_CERT_PEM         — PEM-encoded signing certificate
  APPLE_PASS_KEY_PEM          — PEM-encoded private key
  APPLE_WWDR_PEM              — Apple WWDR certificate (G4 or G6)
"""
import hashlib
import io
import json
import zipfile
from typing import Any

from app.core.config import settings


def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def _sign_manifest(manifest_json: bytes) -> bytes:
    """Return CMS detached signature over the manifest."""
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.x509 import load_pem_x509_certificate
        from cryptography.hazmat.backends import default_backend
        from cryptography import x509
        import cryptography.hazmat.primitives.serialization.pkcs7 as pkcs7_mod

        cert = load_pem_x509_certificate(settings.APPLE_PASS_CERT_PEM.encode(), default_backend())
        key = serialization.load_pem_private_key(settings.APPLE_PASS_KEY_PEM.encode(), password=None, backend=default_backend())
        wwdr = load_pem_x509_certificate(settings.APPLE_WWDR_PEM.encode(), default_backend())

        signed = (
            pkcs7_mod.PKCS7SignatureBuilder()
            .set_data(manifest_json)
            .add_signer(cert, key, hashes.SHA256())
            .add_certificate(wwdr)
            .sign(serialization.Encoding.DER, [pkcs7_mod.PKCS7Options.DetachedSignature])
        )
        return signed
    except Exception as exc:
        raise RuntimeError(f"PKPass signing failed: {exc}") from exc


def build_pkpass(
    program: Any,
    card: Any,
    pass_url: str,
) -> bytes:
    """
    Build a signed .pkpass zip for the given program/card.
    Returns raw bytes of the .pkpass file.
    """
    cfg = program.config or {}
    brand = program.brand_overrides or {}

    bg_color = brand.get("background_color", "rgb(99,102,241)")
    fg_color = brand.get("foreground_color", "rgb(255,255,255)")
    label_color = brand.get("label_color", "rgb(200,200,255)")

    def _fields_for_type() -> dict:
        t = program.type
        state = card.state or {}
        if t == "punch_card":
            max_p = cfg.get("max_punches", 10)
            punches = state.get("punches", 0)
            return {
                "primary": [{"key": "punches", "label": "Punches", "value": f"{punches}/{max_p}"}],
                "secondary": [{"key": "name", "label": "Name", "value": card.customer_name or "Guest"}],
                "auxiliary": [{"key": "reward", "label": "Reward", "value": cfg.get("reward_description", "Free item")}],
            }
        elif t == "points":
            return {
                "primary": [{"key": "points", "label": "Points", "value": str(state.get("points", 0))}],
                "secondary": [{"key": "name", "label": "Member", "value": card.customer_name or "Guest"}],
                "auxiliary": [{"key": "tier", "label": "Tier", "value": state.get("tier", cfg.get("default_tier", "Standard"))}],
            }
        elif t == "membership":
            return {
                "primary": [{"key": "member", "label": "Member", "value": card.customer_name or "Guest"}],
                "secondary": [{"key": "tier", "label": "Tier", "value": state.get("tier", "Standard")}],
                "auxiliary": [{"key": "since", "label": "Member Since", "value": card.created_at.strftime("%b %Y") if card.created_at else ""}],
            }
        elif t == "prepaid_balance":
            balance = state.get("balance", cfg.get("initial_balance", 0))
            currency = cfg.get("currency", "USD")
            return {
                "primary": [{"key": "balance", "label": "Balance", "value": f"{currency} {float(balance):.2f}"}],
                "secondary": [{"key": "name", "label": "Cardholder", "value": card.customer_name or "Guest"}],
            }
        elif t == "event_ticket":
            return {
                "primary": [{"key": "event", "label": "Event", "value": cfg.get("event_name", program.name)}],
                "secondary": [{"key": "holder", "label": "Holder", "value": card.customer_name or "Guest"}],
                "auxiliary": [
                    {"key": "date", "label": "Date", "value": cfg.get("event_date", "")},
                    {"key": "seat", "label": "Seat", "value": state.get("seat", cfg.get("default_seat", "General"))},
                ],
            }
        else:  # coupon / business_card / default
            return {
                "primary": [{"key": "offer", "label": cfg.get("offer_label", "Offer"), "value": cfg.get("offer_value", program.name)}],
                "secondary": [{"key": "name", "label": "Name", "value": card.customer_name or "Guest"}],
            }

    fields = _fields_for_type()
    pass_type_map = {
        "punch_card": "coupon",
        "coupon": "coupon",
        "event_ticket": "eventTicket",
        "membership": "storeCard",
        "points": "storeCard",
        "prepaid_balance": "storeCard",
        "business_card": "generic",
    }
    pk_type = pass_type_map.get(program.type, "generic")

    pass_json: dict = {
        "formatVersion": 1,
        "passTypeIdentifier": settings.APPLE_PASS_TYPE_IDENTIFIER,
        "serialNumber": card.serial,
        "teamIdentifier": settings.APPLE_TEAM_IDENTIFIER,
        "organizationName": program.name,
        "description": program.description or program.name,
        "backgroundColor": bg_color,
        "foregroundColor": fg_color,
        "labelColor": label_color,
        "webServiceURL": pass_url,
        "authenticationToken": card.serial,
        "barcode": {
            "message": card.serial,
            "format": "PKBarcodeFormatQR",
            "messageEncoding": "iso-8859-1",
        },
        pk_type: {
            "primaryFields": fields.get("primary", []),
            "secondaryFields": fields.get("secondary", []),
            "auxiliaryFields": fields.get("auxiliary", []),
        },
    }

    pass_json_bytes = json.dumps(pass_json, separators=(",", ":")).encode()

    # Build manifest (sha1 of every file in the archive)
    files: dict[str, bytes] = {"pass.json": pass_json_bytes}
    manifest = {name: _sha1(data) for name, data in files.items()}
    manifest_bytes = json.dumps(manifest, separators=(",", ":")).encode()

    signature = _sign_manifest(manifest_bytes)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("pass.json", pass_json_bytes)
        zf.writestr("manifest.json", manifest_bytes)
        zf.writestr("signature", signature)
    return buf.getvalue()
