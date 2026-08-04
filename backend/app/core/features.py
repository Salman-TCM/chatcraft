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
CHATBOTS = "chatbots"
CONTACTS = "contacts"
KEYWORDS = "keywords"
SOCIAL = "social"
SEQUENCES = "sequences"
PIPELINES = "pipelines"
LANDING_PAGES = "landing_pages"
STORES = "stores"
VOICE_LAB = "voice_lab"
BROWSER_AGENT = "browser_agent"
MCP_SERVERS = "mcp_servers"

# Ordered list used for the admin UI and API responses
ALL_FEATURES: list[dict] = [
    {"key": INBOX, "label": "Inbox"},
    {"key": CHATBOTS, "label": "Chatbots"},
    {"key": CONTACTS, "label": "Contacts"},
    {"key": KEYWORDS, "label": "Keywords"},
    {"key": CAMPAIGNS, "label": "Campaigns"},
    {"key": SOCIAL, "label": "Social"},
    {"key": FLOWS, "label": "Flows"},
    {"key": AUTOMATIONS, "label": "Automations"},
    {"key": SEQUENCES, "label": "Sequences"},
    {"key": PIPELINES, "label": "Pipelines"},
    {"key": FORMS, "label": "Forms"},
    {"key": LANDING_PAGES, "label": "Landing Pages"},
    {"key": STORES, "label": "Stores"},
    {"key": WALLET, "label": "Wallet & Loyalty"},
    {"key": ANALYTICS, "label": "Analytics"},
    {"key": KNOWLEDGE_BASE, "label": "Knowledge Base"},
    {"key": AGENT_BUILDER, "label": "Agent Builder"},
    {"key": VOICE_LAB, "label": "Voice Lab"},
    {"key": BROWSER_AGENT, "label": "Browser Agent"},
    {"key": MCP_SERVERS, "label": "MCP Servers"},
    {"key": WHITE_LABEL, "label": "White Label / Agency"},
]

ALL_FEATURE_KEYS: frozenset[str] = frozenset(f["key"] for f in ALL_FEATURES)
