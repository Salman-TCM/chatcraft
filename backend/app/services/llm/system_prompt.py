from dataclasses import dataclass


@dataclass
class SystemPromptContext:
    chatbot_name: str = "ChatCraft AI"
    custom_instructions: str | None = None
    # RAG chunks injected at query time (Phase 4)
    knowledge_context: str | None = None


_BASE_TEMPLATE = """You are {chatbot_name}, a helpful AI assistant.

Be concise, accurate, and professional. If you don't know something, say so.
Never fabricate facts, sources, or statistics.
{custom_block}{knowledge_block}"""


def build_system_prompt(ctx: SystemPromptContext) -> str:
    custom_block = (
        f"\nAdditional instructions:\n{ctx.custom_instructions}\n"
        if ctx.custom_instructions
        else ""
    )
    knowledge_block = (
        f"\nRelevant knowledge base context:\n{ctx.knowledge_context}\n"
        if ctx.knowledge_context
        else ""
    )
    return _BASE_TEMPLATE.format(
        chatbot_name=ctx.chatbot_name,
        custom_block=custom_block,
        knowledge_block=knowledge_block,
    ).strip()
