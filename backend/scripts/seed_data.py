"""
Staging seed data — populates a fresh database with realistic demo data.

Usage (inside the backend container or with venv active):
  python scripts/seed_data.py

Environment variables read from .env / process environment:
  DATABASE_URL, SECRET_KEY (required)

Creates:
  - 1 admin user          admin@chatcraft.ai / SeedAdmin99!
  - 3 regular users       alice/bob/carol@example.com / Seed1234!
  - 2 chatbots per user   (published)
  - 5 conversations + 10 messages per chatbot
  - 3 CRM contacts per user
  - 1 knowledge-base document per chatbot (text, status=ready)
"""

import asyncio
import os
import sys
import uuid
from datetime import UTC, datetime, timedelta

# Allow running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.chatbot_config import ChatbotConfig
from app.models.conversation import Conversation, ConversationStatus
from app.models.crm import Contact
from app.models.knowledge_base import DocumentStatus, DocumentType, KnowledgeBaseDocument
from app.models.message import Message, MessageRole
from app.models.user import User, UserRole

# ── helpers ────────────────────────────────────────────────────────────────────


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()


def _now(offset_days: int = 0) -> datetime:
    return datetime.now(UTC) + timedelta(days=offset_days)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


# ── seed ───────────────────────────────────────────────────────────────────────


async def seed(db: AsyncSession) -> None:
    print("[seed] Seeding demo data...")

    # ── Admin ──────────────────────────────────────────────────────────────────
    admin = User(
        id=_uuid(),
        email="admin@chatcraft.ai",
        password_hash=_hash("SeedAdmin99!"),
        name="Platform Admin",
        role=UserRole.admin,
        email_verified=True,
        created_at=_now(-60),
    )
    db.add(admin)

    # ── Regular users ──────────────────────────────────────────────────────────
    users_data = [
        ("alice@example.com", "Alice Demo", UserRole.premium),
        ("bob@example.com", "Bob Demo", UserRole.free),
        ("carol@example.com", "Carol Demo", UserRole.trial),
    ]
    users: list[User] = []
    for email, name, role in users_data:
        u = User(
            id=_uuid(),
            email=email,
            password_hash=_hash("Seed1234!"),
            name=name,
            role=role,
            email_verified=True,
            created_at=_now(-30),
        )
        db.add(u)
        users.append(u)

    await db.flush()

    # ── Chatbots ───────────────────────────────────────────────────────────────
    bot_names = [
        ("Customer Support Bot", "You are a helpful customer support agent."),
        ("Sales Assistant", "You are a friendly sales assistant."),
    ]
    all_bots: list[ChatbotConfig] = []
    for user in users:
        for name, prompt in bot_names:
            bot = ChatbotConfig(
                id=_uuid(),
                user_id=user.id,
                name=name,
                system_prompt=prompt,
                default_model="gpt-4o-mini",
                published=True,
                embed_token=str(uuid.uuid4()),
                primary_colour="#4F46E5",
                placeholder_text="Ask me anything...",
                created_at=_now(-20),
            )
            db.add(bot)
            all_bots.append(bot)

    await db.flush()

    # ── Conversations + messages ───────────────────────────────────────────────
    sample_qa = [
        ("Hi there!", "Hello! How can I help you today?"),
        ("What are your hours?", "We're available 24/7 via this chat."),
        ("Do you offer refunds?", "Yes, we offer a 30-day money-back guarantee."),
        ("How do I reset my password?", "Click 'Forgot password' on the login page."),
        ("Thanks, that's helpful!", "You're welcome! Is there anything else I can help with?"),
    ]
    for bot in all_bots:
        for i in range(5):
            conv = Conversation(
                id=_uuid(),
                chatbot_id=bot.id,
                user_id=bot.user_id,
                title=f"Conversation {i + 1}",
                status=ConversationStatus.open,
                channel="webchat",
                created_at=_now(-i),
                last_message_at=_now(-i),
            )
            db.add(conv)
            await db.flush()

            for j, (q, a) in enumerate(sample_qa):
                db.add(
                    Message(
                        id=_uuid(),
                        conversation_id=conv.id,
                        role=MessageRole.user,
                        content=q,
                        created_at=_now(-i) + timedelta(minutes=j * 2),
                    )
                )
                db.add(
                    Message(
                        id=_uuid(),
                        conversation_id=conv.id,
                        role=MessageRole.assistant,
                        content=a,
                        model="gpt-4o-mini",
                        input_tokens=20,
                        output_tokens=30,
                        cost_usd=0.000_05,
                        created_at=_now(-i) + timedelta(minutes=j * 2 + 1),
                    )
                )

    # ── CRM contacts ───────────────────────────────────────────────────────────
    contact_data = [
        ("John Smith", "john@demo.com", "+447700900001"),
        ("Jane Doe", "jane@demo.com", "+447700900002"),
        ("Sam Taylor", "sam@demo.com", "+447700900003"),
    ]
    for user in users:
        for name, email, phone in contact_data:
            db.add(
                Contact(
                    id=_uuid(),
                    user_id=user.id,
                    name=name,
                    email=email,
                    phone=phone,
                    created_at=_now(-15),
                )
            )

    # ── Knowledge-base documents ───────────────────────────────────────────────
    for bot in all_bots:
        db.add(
            KnowledgeBaseDocument(
                id=_uuid(),
                chatbot_id=bot.id,
                name="Product FAQ.txt",
                type=DocumentType.text,
                status=DocumentStatus.ready,
                raw_content=(
                    "Q: What is ChatCraft?\n"
                    "A: ChatCraft is an AI chatbot platform.\n\n"
                    "Q: How do I get started?\n"
                    "A: Sign up at chatcraft.ai and create your first chatbot in minutes.\n"
                ),
                chunk_count=2,
                token_count=60,
                created_at=_now(-10),
            )
        )

    await db.commit()
    print("[seed] Done.")
    print()
    print("  admin@chatcraft.ai     / SeedAdmin99!")
    for u in users:
        print(f"  {u.email:<28} / Seed1234!")


# ── entry point ────────────────────────────────────────────────────────────────


async def main() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as db:
        await seed(db)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
