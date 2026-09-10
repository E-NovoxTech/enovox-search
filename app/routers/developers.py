from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
import os

from .. import models, schemas
from ..database import get_db
from ..auth import hash_password, verify_password, create_token, decode_token

router = APIRouter(prefix="/developers", tags=["Developers"])


def get_current_developer(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.replace("Bearer ", "")
    developer_id = decode_token(token)

    if not developer_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    developer = db.query(models.Developer).filter(models.Developer.id == developer_id).first()
    if not developer:
        raise HTTPException(status_code=401, detail="Developer not found")

    return developer


@router.post("/signup", response_model=schemas.TokenResponse)
def signup(data: schemas.DeveloperSignup, db: Session = Depends(get_db)):
    existing = db.query(models.Developer).filter(models.Developer.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_developer = models.Developer(
        email=data.email,
        hashed_password=hash_password(data.password)
    )
    db.add(new_developer)
    db.commit()
    db.refresh(new_developer)

    token = create_token(new_developer.id)
    return {"access_token": token}


@router.post("/login", response_model=schemas.TokenResponse)
def login(data: schemas.DeveloperLogin, db: Session = Depends(get_db)):
    developer = db.query(models.Developer).filter(models.Developer.email == data.email).first()
    if not developer or not verify_password(data.password, developer.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(developer.id)
    return {"access_token": token}


@router.get("/me/products")
def my_products(current_dev: models.Developer = Depends(get_current_developer), db: Session = Depends(get_db)):
    return db.query(models.Product).filter(models.Product.developer_id == current_dev.id).all()


@router.get("/admin/all")
def list_all_developers(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    return db.query(models.Developer).all()