from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional

from .. import models, schemas
from ..database import get_db
from ..auth import hash_password, verify_password, create_token, decode_token

router = APIRouter(prefix="/users", tags=["Users"])


def get_current_user(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        return None  # not logged in — allowed, just means anonymous tier

    token = authorization.replace("Bearer ", "")
    payload = decode_token(token)
    if not payload:
        return None

    if payload["type"] == "user":
        return db.query(models.User).filter(models.User.id == payload["account_id"]).first()
    elif payload["type"] == "developer":
        return db.query(models.Developer).filter(models.Developer.id == payload["account_id"]).first()

    return None


@router.post("/signup", response_model=schemas.TokenResponse)
def signup(data: schemas.UserSignup, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = models.User(email=data.email, hashed_password=hash_password(data.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_token(new_user.id, "user")
    return {"access_token": token}


@router.post("/login", response_model=schemas.TokenResponse)
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user.id, "user")
    return {"access_token": token}