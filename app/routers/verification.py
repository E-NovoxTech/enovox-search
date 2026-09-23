from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from .. import models, schemas
from ..database import get_db
from ..auth import create_token
from ..email_utils import generate_verification_code, send_verification_email
from ..email_utils import send_password_reset_email
from ..auth import hash_password

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

@router.post("/forgot-password")
def forgot_password(data: schemas.ForgotPassword, db: Session = Depends(get_db)):
    Model = get_account_model(data.account_type)
    account = db.query(Model).filter(Model.email == data.email).first()

    if not account:
        # Don't reveal whether the email exists — same response either way
        return {"message": "If an account with that email exists, a reset code has been sent."}

    if account.auth_provider == "google" or not account.hashed_password:
        return {"message": "This account uses Google Sign-In. There's no password to reset — please log in with the 'Continue with Google' button."}

    code = generate_verification_code()
    account.reset_code = code
    account.reset_code_expires = datetime.utcnow() + timedelta(minutes=15)
    db.commit()

    send_password_reset_email(account.email, code)

    return {"message": "If an account with that email exists, a reset code has been sent."}


@router.post("/reset-password")
def reset_password(data: schemas.ResetPassword, db: Session = Depends(get_db)):
    Model = get_account_model(data.account_type)
    account = db.query(Model).filter(Model.email == data.email).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if not account.reset_code or account.reset_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid reset code")

    if account.reset_code_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset code expired")

    account.hashed_password = hash_password(data.new_password)
    account.reset_code = None
    account.reset_code_expires = None
    db.commit()

    return {"message": "Password reset successfully. You can now log in with your new password."}