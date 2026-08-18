# Import all models here so Base.metadata is fully populated when
# Alembic reads it in env.py. Add each new model file as it is created.
from app.models.admin_log import AdminActionLog  # noqa: F401
from app.models.agent import Agent  # noqa: F401
from app.models.agent_conversation import AgentConversation  # noqa: F401
from app.models.agent_function import AgentFunction  # noqa: F401
from app.models.agent_integration import AgentIntegration, IntegrationCredential  # noqa: F401
from app.models.agent_knowledge_base import (  # noqa: F401
    AgentKnowledgeChunk,
    AgentKnowledgeDocument,
)
from app.models.analytics_daily import AnalyticsDaily  # noqa: F401
from app.models.api_token import ApiToken  # noqa: F401
from app.models.automation import (  # noqa: F401
    Automation,
    Keyword,
    Sequence,
    SequenceEnrollment,
)
from app.models.base import Base, TimestampMixin  # noqa: F401
from app.models.broadcast import (  # noqa: F401
    BroadcastCampaign,
    CommentAutomation,
    SocialAccount,
    SocialPost,
)
from app.models.browser import BrowserSession  # noqa: F401
from app.models.channel_integration import ChannelIntegration  # noqa: F401
from app.models.chatbot_config import ChatbotConfig  # noqa: F401
from app.models.commerce import CommercePayment, CommerceProduct, CommerceStore  # noqa: F401
from app.models.conversation import Conversation  # noqa: F401
from app.models.crm import (  # noqa: F401
    Contact,
    ContactFieldValue,
    ContactTag,
    CustomField,
    CustomFieldType,
    Pipeline,
    PipelineDeal,
    PipelineStage,
    Tag,
)
from app.models.flow import Flow, FlowRun  # noqa: F401
from app.models.form import Form, FormSubmission, LandingPage  # noqa: F401
from app.models.inbox import (  # noqa: F401
    ConversationChannel,
    ConversationStatus,
    InboxAssignment,
    InternalNote,
    TeamMember,
)
from app.models.knowledge_base import (  # noqa: F401
    EMBEDDING_DIM,
    DocumentStatus,
    DocumentType,
    KnowledgeBaseChunk,
    KnowledgeBaseDocument,
)
from app.models.mcp import MCPServerConfig  # noqa: F401
from app.models.message import Message, MessageFeedback, MessageRole  # noqa: F401
from app.models.payment import Payment  # noqa: F401
from app.models.subscription import Subscription  # noqa: F401
from app.models.usage_log import UsageLog  # noqa: F401
from app.models.user import SubscriptionStatus, User, UserRole  # noqa: F401
from app.models.user_api_key import UserApiKey  # noqa: F401
from app.models.user_communication_setting import UserCommunicationSetting  # noqa: F401
from app.models.wallet import WalletCard, WalletProgram, WalletPushSubscription  # noqa: F401
from app.models.white_label import (  # noqa: F401
    Agency,
    ImpersonationAuditLog,
    PlatformConfig,
    ResellerSubscription,
    Tenant,
)
from app.models.widget_config import WidgetConfig  # noqa: F401
from app.models.widget_license import WidgetLicense  # noqa: F401
