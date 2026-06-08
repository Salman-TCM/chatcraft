"""
Admin seed script.

Usage:
    # Inside the backend container (interactive — prompts for password):
    docker compose exec backend python seed_admin.py

    # Non-interactive (CI / first-deploy):
    docker compose exec -e ADMIN_EMAIL=admin@example.com \
                        -e ADMIN_PASSWORD=MySecret123! \
                        backend python seed_admin.py

Environment variables (override CLI prompts):
    ADMIN_EMAIL     — email for the admin account
    ADMIN_PASSWORD  — password (min 8 chars, 1 uppercase, 1 digit)
    ADMIN_NAME      — display name  (default: "Admin")
"""

import asyncio
import os
import sys

from sqlalchemy import select

# Make sure the app package is on the path when run directly
sys.path.insert(0, os.path.dirname(__file__))

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole


# ── Helpers ───────────────────────────────────────────────────────────────────

def _prompt(label: str, secret: bool = False) -> str:
    import getpass
    fn = getpass.getpass if secret else input
    value = fn(f"{label}: ").strip()
    if not value:
        print(f"ERROR: {label} cannot be empty.")
        sys.exit(1)
    return value


def _validate_password(password: str) -> None:
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not any(c.isupper() for c in password):
        errors.append("at least one uppercase letter")
    if not any(c.isdigit() for c in password):
        errors.append("at least one digit")
    if errors:
        print(f"ERROR: Password must contain {', '.join(errors)}.")
        sys.exit(1)


# ── Main ──────────────────────────────────────────────────────────────────────

async def seed() -> None:
    email    = os.environ.get("ADMIN_EMAIL")    or _prompt("Admin email")
    password = os.environ.get("ADMIN_PASSWORD") or _prompt("Admin password", secret=True)
    name     = os.environ.get("ADMIN_NAME", "Admin")
    role_str = os.environ.get("ADMIN_ROLE", "superadmin")

    try:
        role = UserRole(role_str)
    except ValueError:
        print(f"ERROR: Invalid ADMIN_ROLE '{role_str}'. Valid values: {[r.value for r in UserRole]}")
        sys.exit(1)

    _validate_password(password)

    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(User).where(User.email == email.lower()))

        if existing:
            if existing.role == role:
                print(f"✓ User '{email}' already exists with role '{role.value}' — no changes made.")
                return

            existing.role = role
            existing.password_hash = hash_password(password)
            await db.commit()
            print(f"✓ Existing user '{email}' updated to role '{role.value}'.")
            return

        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            name=name,
            role=role,
            email_verified=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        print(f"✓ User created: {email}  role={role.value}  (id: {user.id})")


if __name__ == "__main__":
    asyncio.run(seed())
