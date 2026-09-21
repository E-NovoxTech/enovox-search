from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional, List
import os
from urllib.parse import urlparse
from fastapi import BackgroundTasks
from ..utils import send_claim_alert
from fastapi import UploadFile, File
from ..bulk_upload_utils import parse_csv_to_rows
from ..newsletter_utils import get_all_recipients, build_product_update_html, wrap_in_template, send_newsletter

from sqlalchemy import desc
from app.routers.developers import get_current_developer

from .. import models, schemas
from ..database import get_db
from ..utils import generate_slug
from ..indexnow_utils import submit_to_indexnow

router = APIRouter(prefix="/products", tags=["Products"])

def apply_filters(q, query, category, pricing, product_type, platform, featured, is_popular, is_new_arrival):
    if query:
        words = query.split()
        word_filters = []
        for word in words:
            word_filters.append(models.Product.name.ilike(f"%{word}%"))
            word_filters.append(models.Product.description.ilike(f"%{word}%"))
            word_filters.append(models.Product.category.ilike(f"%{word}%"))
            word_filters.append(models.Product.keywords.ilike(f"%{word}%"))
        q = q.filter(or_(*word_filters))

    if category:
        category_filters = [models.Product.category.ilike(c) for c in category]
        q = q.filter(or_(*category_filters))

    if pricing:
        q = q.filter(models.Product.pricing.ilike(pricing))

    if product_type:
        q = q.filter(models.Product.product_type.ilike(product_type))

    if platform:
        q = q.filter(models.Product.platform.ilike(f"%{platform}%"))

    if featured is not None:
        q = q.filter(models.Product.featured == featured)

    if is_popular is not None:
        q = q.filter(models.Product.is_popular == is_popular)

    if is_new_arrival is not None:
        q = q.filter(models.Product.is_new_arrival == is_new_arrival)

    return q

def score_product_relevance(product, query: str) -> int:
    if not query:
        return 0

    query_lower = query.lower()
    words = query_lower.split()
    score = 0

    name_lower = (product.name or "").lower()
    category_lower = (product.category or "").lower()
    keywords_lower = (product.keywords or "").lower()
    description_lower = (product.description or "").lower()

    for word in words:
        if word in category_lower or category_lower in word:
            score += 10
        if word in name_lower:
            score += 7
        if word in keywords_lower:
            score += 5
        if word in description_lower:
            score += 1

    return score

@router.get("/categories/counts")
def category_counts(db: Session = Depends(get_db)):
    results = (
        db.query(models.Product.category, func.count(models.Product.id))
        .filter(models.Product.status == True)
        .group_by(models.Product.category)
        .all()
    )
    return {category: count for category, count in results}


@router.get("/count")
def count_products(
    query: Optional[str] = None,
    category: Optional[List[str]] = Query(None),
    pricing: Optional[str] = None,
    product_type: Optional[str] = None,
    platform: Optional[str] = None,
    featured: Optional[bool] = None,
    is_popular: Optional[bool] = None,
    is_new_arrival: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Product).filter(models.Product.status == True)
    q = apply_filters(q, query, category, pricing, product_type, platform, featured, is_popular, is_new_arrival)
    return {"total": q.count()}


