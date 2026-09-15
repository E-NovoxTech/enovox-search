from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from .. import models, schemas
from ..database import get_db
from ..auth import create_token
from ..email_utils import generate_verification_code, send_verification_email

router = APIRouter(tags=["Verification"])


def get_account_model(account_type: str):
    if account_type == "developer":
        return models.Developer
    elif account_type == "user":
        return models.User
    else:
        raise HTTPException(status_code=400, detail="Invalid account type")


@router.post("/verify-email")
def verify_email(data: schemas.VerifyEmail, db: Session = Depends(get_db)):
    Model = get_account_model(data.account_type)
    account = db.query(Model).filter(Model.email == data.email).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account.is_verified:
        return {"message": "Email already verified"}

    if not account.verification_code or account.verification_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    if account.verification_code_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Verification code expired")

    account.is_verified = True
    account.verification_code = None
    account.verification_code_expires = None
    db.commit()

    token = create_token(account.id, data.account_type)
    return {"access_token": token, "message": "Email verified successfully"}


@router.post("/resend-code")
def resend_code(data: schemas.ResendCode, db: Session = Depends(get_db)):
    Model = get_account_model(data.account_type)
    account = db.query(Model).filter(Model.email == data.email).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if account.is_verified:
        return {"message": "Email already verified"}

    code = generate_verification_code()
    account.verification_code = code
    account.verification_code_expires = datetime.utcnow() + timedelta(minutes=15)
    db.commit()

    send_verification_email(account.email, code)
    return {"message": "Verification code resent"}