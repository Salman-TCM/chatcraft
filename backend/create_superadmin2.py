#!/usr/bin/env python3
import asyncio
from app.core.security import hash_password
from app.models.user import User, UserRole
from sqlalchemy import select
from app.db.session import AsyncSessionLocal

async def create_superadmin():
    async with AsyncSessionLocal() as db:
        # Check if superadmin already exists
        existing = await db.scalar(select(User).where(User.email == "superadmin@gmail.com"))
        if existing:
            print(f"✓ Superadmin already exists: {existing.email}")
            return
        
        # Create superadmin
        superadmin = User(
            email="superadmin@gmail.com",
            password_hash=hash_password("Test@123"),
            name="Super Admin",
            role=UserRole.admin,
            email_verified=True,
        )
        db.add(superadmin)
        await db.commit()
        await db.refresh(superadmin)
        
        print(f"✓ Superadmin created successfully!")
        print(f"  Email: superadmin@gmail.com")
        print(f"  Password: Test@123")
        print(f"  Role: {superadmin.role}")
        print(f"  ID: {superadmin.id}")

asyncio.run(create_superadmin())
