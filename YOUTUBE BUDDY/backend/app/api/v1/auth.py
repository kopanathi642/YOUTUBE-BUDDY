from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_session
from app.core.security import create_access_token, get_current_user, token_to_profile, firebase_token_to_profile
from app.schemas.auth import FirebaseLoginRequest, SignInRequest, SignUpRequest, TokenResponse
from app.schemas.user import UserProfile, UserResponse
from app.services.auth import (
    authenticate_user,
    create_user,
    get_or_create_user,
    get_user_by_uid,
    assert_user_active,
    get_or_create_demo_user,
)

router = APIRouter()


@router.post("/signup", response_model=TokenResponse)
async def signup(payload: SignUpRequest, session: AsyncSession = Depends(get_session)) -> dict:
    user = await create_user(session, payload.email, payload.password, payload.display_name)
    access_token = create_access_token(
        subject=user.uid,
        additional_claims={
            "email": user.email,
            "name": user.display_name,
            "provider": user.provider,
        },
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=TokenResponse)
async def login(payload: SignInRequest, session: AsyncSession = Depends(get_session)) -> dict:
    user = await authenticate_user(session, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    await assert_user_active(user)
    access_token = create_access_token(
        subject=user.uid,
        additional_claims={
            "email": user.email,
            "name": user.display_name,
            "provider": user.provider,
        },
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/firebase-login", response_model=TokenResponse)
async def firebase_login(payload: FirebaseLoginRequest, session: AsyncSession = Depends(get_session)) -> dict:
    current_user = firebase_token_to_profile(payload.id_token)
    user = await get_or_create_user(session, current_user)
    await assert_user_active(user)
    access_token = create_access_token(
        subject=user.uid,
        additional_claims={
            "email": user.email,
            "name": user.display_name,
            "picture": user.picture,
            "provider": user.provider,
        },
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/dev-login", response_model=TokenResponse, include_in_schema=False)
async def dev_login(session: AsyncSession = Depends(get_session)) -> dict:
    if settings.ENVIRONMENT not in {"development", "test"} and not settings.DEBUG:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    user = await get_or_create_demo_user(session)
    await assert_user_active(user)
    access_token = create_access_token(
        subject=user.uid,
        additional_claims={
            "email": user.email,
            "name": user.display_name,
            "provider": user.provider,
        },
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/profile", response_model=UserResponse)
async def get_profile(current_user: UserProfile = Depends(get_current_user), session: AsyncSession = Depends(get_session)) -> UserResponse:
    user = await get_user_by_uid(session, current_user.uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user

