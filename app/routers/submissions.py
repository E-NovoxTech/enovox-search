from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
from fastapi import BackgroundTasks


from .. import models, schemas
from ..database import get_db
from ..utils import generate_slug, send_submission_alert
from .developers import get_current_developer
from ..indexnow_utils import submit_to_indexnow

router = APIRouter(prefix="/submissions", tags=["Submissions"])



@router.post("/")
def submit_product(
    submission: schemas.SubmissionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_dev: models.Developer = Depends(get_current_developer)
):
    data = submission.dict()
    data["email"] = current_dev.email
    new_submission = models.Submission(**data, developer_id=current_dev.id, status="pending")
    db.add(new_submission)
    db.commit()
    db.refresh(new_submission)

    background_tasks.add_task(
        send_submission_alert,
        product_name=new_submission.name,
        developer_email=current_dev.email,
        category=new_submission.category
    )

    return {"message": "Submission received. We'll review it shortly.", "id": new_submission.id}

@router.get("/")
def list_submissions(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    return db.query(models.Submission).filter(models.Submission.status == "pending").all()


@router.get("/me")
def my_submissions(current_dev: models.Developer = Depends(get_current_developer), db: Session = Depends(get_db)):
    return db.query(models.Submission).filter(
        models.Submission.developer_id == current_dev.id,
        models.Submission.status == "pending"
    ).all()


@router.get("/admin/all")
def list_all_submissions(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    return db.query(models.Submission).order_by(models.Submission.id.desc()).all()


@router.get("/{submission_id}", response_model=schemas.SubmissionDetail)
def get_submission_detail(submission_id: int, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    return submission


@router.post("/{submission_id}/approve")
def approve_submission(submission_id: int, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.product_id:
        # This is an EDIT to an existing product — apply changes, republish
        product = db.query(models.Product).filter(models.Product.id == submission.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Linked product not found")

        editable_fields = [
            "name", "description", "category", "pricing", "pricing_details",
            "website", "product_type", "logo_url", "appstore_url", "playstore_url",
            "user_count_range", "founder", "twitter_url",
            "instagram_url", "facebook_url", "linkedin_url", "keywords",
            "contact_email", "github_url"
        ]
        for field in editable_fields:
            value = getattr(submission, field)
            if value is not None:
                setattr(product, field, value)

        if submission.company is not None:
            product.company_name = submission.company

        product.status = True
        submission.status = "approved"
        db.commit()
        db.refresh(product)

        submit_to_indexnow(f"/product/{product.slug}")

        return {"message": f"Edit to {product.name} approved and live."}

    else:
        # Brand-new submission — your original logic, unchanged
        new_product = models.Product(
            slug=generate_slug(submission.name, db),
            name=submission.name,
            description=submission.description,
            keywords=submission.keywords,
            pricing_details=submission.pricing_details,
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
            contact_email=submission.contact_email,
            github_url=submission.github_url,
            status=True,
        )

        db.add(new_product)
        submission.status = "approved"
        db.commit()
        db.refresh(new_product)

        submit_to_indexnow(f"/product/{new_product.slug}")

        return {"message": f"{new_product.name} approved and now live.", "product_id": new_product.id, "slug": new_product.slug}
    
    
@router.post("/{submission_id}/reject")
def reject_submission(submission_id: int, admin_key: str, payload: schemas.RejectSubmission, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    submission.status = "rejected"
    submission.rejection_reason = payload.reason

    # If this was an edit to an existing product, restore visibility — original data untouched
    if submission.product_id:
        product = db.query(models.Product).filter(models.Product.id == submission.product_id).first()
        if product:
            product.status = True

    db.commit()

    return {"message": f"{submission.name} rejected."}

@router.put("/{submission_id}/edit")
def edit_submission(
    submission_id: int,
    data: schemas.SubmissionEdit,
    db: Session = Depends(get_db),
    current_dev: models.Developer = Depends(get_current_developer)
):
    submission = db.query(models.Submission).filter(models.Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.developer_id != current_dev.id:
        raise HTTPException(status_code=403, detail="Not your submission")
    if submission.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending submissions can be edited")

    update_data = data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(submission, field, value)

    db.commit()
    db.refresh(submission)
    return submission