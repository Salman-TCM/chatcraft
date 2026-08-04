"""
Google Wallet API integration.

Requires environment variables:
  GOOGLE_WALLET_ISSUER_ID        — numeric issuer ID from Google Pay & Wallet Console
  GOOGLE_WALLET_SERVICE_ACCOUNT  — JSON of service account credentials
"""

import json
from datetime import UTC
from typing import Any

from app.core.config import settings


def _credentials():
    try:
        from google.oauth2 import service_account

        sa_info = json.loads(settings.google_wallet_service_account)
        return service_account.Credentials.from_service_account_info(
            sa_info,
            scopes=["https://www.googleapis.com/auth/wallet_object.issuer"],
        )
    except Exception as exc:
        raise RuntimeError(f"Google Wallet credentials error: {exc}") from exc


def _client():
    from googleapiclient.discovery import build

    return build("walletobjects", "v1", credentials=_credentials(), cache_discovery=False)


def _class_id(program_id: str) -> str:
    return f"{settings.google_wallet_issuer_id}.{program_id}"


def _object_id(program_id: str, serial: str) -> str:
    return f"{settings.google_wallet_issuer_id}.{serial}"


def _pass_type(program_type: str) -> str:
    return {
        "membership": "loyaltyObject",
        "points": "loyaltyObject",
        "punch_card": "loyaltyObject",
        "prepaid_balance": "giftCardObject",
        "event_ticket": "eventTicketObject",
        "coupon": "offerObject",
        "business_card": "genericObject",
    }.get(program_type, "genericObject")


def create_or_update_class(program: Any) -> str:
    """Create (or update) the Google Wallet class for a program. Returns class ID."""
    service = _client()
    pt = _pass_type(program.type)
    class_id = _class_id(str(program.id))
    brand = program.brand_overrides or {}
    cfg = program.config or {}

    body: dict = {
        "id": class_id,
        "issuerName": program.name,
        "reviewStatus": "underReview",
        "hexBackgroundColor": brand.get("background_color", "#6366f1"),
    }

    if pt == "loyaltyObject":
        body["programName"] = program.name
        body["programLogo"] = (
            {"sourceUri": {"uri": brand.get("logo_url", "")}} if brand.get("logo_url") else {}
        )
        body["rewardsTier"] = cfg.get("default_tier", "Standard")
        body["rewardsTierLabel"] = "Tier"
        body["accountIdLabel"] = "Card #"
        body["accountNameLabel"] = "Member"
    elif pt == "giftCardObject":
        body["merchantName"] = program.name
    elif pt == "eventTicketObject":
        body["eventName"] = {
            "defaultValue": {"language": "en-US", "value": cfg.get("event_name", program.name)}
        }

    resource = f"{pt[:-6]}Class" if pt != "genericObject" else "genericClass"
    # e.g. loyaltyClass, giftCardClass, eventTicketClass, offerClass, genericClass
    resource_map = {
        "loyaltyObject": "loyaltyClass",
        "giftCardObject": "giftCardClass",
        "eventTicketObject": "eventTicketClass",
        "offerObject": "offerClass",
        "genericObject": "genericClass",
    }
    resource_name = resource_map[pt]
    cls_resource = getattr(service, resource_name)()

    try:
        cls_resource.get(resourceId=class_id).execute()
        cls_resource.update(resourceId=class_id, body=body).execute()
    except Exception:
        cls_resource.insert(body=body).execute()

    return class_id


def issue_pass(program: Any, card: Any) -> str:
    """Create a Google Wallet pass object for a card. Returns object ID."""
    service = _client()
    pt = _pass_type(program.type)
    class_id = _class_id(str(program.id))
    object_id = _object_id(str(program.id), card.serial)
    state = card.state or {}
    cfg = program.config or {}

    body: dict = {
        "id": object_id,
        "classId": class_id,
        "state": "ACTIVE",
        "barcode": {
            "type": "QR_CODE",
            "value": card.serial,
        },
        "cardTitle": {"defaultValue": {"language": "en-US", "value": program.name}},
        "header": {"defaultValue": {"language": "en-US", "value": card.customer_name or "Guest"}},
    }

    if pt == "loyaltyObject":
        body["accountId"] = card.serial
        body["accountName"] = card.customer_name or "Guest"
        if program.type == "punch_card":
            max_p = cfg.get("max_punches", 10)
            body["loyaltyPoints"] = {
                "label": "Punches",
                "balance": {"string": f"{state.get('punches', 0)}/{max_p}"},
            }
        elif program.type in ("points", "membership"):
            body["loyaltyPoints"] = {
                "label": "Points",
                "balance": {"int": state.get("points", 0)},
            }
    elif pt == "giftCardObject":
        balance = state.get("balance", cfg.get("initial_balance", 0))
        body["balance"] = {
            "micros": str(int(float(balance) * 1_000_000)),
            "currencyCode": cfg.get("currency", "USD"),
        }
        body["cardNumber"] = card.serial

    resource_map = {
        "loyaltyObject": "loyaltyObject",
        "giftCardObject": "giftCardObject",
        "eventTicketObject": "eventTicketObject",
        "offerObject": "offerObject",
        "genericObject": "genericObject",
    }
    obj_resource = getattr(service, resource_map[pt])()
    try:
        obj_resource.get(resourceId=object_id).execute()
        obj_resource.update(resourceId=object_id, body=body).execute()
    except Exception:
        obj_resource.insert(body=body).execute()

    return object_id


def push_update(object_id: str, program_type: str) -> None:
    """Trigger a Google Wallet push update for a pass object."""
    service = _client()
    pt = _pass_type(program_type)
    resource_map = {
        "loyaltyObject": "loyaltyObject",
        "giftCardObject": "giftCardObject",
        "eventTicketObject": "eventTicketObject",
        "offerObject": "offerObject",
        "genericObject": "genericObject",
    }
    # Google Wallet pushes happen automatically when the object is updated.
    # For explicit notification, we touch the object.
    obj_resource = getattr(service, resource_map[pt])()
    try:
        obj = obj_resource.get(resourceId=object_id).execute()
        obj_resource.update(resourceId=object_id, body=obj).execute()
    except Exception:
        pass


def add_pass_save_link(object_id: str) -> str:
    """Generate a 'Add to Google Wallet' JWT link."""
    try:
        import json
        from datetime import datetime

        import jwt as pyjwt

        sa_info = json.loads(settings.google_wallet_service_account)
        claims = {
            "iss": sa_info["client_email"],
            "aud": "google",
            "origins": [],
            "typ": "savetowallet",
            "payload": {"genericObjects": [{"id": object_id}]},
            "iat": int(datetime.now(UTC).timestamp()),
        }
        token = pyjwt.encode(claims, sa_info["private_key"], algorithm="RS256")
        return f"https://pay.google.com/gp/v/save/{token}"
    except Exception:
        return ""
