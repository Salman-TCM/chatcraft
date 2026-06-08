#!/usr/bin/env python3
import asyncio
from app.core.security import hash_password
from app.models.user import User, UserRole
from sqlalchemy import select
from app.db.session import AsyncSessionLocal

async def create_superadmin():
    async with AsyncSessionLocal() as db:
        # Check if superadmin already exists
        existing = await db.scalar(select(User).where(User.email == "superadmin@chatcraft.ai"))
        if existing:
            if existing.role == UserRole.superadmin:
                print(f"✓ Superadmin already exists: {existing.email}")
                return
            existing.role = UserRole.superadmin
            await db.commit()
            print(f"✓ Upgraded {existing.email} to superadmin role")
            return
        
        # Create superadmin
        superadmin = User(
            email="superadmin@chatcraft.ai",
            password_hash=hash_password("SuperAdmin@123"),
            name="Super Admin",
            role=UserRole.superadmin,
            email_verified=True,
        )
        db.add(superadmin)
        await db.commit()
        await db.refresh(superadmin)
        
        print(f"✓ Superadmin created successfully!")
        print(f"  Email: superadmin@chatcraft.ai")
        print(f"  Password: SuperAdmin@123")
        print(f"  Role: {superadmin.role}")
        print(f"  ID: {superadmin.id}")

asyncio.run(create_superadmin())
