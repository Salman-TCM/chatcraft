"""
Feature registry for per-user feature-level access control.

Each constant is the canonical key stored in User.allowed_features.
When User.allowed_features is None, the user has access to ALL features.
When it is a list (including empty), only the listed features are allowed.
Admins always bypass all feature checks.
"""

WALLET = "wallet"
AGENT_BUILDER = "agent_builder"
FLOWS = "flows"
AUTOMATIONS = "automations"
ANALYTICS = "analytics"
KNOWLEDGE_BASE = "knowledge_base"
INBOX = "inbox"
FORMS = "forms"
CAMPAIGNS = "campaigns"
WHITE_LABEL = "white_label"

# Ordered list used for the admin UI and API responses
ALL_FEATURES: list[dict] = [
    {"key": WALLET,          "label": "Wallet & Loyalty"},
    {"key": AGENT_BUILDER,   "label": "Agent Builder"},
    {"key": FLOWS,           "label": "Flows"},
    {"key": AUTOMATIONS,     "label": "Automations"},
    {"key": ANALYTICS,       "label": "Analytics"},
    {"key": KNOWLEDGE_BASE,  "label": "Knowledge Base"},
    {"key": INBOX,           "label": "Inbox"},
    {"key": FORMS,           "label": "Forms"},
    {"key": CAMPAIGNS,       "label": "Campaigns"},
    {"key": WHITE_LABEL,     "label": "White Label / Agency"},
]

ALL_FEATURE_KEYS: frozenset[str] = frozenset(f["key"] for f in ALL_FEATURES)
