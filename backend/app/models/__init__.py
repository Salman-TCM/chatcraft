# Import all models here so Base.metadata is fully populated when
# Alembic reads it in env.py. Add each new model file as it is created.
from app.models.base import Base, TimestampMixin  # noqa: F401
from app.models.user import User, UserRole, SubscriptionStatus  # noqa: F401
from app.models.subscription import Subscription  # noqa: F401
from app.models.payment import Payment  # noqa: F401
from app.models.chatbot_config import ChatbotConfig  # noqa: F401
from app.models.conversation import Conversation  # noqa: F401
from app.models.message import Message, MessageRole, MessageFeedback  # noqa: F401
from app.models.knowledge_base import (  # noqa: F401
    KnowledgeBaseDocument,
    KnowledgeBaseChunk,
    DocumentType,
    DocumentStatus,
    EMBEDDING_DIM,
)
from app.models.widget_config import WidgetConfig  # noqa: F401
from app.models.inbox import (  # noqa: F401
    ConversationChannel,
    ConversationStatus,
    InternalNote,
    TeamMember,
    InboxAssignment,
)
from app.models.channel_integration import ChannelIntegration  # noqa: F401
from app.models.flow import Flow, FlowRun  # noqa: F401
from app.models.automation import (  # noqa: F401
    Automation, Sequence, SequenceEnrollment, Keyword,
)
from app.models.form import Form, FormSubmission, LandingPage  # noqa: F401
from app.models.commerce import CommerceStore, CommerceProduct, CommercePayment  # noqa: F401
from app.models.wallet import WalletProgram, WalletCard, WalletPushSubscription  # noqa: F401
from app.models.broadcast import BroadcastCampaign, SocialAccount, SocialPost, CommentAutomation  # noqa: F401
from app.models.mcp import MCPServerConfig  # noqa: F401
from app.models.browser import BrowserSession  # noqa: F401
from app.models.crm import (  # noqa: F401
    Contact,
    Tag,
    ContactTag,
    CustomField,
    CustomFieldType,
    ContactFieldValue,
    Pipeline,
    PipelineStage,
    PipelineDeal,
)
from app.models.api_token import ApiToken  # noqa: F401
from app.models.user_api_key import UserApiKey  # noqa: F401
from app.models.user_communication_setting import UserCommunicationSetting  # noqa: F401
from app.models.white_label import (  # noqa: F401
    PlatformConfig,
    Agency,
    Tenant,
    ImpersonationAuditLog,
    ResellerSubscription,
)
from app.models.usage_log import UsageLog  # noqa: F401
from app.models.analytics_daily import AnalyticsDaily  # noqa: F401
from app.models.widget_license import WidgetLicense  # noqa: F401
from app.models.admin_log import AdminActionLog  # noqa: F401
