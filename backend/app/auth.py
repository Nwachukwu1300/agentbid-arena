"""Authentication utilities and dependencies for FastAPI routes."""

from fastapi import Depends, Header, HTTPException
from uuid import UUID
from typing import Optional

from app.services.database import DatabaseService, get_database_service


async def get_current_user_id(
    authorization: Optional[str] = Header(None, description="Bearer token from Supabase Auth"),
    db: DatabaseService = Depends(get_database_service),
) -> UUID:
    """
    Extract and validate user ID from Supabase JWT token.
    Raises 401 if token is invalid or missing.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization[7:]

    try:
        user_response = await db.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return UUID(user_response.user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_optional_user_id(
    authorization: Optional[str] = Header(None, description="Bearer token from Supabase Auth"),
    db: DatabaseService = Depends(get_database_service),
) -> Optional[UUID]:
    """
    Extract user ID from Supabase JWT token if present.
    Returns None if no token provided (allows public access).
    """
    if not authorization:
        return None

    if not authorization.startswith("Bearer "):
        return None

    token = authorization[7:]

    try:
        user_response = await db.auth.get_user(token)
        if not user_response or not user_response.user:
            return None
        return UUID(user_response.user.id)
    except Exception:
        return None
