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
