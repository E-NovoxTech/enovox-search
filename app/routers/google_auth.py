from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import os

from .. import models, schemas
from ..database import get_db
from ..auth import create_token

router = APIRouter(tags=["Google Auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")


@router.post("/auth/google")
def google_auth(data: schemas.GoogleAuth, db: Session = Depends(get_db)):
    try:
        idinfo = id_token.verify_oauth2_token(
            data.credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = idinfo.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    # Check both tables — existing account of either type logs straight in
    developer = db.query(models.Developer).filter(models.Developer.email == email).first()
    if developer:
        token = create_token(developer.id, "developer")
        return {"access_token": token, "account_type": "developer", "new_account": False}

    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        token = create_token(user.id, "user")
        return {"access_token": token, "account_type": "user", "new_account": False}

    # No existing account — needs account_type from the choose-screen
    if not data.account_type:
        return {"new_account": True, "email": email}

    if data.account_type == "developer":
        new_developer = models.Developer(
            email=email,
            hashed_password=None,
            is_verified=True,
            auth_provider="google"
        )
        db.add(new_developer)
        db.commit()
        db.refresh(new_developer)
        token = create_token(new_developer.id, "developer")
        return {"access_token": token, "account_type": "developer", "new_account": True}

    elif data.account_type == "user":
        new_user = models.User(
            email=email,
            hashed_password=None,
            is_verified=True,
            auth_provider="google"
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        token = create_token(new_user.id, "user")
        return {"access_token": token, "account_type": "user", "new_account": True}

    raise HTTPException(status_code=400, detail="Invalid account type")