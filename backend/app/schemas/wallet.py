from typing import Literal

from pydantic import BaseModel, Field

# ── Grounded closed sets ────────────────────────────────────────────────────────
# Program types: see wallet.py PROGRAM_TYPES / models/wallet.py comment on `type`.
_ProgramType = Literal[
    "membership",
    "punch_card",
    "points",
    "coupon",
    "event_ticket",
    "prepaid_balance",
    "business_card",
]
# Program status: see wallet.py _VALID_PROGRAM_STATUSES / models/wallet.py comment on `status`.
_ProgramStatus = Literal["active", "inactive", "archived"]
# Join form fields: see wallet.py JOIN_FIELDS equivalent in frontend/app/dashboard/wallet/page.tsx.
_JoinFormField = Literal["name", "email", "phone", "birthday", "postal_code"]
# Card actions: see wallet.py _VALID_ACTIONS.
_CardAction = Literal[
    "add_punch",
    "remove_punch",
    "redeem",
    "set_punches",
    "set_tier",
    "add_points",
    "remove_points",
    "redeem_points_reward",
    "set_balance",
    "check_in",
    "un_check_in",
    "deduct_balance",
    "load_balance",
    "refund_balance",
    "redeem_coupon",
]
# Scanner-permitted subset: see wallet.py _SCANNER_ACTIONS.
_ScannerAction = Literal[
    "add_punch",
    "redeem",
    "add_points",
    "redeem_points_reward",
    "check_in",
    "deduct_balance",
    "redeem_coupon",
]


# ── Programs ─────────────────────────────────────────────────────────────────────


class WalletProgramCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: _ProgramType
    description: str | None = None
    status: _ProgramStatus = "active"
    config: dict = Field(default_factory=dict)
    brand_overrides: dict = Field(default_factory=dict)
    chatbot_id: str | None = None
    join_form_fields: list[_JoinFormField] = Field(default_factory=lambda: ["name", "email"])
    receipt_scanning_config: dict = Field(default_factory=dict)


class WalletProgramUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: _ProgramStatus | None = None
    config: dict | None = None
    brand_overrides: dict | None = None
    chatbot_id: str | None = None
    join_form_fields: list[_JoinFormField] | None = None
    receipt_scanning_config: dict | None = None


class WalletProgramBulkDelete(BaseModel):
    ids: list[str] = Field(default_factory=list)


# ── Public join / scanner ─────────────────────────────────────────────────────────


class WalletSelfEnroll(BaseModel):
    email: str | None = Field(default=None, max_length=255)
    name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)


class WalletScannerAction(BaseModel):
    serial: str = Field(min_length=1, max_length=50)
    action: _ScannerAction
    value: str | int | float | None = None


# ── Cards ────────────────────────────────────────────────────────────────────────


class WalletCardIssue(BaseModel):
    customer_email: str | None = Field(default=None, max_length=255)
    customer_name: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=50)


class WalletCardAction(BaseModel):
    action: _CardAction
    value: str | int | float | None = None
    silent: bool = False
    message: str | None = None


# ── Receipt scanning ───────────────────────────────────────────────────────────────


class WalletReceiptScanRequest(BaseModel):
    image: str = Field(min_length=1)


# ── Push notifications ─────────────────────────────────────────────────────────────


class WalletPushMessage(BaseModel):
    message: str | None = None


# ── Apple Wallet web-service ───────────────────────────────────────────────────────


class AppleLogBody(BaseModel):
    """Apple's error-log webhook. Payload shape is Apple-defined and unused by us
    (handler just acks with {}), so this only pins down the documented `logs` field
    and otherwise ignores whatever else Apple sends."""

    logs: list[str] | None = None


# ── Wallet credential settings ─────────────────────────────────────────────────────


class WalletAppleCredentialsUpdate(BaseModel):
    pass_type_identifier: str | None = None
    team_identifier: str | None = None
    pass_cert_pem: str | None = None
    pass_key_pem: str | None = None
    wwdr_pem: str | None = None
    push_key_id: str | None = None
    push_key_pem: str | None = None


class WalletGoogleCredentialsUpdate(BaseModel):
    issuer_id: str | None = None
    service_account: str | None = None
