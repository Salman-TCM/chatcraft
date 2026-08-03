import uuid

from pydantic import BaseModel, ConfigDict, Field


class FormCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    chatbot_id: uuid.UUID | None = None
    description: str | None = Field(None, max_length=2000)
    # [{id, type, label, placeholder, required, options, help_text}] — dynamic, per-form field definitions
    fields: list = Field(default_factory=list)
    is_active: bool = True
    success_message: str = Field("Thank you! We'll be in touch.", max_length=500)
    submit_button_text: str = Field("Submit", max_length=100)


class FormUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    fields: list | None = None
    is_active: bool | None = None
    success_message: str | None = Field(None, max_length=500)
    submit_button_text: str | None = Field(None, max_length=100)
    chatbot_id: uuid.UUID | None = None


class PublicFormSubmitRequest(BaseModel):
    """Public, unauthenticated form submission payload.

    The actual answers are keyed by dynamic, per-form field IDs (defined in
    Form.fields), so this can't be a fixed set of Pydantic fields — it stays
    a free-form blob. A few well-known keys are called out because the
    handler special-cases them (contact matching), but any other key is
    still accepted and preserved.
    """

    model_config = ConfigDict(extra="allow")

    email: str | None = None
    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None