@router.get("/", response_model=List[schemas.ProductOut])
def search_products(
    query: Optional[str] = None,
    category: Optional[List[str]] = Query(None),
    pricing: Optional[str] = None,
    product_type: Optional[str] = None,
    platform: Optional[str] = None,
    featured: Optional[bool] = None,
    is_popular: Optional[bool] = None,
    is_new_arrival: Optional[bool] = None,
    sort: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    q = db.query(models.Product).filter(models.Product.status == True)
    q = apply_filters(q, query, category, pricing, product_type, platform, featured, is_popular, is_new_arrival)

    if query and not sort:
        all_matches = q.all()
        scored = [(score_product_relevance(p, query), p) for p in all_matches]
        scored.sort(key=lambda x: x[0], reverse=True)
        results = [p for score, p in scored]
        final_results = results[offset:offset + limit]

        log_entry = models.SearchLog(query=query, results_count=len(all_matches))
        db.add(log_entry)
        db.commit()

        return final_results

    if sort == "name_asc":
        q = q.order_by(models.Product.name.asc())
    elif sort == "name_desc":
        q = q.order_by(models.Product.name.desc())
    elif sort == "newest":
        q = q.order_by(models.Product.created_at.desc())

    final_results = q.offset(offset).limit(limit).all()

    if query:
        log_entry = models.SearchLog(query=query, results_count=q.count())
        db.add(log_entry)
        db.commit()

    return final_results

@router.get("/admin/all")
def list_all_products_admin(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    return db.query(models.Product).order_by(models.Product.created_at.desc()).all()


@router.post("/{product_id}/reactivate")
def reactivate_product(product_id: int, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.status = True
    db.commit()
    return {"message": f"{product.name} reactivated."}


@router.post("/", response_model=schemas.ProductOut)
def create_product(product: schemas.ProductBase, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    new_product = models.Product(
        slug=generate_slug(product.name, db),
        status=True,
        **product.dict()
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    submit_to_indexnow(f"/product/{new_product.slug}")
    return new_product


@router.get("/{product_id}/similar", response_model=List[schemas.ProductOut])
def similar_products(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    similar = (
        db.query(models.Product)
        .filter(
            models.Product.category == product.category,
            models.Product.id != product.id,
            models.Product.status == True
        )
        .limit(4)
        .all()
    )
    return similar


@router.get("/{product_id}", response_model=schemas.ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.status == True
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


@router.put("/{product_id}")
def update_product(product_id: int, updates: schemas.ProductUpdate, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    for field, value in updates.dict(exclude_unset=True).items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    return {"message": f"{product.name} updated.", "product": product}


@router.delete("/{product_id}")
def deactivate_product(product_id: int, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.status = False
    db.commit()
    return {"message": f"{product.name} deactivated (hidden from public listing)."}


@router.get("/admin/claims")
def list_pending_claims(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    return db.query(models.ClaimRequest).filter(models.ClaimRequest.status == "pending").all()


@router.post("/admin/claims/{claim_id}/approve")
def approve_claim(claim_id: int, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    claim = db.query(models.ClaimRequest).filter(models.ClaimRequest.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="Claim already processed")

    product = db.query(models.Product).filter(models.Product.id == claim.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.developer_id = claim.developer_id
    claim.status = "approved"
    db.commit()

    return {"message": f"Claim approved. {product.name} is now owned by developer #{claim.developer_id}."}


@router.post("/admin/claims/{claim_id}/reject")
def reject_claim(claim_id: int, admin_key: str, payload: schemas.RejectSubmission, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    claim = db.query(models.ClaimRequest).filter(models.ClaimRequest.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="Claim already processed")

    claim.status = "rejected"
    claim.rejection_reason = payload.reason
    db.commit()

    return {"message": "Claim rejected."}



@router.put("/me/{product_id}/edit")
def edit_my_product(
    product_id: int,
    data: schemas.SubmissionEdit,
    db: Session = Depends(get_db),
    current_dev: models.Developer = Depends(get_current_developer)
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.developer_id != current_dev.id:
        raise HTTPException(status_code=403, detail="Not your product")

    update_data = data.dict(exclude_unset=True)

    # Start with the product's CURRENT values, then overlay only what changed
    edit_submission = models.Submission(
        name=update_data.get("name", product.name),
        company=update_data.get("company", product.company_name),
        founder=update_data.get("founder", product.founder),
        description=update_data.get("description", product.description),
        keywords=update_data.get("keywords", product.keywords),
        category=update_data.get("category", product.category),
        website=update_data.get("website", product.website),
        pricing=update_data.get("pricing", product.pricing),
        pricing_details=update_data.get("pricing_details", product.pricing_details),
        product_type=update_data.get("product_type", product.product_type),
        logo_url=update_data.get("logo_url", product.logo_url),
        appstore_url=update_data.get("appstore_url", product.appstore_url),
        playstore_url=update_data.get("playstore_url", product.playstore_url),
        user_count_range=update_data.get("user_count_range", product.user_count_range),
        twitter_url=update_data.get("twitter_url", product.twitter_url),
        instagram_url=update_data.get("instagram_url", product.instagram_url),
        facebook_url=update_data.get("facebook_url", product.facebook_url),
        linkedin_url=update_data.get("linkedin_url", product.linkedin_url),
        github_url=update_data.get("github_url", product.github_url),
        contact_email=update_data.get("contact_email", product.contact_email),
        email=current_dev.email,
        developer_id=current_dev.id,
        status="pending",
        product_id=product.id
    )

    db.add(edit_submission)
    product.status = False  # unpublish while edit is under review
    db.commit()
    db.refresh(edit_submission)

    return {"message": "Edit submitted for review. Product is temporarily hidden until approved.", "submission_id": edit_submission.id}

def extract_domain(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url if "://" in url else f"https://{url}")
    domain = parsed.netloc.lower()
    return domain.replace("www.", "")


@router.post("/{product_id}/claim")
def claim_product(
    product_id: int,
    background_tasks: BackgroundTasks,
    data: schemas.ClaimSubmit,
    db: Session = Depends(get_db),
    current_dev: models.Developer = Depends(get_current_developer)
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.developer_id is not None:
        raise HTTPException(status_code=400, detail="This product already has an owner")

    existing_claim = db.query(models.ClaimRequest).filter(
        models.ClaimRequest.product_id == product_id,
        models.ClaimRequest.developer_id == current_dev.id,
        models.ClaimRequest.status == "pending"
    ).first()
    if existing_claim:
        raise HTTPException(status_code=400, detail="You already have a pending claim on this product")

    claimant_domain = extract_domain(data.email.split("@")[-1])
    product_domain = extract_domain(product.website)

    auto_verified = claimant_domain and product_domain and claimant_domain == product_domain

    new_claim = models.ClaimRequest(
        product_id=product_id,
        developer_id=current_dev.id,
        name=data.name,
        email=data.email,
        role=data.role,
        social_url=data.social_url,
        status="approved" if auto_verified else "pending"
    )
    db.add(new_claim)

    if auto_verified:
        product.developer_id = current_dev.id
        db.commit()
        db.refresh(product)
        return {"message": "Ownership verified automatically — you now manage this listing.", "auto_verified": True}
    else:
        db.commit()
        db.refresh(new_claim)
        # Notify admin
        
        background_tasks.add_task(
            send_claim_alert,
            product_name=product.name,
            claimant_name=data.name,
            claimant_email=data.email,
            role=data.role
        )
        return {"message": "Claim submitted for review. We'll verify ownership and get back to you.", "auto_verified": False}

@router.post("/admin/bulk-preview")
async def bulk_preview(admin_key: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    contents = await file.read()
    rows = parse_csv_to_rows(contents)

    for row in rows:
        existing = db.query(models.Product).filter(models.Product.name == row["name"]).first()
        row["is_duplicate"] = existing is not None

    return {"total_rows": len(rows), "products": rows}


@router.post("/admin/bulk-publish")
def bulk_publish(admin_key: str, data: schemas.BulkPublishRequest, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    created = 0
    skipped = []

    for item in data.products:
        existing = db.query(models.Product).filter(models.Product.name == item.name).first()
        if existing:
            skipped.append({"name": item.name, "reason": "duplicate — product with this name already exists"})
            continue

        new_product = models.Product(
            slug=generate_slug(item.name, db),
            name=item.name,
            description=item.description,
            category=item.category,
            pricing=item.pricing,
            pricing_details=item.pricing_details,
            website=item.website,
            product_type=item.product_type,
            founder=item.founder,
            company_name=item.company,
            logo_url=item.logo_url,
            keywords=item.keywords,
            contact_email=item.contact_email,
            github_url=item.github_url,
            appstore_url=item.appstore_url,
            playstore_url=item.playstore_url,
            user_count_range=item.user_count_range,
            twitter_url=item.twitter_url,
            instagram_url=item.instagram_url,
            facebook_url=item.facebook_url,
            linkedin_url=item.linkedin_url,
            developer_id=None,
            status=True,
        )
        db.add(new_product)
        db.commit()
        db.refresh(new_product)
        submit_to_indexnow(f"/product/{new_product.slug}")
        created += 1

    return {"total_submitted": len(data.products), "created": created, "skipped_count": len(skipped), "skipped_details": skipped}

@router.post("/admin/newsletter/send-product-update")
def send_product_update(admin_key: str, data: schemas.NewsletterProductSend, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    products = db.query(models.Product).filter(models.Product.id.in_(data.product_ids)).all()
    if not products:
        raise HTTPException(status_code=400, detail="No matching products found")

    html_body = build_product_update_html(data.title, data.intro, products)
    recipients = get_all_recipients(db)

    if not recipients:
        return {"message": "No recipients to send to.", "sent": 0}

    results = send_newsletter(recipients, data.title, html_body)
    return {"message": f"Newsletter sent to {results['sent']} recipients.", **results}


@router.post("/admin/newsletter/send-custom")
def send_custom_newsletter(admin_key: str, data: schemas.NewsletterCustomSend, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    html_body = wrap_in_template(data.subject, data.html_body)
    recipients = get_all_recipients(db)

    if not recipients:
        return {"message": "No recipients to send to.", "sent": 0}

    results = send_newsletter(recipients, data.subject, html_body)
    return {"message": f"Newsletter sent to {results['sent']} recipients.", **results}


@router.post("/newsletter/subscribe")
def subscribe_newsletter(data: schemas.NewsletterSubscribe, db: Session = Depends(get_db)):
    existing = db.query(models.NewsletterSubscriber).filter(models.NewsletterSubscriber.email == data.email).first()
    if existing:
        return {"message": "You're already subscribed."}

    new_sub = models.NewsletterSubscriber(email=data.email)
    db.add(new_sub)
    db.commit()
    return {"message": "Subscribed successfully."}

@router.get("/admin/newsletter/subscribers")
def list_newsletter_subscribers(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    developers = db.query(models.Developer.email, models.Developer.newsletter_opt_in).filter(
        models.Developer.newsletter_opt_in == True
    ).all()

    users = db.query(models.User.email, models.User.newsletter_opt_in).filter(
        models.User.newsletter_opt_in == True
    ).all()

    standalone = db.query(models.NewsletterSubscriber.email, models.NewsletterSubscriber.created_at).all()

    return {
        "total": len(developers) + len(users) + len(standalone),
        "developers": [{"email": e, "source": "developer"} for e, _ in developers],
        "users": [{"email": e, "source": "user"} for e, _ in users],
        "standalone_subscribers": [{"email": e, "subscribed_at": c, "source": "standalone"} for e, c in standalone]
    }


@router.get("/unsubscribe")
def unsubscribe(email: str, db: Session = Depends(get_db)):
    db.query(models.NewsletterSubscriber).filter(models.NewsletterSubscriber.email == email).delete()

    dev = db.query(models.Developer).filter(models.Developer.email == email).first()
    if dev:
        dev.newsletter_opt_in = False

    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        user.newsletter_opt_in = False

    db.commit()
    return {"message": "You've been unsubscribed."}



@router.get("/admin/search-analytics")
def search_analytics(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    top_searches = (
        db.query(models.SearchLog.query, func.count(models.SearchLog.id).label("count"))
        .group_by(models.SearchLog.query)
        .order_by(desc("count"))
        .limit(15)
        .all()
    )

    zero_result_searches = (
        db.query(models.SearchLog.query, func.count(models.SearchLog.id).label("count"))
        .filter(models.SearchLog.results_count == 0)
        .group_by(models.SearchLog.query)
        .order_by(desc("count"))
        .limit(15)
        .all()
    )

    total_searches = db.query(models.SearchLog).count()

    return {
        "total_searches": total_searches,
        "top_searches": [{"query": q, "count": c} for q, c in top_searches],
        "zero_result_searches": [{"query": q, "count": c} for q, c in zero_result_searches]
    }