"""
RBAC integration tests — role boundaries across subscription tiers and team roles.

Coverage:
  1. Unauthenticated → 401 on every protected endpoint
  2. Regular (free) user → 403 on admin endpoints
  3. Admin user → 200 on admin endpoints
  4. Team agent → 403 on manager-only inbox actions (close, reopen, assign, roundrobin)
  5. Team agent → 404 on unassigned conversation (data isolation)
  6. Team agent → 200 on their assigned conversation
  7. Team agent → list returns only assigned conversations
"""

import uuid
import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.user import User, UserRole
from app.models.chatbot_config import ChatbotConfig
from app.models.conversation import Conversation
from app.models.inbox import InboxAssignment, TeamMember

REGISTER = "/api/auth/register"
LOGIN = "/api/auth/login"
CONVS = "/api/v1/conversations"
TEAM = "/api/v1/team"
ADMIN_USERS = "/api/admin/users"


# ── Auth helpers ───────────────────────────────────────────────────────────────

async def _register_login(client, email: str, password: str = "TestPass99!", name: str = "User") -> str:
    await client.post(REGISTER, json={"email": email, "password": password, "name": name})
    r = await client.post(LOGIN, json={"email": email, "password": password})
    return r.json()["data"]["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── 1. Unauthenticated → 401 ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_conversations_requires_auth(client):
    r = await client.get(CONVS)
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_admin_users_requires_auth(client):
    r = await client.get(ADMIN_USERS)
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_team_requires_auth(client):
    r = await client.get(TEAM)
    assert r.status_code in (401, 403)


# ── 2. Free user → admin endpoints → 403 ──────────────────────────────────────

@pytest.mark.asyncio
async def test_free_user_cannot_access_admin_users(client):
    token = await _register_login(client, "free_user_rbac@example.com")
    r = await client.get(ADMIN_USERS, headers=_h(token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_free_user_cannot_access_admin_action_log(client):
    token = await _register_login(client, "free_log_rbac@example.com")
    r = await client.get("/api/admin/action-log", headers=_h(token))
    assert r.status_code == 403


# ── 3. Admin user → admin endpoints → 200 ─────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_user_can_access_admin_users(client, db_session):
    email = "admin_rbac@example.com"
    token = await _register_login(client, email)

    # Promote to admin directly in DB
    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    user.role = UserRole.admin
    await db_session.commit()

    r = await client.get(ADMIN_USERS, headers=_h(token))
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_admin_can_read_action_log(client, db_session):
    email = "admin_log_rbac@example.com"
    token = await _register_login(client, email)

    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    user.role = UserRole.admin
    await db_session.commit()

    r = await client.get("/api/admin/action-log", headers=_h(token))
    assert r.status_code == 200
    assert "data" in r.json()


# ── Fixtures: owner + agent + conversation setup ───────────────────────────────

@pytest_asyncio.fixture
async def team_setup(client, db_session):
    """
    Returns (owner_token, agent_token, conv_id).
    Owner has one chatbot with two conversations; the agent is assigned to one.
    """
    owner_email = f"owner_{uuid.uuid4().hex[:6]}@example.com"
    agent_email = f"agent_{uuid.uuid4().hex[:6]}@example.com"

    owner_token = await _register_login(client, owner_email, name="Owner")
    agent_token = await _register_login(client, agent_email, name="Agent")

    # Fetch owner and agent user IDs
    o_result = await db_session.execute(select(User).where(User.email == owner_email))
    owner = o_result.scalar_one()
    a_result = await db_session.execute(select(User).where(User.email == agent_email))
    agent_user = a_result.scalar_one()

    # Create chatbot owned by owner
    bot = ChatbotConfig(user_id=owner.id, name="RBAC Bot", default_model="gpt-4o-mini")
    db_session.add(bot)
    await db_session.flush()

    # Create two conversations
    conv_assigned = Conversation(chatbot_id=bot.id, channel="web", status="active", title="Assigned Conv")
    conv_other = Conversation(chatbot_id=bot.id, channel="web", status="active", title="Other Conv")
    db_session.add_all([conv_assigned, conv_other])
    await db_session.flush()

    # Assign one conversation to the agent
    assignment = InboxAssignment(conversation_id=conv_assigned.id, assigned_to_user_id=agent_user.id)
    db_session.add(assignment)

    # Add agent as team member (role=agent) of the owner
    membership = TeamMember(
        owner_user_id=owner.id,
        member_user_id=agent_user.id,
        member_email=agent_email,
        role="agent",
        status="active",
    )
    db_session.add(membership)
    await db_session.commit()

    return owner_token, agent_token, str(conv_assigned.id), str(conv_other.id)


# ── 4. Team agent → manager-only actions → 403 ────────────────────────────────

@pytest.mark.asyncio
async def test_agent_cannot_close_conversation(client, team_setup):
    owner_token, agent_token, conv_assigned_id, _ = team_setup
    r = await client.post(f"{CONVS}/{conv_assigned_id}/close", headers=_h(agent_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_agent_cannot_reopen_conversation(client, team_setup):
    owner_token, agent_token, conv_assigned_id, _ = team_setup
    r = await client.post(f"{CONVS}/{conv_assigned_id}/reopen", headers=_h(agent_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_agent_cannot_assign_conversation(client, team_setup):
    owner_token, agent_token, conv_assigned_id, _ = team_setup
    r = await client.post(
        f"{CONVS}/{conv_assigned_id}/assign",
        json={"user_id": str(uuid.uuid4())},
        headers=_h(agent_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_agent_cannot_roundrobin(client, team_setup):
    owner_token, agent_token, conv_assigned_id, _ = team_setup
    r = await client.post(f"{CONVS}/{conv_assigned_id}/assign-roundrobin", headers=_h(agent_token))
    assert r.status_code == 403


# ── 5. Team agent → unassigned conversation → 404 (data isolation) ─────────────

@pytest.mark.asyncio
async def test_agent_cannot_view_unassigned_conversation(client, team_setup):
    _, agent_token, _, conv_other_id = team_setup
    r = await client.get(f"{CONVS}/{conv_other_id}", headers=_h(agent_token))
    assert r.status_code == 404


# ── 6. Team agent → assigned conversation → 200 ───────────────────────────────

@pytest.mark.asyncio
async def test_agent_can_view_assigned_conversation(client, team_setup):
    _, agent_token, conv_assigned_id, _ = team_setup
    r = await client.get(f"{CONVS}/{conv_assigned_id}", headers=_h(agent_token))
    assert r.status_code == 200
    assert r.json()["data"]["id"] == conv_assigned_id


# ── 7. Team agent → list → only their assigned conversations ──────────────────

@pytest.mark.asyncio
async def test_agent_list_shows_only_assigned(client, team_setup):
    _, agent_token, conv_assigned_id, conv_other_id = team_setup
    r = await client.get(CONVS, headers=_h(agent_token))
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()["data"]]
    assert conv_assigned_id in ids
    assert conv_other_id not in ids


# ── 8. Owner → can still close/reopen (sanity) ────────────────────────────────

@pytest.mark.asyncio
async def test_owner_can_close_conversation(client, team_setup):
    owner_token, _, conv_assigned_id, _ = team_setup
    r = await client.post(f"{CONVS}/{conv_assigned_id}/close", headers=_h(owner_token))
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "closed"
