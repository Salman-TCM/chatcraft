import enum
import uuid

from sqlalchemy import (
    Boolean,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class CustomFieldType(str, enum.Enum):
    text = "text"
    number = "number"
    date = "date"
    email = "email"
    phone = "phone"
    url = "url"
    textarea = "textarea"
    select = "select"
    checkbox = "checkbox"


class Contact(TimestampMixin, Base):
    __tablename__ = "contacts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # External / channel identifiers
    public_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    contact_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    first_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relationships
    tags: Mapped[list["Tag"]] = relationship(
        "Tag", secondary="contact_tags", back_populates="contacts", lazy="selectin"
    )
    field_values: Mapped[list["ContactFieldValue"]] = relationship(
        "ContactFieldValue", back_populates="contact", cascade="all, delete-orphan"
    )
    pipeline_deals: Mapped[list["PipelineDeal"]] = relationship(
        "PipelineDeal", back_populates="contact"
    )


class Tag(TimestampMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tags_user_name"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1", server_default="#6366f1")

    contacts: Mapped[list["Contact"]] = relationship(
        "Contact", secondary="contact_tags", back_populates="tags"
    )


class ContactTag(Base):
    """Junction table — no TimestampMixin, no surrogate PK."""
    __tablename__ = "contact_tags"

    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )


class CustomField(TimestampMixin, Base):
    __tablename__ = "custom_fields"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chatbot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    field_type: Mapped[CustomFieldType] = mapped_column(
        Enum(CustomFieldType, name="custom_field_type"), nullable=False
    )
    # For "select" type: list of allowed options stored as JSON array
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    is_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    default_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope: Mapped[str] = mapped_column(
        String(50), nullable=False, default="contact", server_default="contact"
    )

    values: Mapped[list["ContactFieldValue"]] = relationship(
        "ContactFieldValue", back_populates="field", cascade="all, delete-orphan"
    )


class ContactFieldValue(Base):
    """Stores the actual value of a custom field for a contact."""
    __tablename__ = "contact_field_values"
    __table_args__ = (
        UniqueConstraint("contact_id", "field_id", name="uq_contact_field"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default="gen_random_uuid()",
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    field_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("custom_fields.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value: Mapped[str | None] = mapped_column(Text, nullable=True)

    contact: Mapped["Contact"] = relationship("Contact", back_populates="field_values")
    field: Mapped["CustomField"] = relationship("CustomField", back_populates="values")


class Pipeline(TimestampMixin, Base):
    __tablename__ = "pipelines"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chatbot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1", server_default="#6366f1")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    stages: Mapped[list["PipelineStage"]] = relationship(
        "PipelineStage",
        back_populates="pipeline",
        cascade="all, delete-orphan",
        order_by="PipelineStage.order",
        lazy="selectin",
    )
    deals: Mapped[list["PipelineDeal"]] = relationship(
        "PipelineDeal", back_populates="pipeline", cascade="all, delete-orphan"
    )


class PipelineStage(TimestampMixin, Base):
    __tablename__ = "pipeline_stages"

    pipeline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pipelines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1", server_default="#6366f1")
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    pipeline: Mapped["Pipeline"] = relationship("Pipeline", back_populates="stages")
    deals: Mapped[list["PipelineDeal"]] = relationship(
        "PipelineDeal", back_populates="stage"
    )


class PipelineDeal(TimestampMixin, Base):
    __tablename__ = "pipeline_deals"

    pipeline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pipelines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pipeline_stages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    deal_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    pipeline: Mapped["Pipeline"] = relationship("Pipeline", back_populates="deals")
    stage: Mapped["PipelineStage"] = relationship("PipelineStage", back_populates="deals")
    contact: Mapped["Contact"] = relationship("Contact", back_populates="pipeline_deals", lazy="selectin")
