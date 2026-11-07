from fastapi import APIRouter, HTTPException, Depends
from uuid import UUID

from app.models.user import User, UserUpdate
from app.auth import get_current_user_id
from app.services.database import DatabaseService, get_database_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=User)
async def get_current_user(
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseService = Depends(get_database_service),
) -> User:
    result = await db.table("users").select("*").eq("id", str(user_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = result.data[0]
    return User(
        id=user_data["id"],
        email=user_data["email"],
        created_at=user_data["created_at"],
        updated_at=user_data["updated_at"],
    )


@router.put("/me", response_model=User)
async def update_current_user(
    user_update: UserUpdate,
    user_id: UUID = Depends(get_current_user_id),
    db: DatabaseService = Depends(get_database_service),
) -> User:
    update_data = user_update.model_dump(exclude_unset=True)
    if not update_data:
        return await get_current_user(user_id, db)

    from datetime import datetime, timezone
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    result = await db.table("users").update(update_data).eq("id", str(user_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = result.data[0]
    return User(
        id=user_data["id"],
        email=user_data["email"],
        created_at=user_data["created_at"],
        updated_at=user_data["updated_at"],
    )
