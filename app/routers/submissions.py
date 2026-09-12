from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os

from .. import models, schemas
from ..database import get_db
from ..utils import generate_slug, send_submission_alert
from .developers import get_current_developer

router = APIRouter(prefix="/submissions", tags=["Submissions"])


@router.post("/")
def submit_product(
    submission: schemas.SubmissionCreate,
    db: Session = Depends(get_db),
    current_dev: models.Developer = Depends(get_current_developer)
):
    data = submission.dict()
    data["email"] = current_dev.email  # always use the logged-in developer's real email
    new_submission = models.Submission(**data, developer_id=current_dev.id)
    db.add(new_submission)
    db.commit()
    db.refresh(new_submission)
    
    # Trigger email alert to admin
    send_submission_alert(
        product_name=new_submission.name,
        developer_email=current_dev.email,
        category=new_submission.category
    )
    
    return {"message": "Submission received. We'll review it shortly.", "id": new_submission.id}


@router.get("/")
def list_submissions(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    return db.query(models.Submission).filter(models.Submission.reviewed == False).all()


@router.get("/me")
def my_submissions(current_dev: models.Developer = Depends(get_current_developer), db: Session = Depends(get_db)):
    return db.query(models.Submission).filter(
        models.Submission.developer_id == current_dev.id,
        models.Submission.reviewed == False
    ).all()


@router.post("/{submission_id}/approve")
def approve_submission(submission_id: int, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    new_product = models.Product(
        slug=generate_slug(submission.name, db),
        name=submission.name,
        description=submission.description,
        category=submission.category,
        pricing=submission.pricing,
        website=submission.website,
        product_type=submission.product_type,
        logo_url=submission.logo_url,
        appstore_url=submission.appstore_url,
        playstore_url=submission.playstore_url,
        user_count_range=submission.user_count_range,
        developer_id=submission.developer_id,
        founder=submission.founder,
        company_name=submission.company,
        twitter_url=submission.twitter_url,
        instagram_url=submission.instagram_url,
        facebook_url=submission.facebook_url,
        linkedin_url=submission.linkedin_url,
        status=True,
    )
    db.add(new_product)

    submission.reviewed = True
    db.commit()
    db.refresh(new_product)

    return {"message": f"{new_product.name} approved and now live.", "product_id": new_product.id, "slug": new_product.slug}


@router.get("/admin/all")
def list_all_submissions(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    submissions = db.query(models.Submission).order_by(models.Submission.id.desc()).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "category": s.category,
            "email": s.email,
            "status": "approved" if s.reviewed else "pending",
        }
        for s in submissions
    ]