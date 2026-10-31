from datetime import date, datetime, timedelta
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
from ..email_utils import send_claim_code_email
from ..email_utils import generate_verification_code
from datetime import timezone
from zoneinfo import ZoneInfo
from fastapi import Response
from fastapi.responses import StreamingResponse
import csv
import io

from sqlalchemy import desc
from app.routers.developers import get_current_developer

from .. import models, schemas
from ..database import get_db
from ..utils import generate_slug
from ..indexnow_utils import submit_to_indexnow
from ..routers.users import get_current_user
from sqlalchemy import func
from ..product_fetch_utils import fetch_page_text
from ..ai_router import ask_ai
import json as _json
from ..newsletter_utils import build_spotlight_update_html, build_alternative_update_html, build_article_update_html


router = APIRouter(prefix="/products", tags=["Products"])


def normalize_sql(column):
    return func.replace(func.replace(func.lower(column), '-', ''), ' ', '')

def apply_filters(q, query, category, pricing, product_type, platform, featured, is_popular, is_new_arrival, db=None):
    if query:
        normalized_query = query.lower().replace('-', '').replace(' ', '')
        words = query.split()
        word_filters = []
        for word in words:
            normalized_word = word.lower().replace('-', '').replace(' ', '')
            word_filters.append(normalize_sql(models.Product.name).ilike(f"%{normalized_word}%"))
            word_filters.append(normalize_sql(models.Product.description).ilike(f"%{normalized_word}%"))
            word_filters.append(normalize_sql(models.Product.category).ilike(f"%{normalized_word}%"))
            word_filters.append(normalize_sql(models.Product.keywords).ilike(f"%{normalized_word}%"))

        if db is not None:
            matching_tool_ids = [
                t.id for t in db.query(models.ForeignTool.id).filter(
                    normalize_sql(models.ForeignTool.name).ilike(f"%{normalized_query}%")
                ).all()
            ]
            if matching_tool_ids:
                alt_product_ids = [
                    row.product_id for row in db.query(models.ProductAlternative.product_id).filter(
                        models.ProductAlternative.foreign_tool_id.in_(matching_tool_ids)
                    ).all()
                ]
                if alt_product_ids:
                    word_filters.append(models.Product.id.in_(alt_product_ids))

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

    def normalize(text):
        return (text or "").lower().replace('-', '').replace(' ', '')

    words = query.lower().split()
    score = 0

    name_norm = normalize(product.name)
    category_norm = normalize(product.category)
    keywords_norm = normalize(product.keywords)
    description_norm = normalize(product.description)

    for word in words:
        normalized_word = normalize(word)
        if normalized_word in category_norm or category_norm in normalized_word:
            score += 10
        if normalized_word in name_norm:
            score += 7
        if normalized_word in keywords_norm:
            score += 5
        if normalized_word in description_norm:
            score += 1

    return score
@router.get("/autocomplete")
def autocomplete_search(query: str, db: Session = Depends(get_db)):
    if len(query) < 2:
        return []

    normalized_query = query.lower().replace('-', '').replace(' ', '')

    products = (
        db.query(models.Product)
        .filter(models.Product.status == True)
        .filter(
            or_(
                normalize_sql(models.Product.name).ilike(f"%{normalized_query}%"),
                normalize_sql(models.Product.category).ilike(f"%{normalized_query}%"),
                normalize_sql(models.Product.keywords).ilike(f"%{normalized_query}%")
            )
        )
        .limit(8)
        .all()
    )

    return [
        {
            "name": p.name,
            "slug": p.slug,
            "category": p.category,
            "logo_url": p.logo_url
        }
        for p in products
    ]
    
@router.get("/alternatives/foreign-tools/autocomplete")
def autocomplete_foreign_tools(query: str, db: Session = Depends(get_db)):
    if len(query) < 2:
        return []

    normalized_query = query.lower().replace('-', '').replace(' ', '')

    tools = (
        db.query(models.ForeignTool)
        .filter(normalize_sql(models.ForeignTool.name).ilike(f"%{normalized_query}%"))
        .limit(8)
        .all()
    )

    return [{"name": t.name, "slug": t.slug, "logo_url": t.logo_url} for t in tools]

@router.get("/banner")
def get_banner(db: Session = Depends(get_db)):
    banner = db.query(models.SiteBanner).first()
    if not banner or not banner.is_active:
        return {"is_active": False}

    return {
        "is_active": True,
        "message": banner.message,
        "link_url": banner.link_url,
        "link_text": banner.link_text,
        "link_style": banner.link_style,
        "is_marquee": banner.is_marquee,
        "updated_at": str(banner.updated_at)
    }


@router.put("/admin/banner")
def update_banner(admin_key: str, data: schemas.BannerUpdate, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    banner = db.query(models.SiteBanner).first()
    if not banner:
        banner = models.SiteBanner()
        db.add(banner)

    update_data = data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(banner, field, value)

    banner.updated_at = date.today()
    db.commit()
    db.refresh(banner)

    return {"message": "Banner updated.", "banner": banner}



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
    q = apply_filters(q, query, category, pricing, product_type, platform, featured, is_popular, is_new_arrival, db)
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
    q = apply_filters(q, query, category, pricing, product_type, platform, featured, is_popular, is_new_arrival, db)

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


@router.post("/{product_id}/claim/start")
def start_claim(
    product_id: int,
    data: schemas.ClaimStart,
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
    domain_matches = claimant_domain and product_domain and claimant_domain == product_domain

    code = generate_verification_code()
    claim = models.ClaimRequest(
        product_id=product_id,
        developer_id=current_dev.id,
        name=data.name,
        email=data.email,
        role=data.role,
        social_url=data.social_url,
        status="pending",
        verification_code=code if domain_matches else None,
        verification_code_expires=datetime.utcnow() + timedelta(minutes=15) if domain_matches else None,
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)

    if domain_matches:
        send_claim_code_email(data.email, code, product.name)
        return {"claim_id": claim.id, "needs_code": True, "message": f"We sent a code to {data.email}. Enter it to verify ownership."}

    return {"claim_id": claim.id, "needs_code": False, "message": "That email doesn't match the product's domain, so this needs admin review instead."}


@router.post("/{product_id}/claim/{claim_id}/verify")
def verify_claim(
    product_id: int,
    claim_id: int,
    data: schemas.ClaimVerify,
    db: Session = Depends(get_db),
    current_dev: models.Developer = Depends(get_current_developer)
):
    claim = db.query(models.ClaimRequest).filter(
        models.ClaimRequest.id == claim_id,
        models.ClaimRequest.product_id == product_id,
        models.ClaimRequest.developer_id == current_dev.id,
    ).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="This claim was already processed")
    if not claim.verification_code or claim.verification_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid code")
    if claim.verification_code_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Code expired, request a new claim")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    product.developer_id = current_dev.id
    claim.status = "approved"
    claim.verification_code = None
    db.commit()
    return {"message": "Ownership verified — you now manage this listing."}


@router.post("/{product_id}/claim/{claim_id}/submit-for-review")
def submit_claim_for_review(
    product_id: int,
    claim_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_dev: models.Developer = Depends(get_current_developer)
):
    claim = db.query(models.ClaimRequest).filter(
        models.ClaimRequest.id == claim_id,
        models.ClaimRequest.product_id == product_id,
        models.ClaimRequest.developer_id == current_dev.id,
    ).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != "pending":
        raise HTTPException(status_code=400, detail="This claim was already processed")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    claim.verification_code = None
    background_tasks.add_task(send_claim_alert, product_name=product.name, claimant_name=claim.name, claimant_email=claim.email, role=claim.role)
    db.commit()
    return {"message": "Claim submitted for review. We'll verify ownership and get back to you."}

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

@router.post("/admin/newsletter/send-spotlight-update")
def send_spotlight_update(admin_key: str, data: schemas.NewsletterSpotlightSend, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    spotlights = db.query(models.Spotlight).filter(
        models.Spotlight.id.in_(data.spotlight_ids), models.Spotlight.status == "published"
    ).all()
    if not spotlights:
        raise HTTPException(status_code=400, detail="No matching published spotlights found")

    html_body = build_spotlight_update_html(data.title, data.intro, spotlights)
    recipients = get_all_recipients(db)
    if not recipients:
        return {"message": "No recipients to send to.", "sent": 0}

    results = send_newsletter(recipients, data.title, html_body)
    return {"message": f"Newsletter sent to {results['sent']} recipients.", **results}


@router.post("/admin/newsletter/send-alternative-update")
def send_alternative_update(admin_key: str, data: schemas.NewsletterAlternativeSend, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    tools = db.query(models.ForeignTool).filter(models.ForeignTool.id.in_(data.foreign_tool_ids)).all()
    if not tools:
        raise HTTPException(status_code=400, detail="No matching foreign tools found")

    html_body = build_alternative_update_html(data.title, data.intro, tools)
    recipients = get_all_recipients(db)
    if not recipients:
        return {"message": "No recipients to send to.", "sent": 0}

    results = send_newsletter(recipients, data.title, html_body)
    return {"message": f"Newsletter sent to {results['sent']} recipients.", **results}


@router.post("/admin/newsletter/send-article-update")
def send_article_update(admin_key: str, data: schemas.NewsletterArticleSend, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    articles = db.query(models.Article).filter(
        models.Article.id.in_(data.article_ids), models.Article.status == "published"
    ).all()
    if not articles:
        raise HTTPException(status_code=400, detail="No matching published articles found")

    html_body = build_article_update_html(data.title, data.intro, articles)
    recipients = get_all_recipients(db)
    if not recipients:
        return {"message": "No recipients to send to.", "sent": 0}

    results = send_newsletter(recipients, data.title, html_body)
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

@router.post("/admin/developers/send-update")
def send_developer_update(admin_key: str, data: schemas.DeveloperUpdateSend, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    if not data.recipient_emails:
        return {"message": "No developers selected.", "sent": 0}

    html_body = wrap_in_template(data.subject, data.html_body)
    results = send_newsletter(data.recipient_emails, data.subject, html_body)
    return {"message": f"Update sent to {results['sent']} developers.", **results}

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

@router.post("/{product_id}/save")
def toggle_save_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_account = Depends(get_current_user)
):
    if not current_account:
        raise HTTPException(status_code=401, detail="Please log in to save products")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    account_type = "developer" if isinstance(current_account, models.Developer) else "user"

    existing = db.query(models.SavedProduct).filter(
        models.SavedProduct.account_type == account_type,
        models.SavedProduct.account_id == current_account.id,
        models.SavedProduct.product_id == product_id
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {"message": "Product removed from saved list.", "saved": False}
    else:
        new_save = models.SavedProduct(
            account_type=account_type,
            account_id=current_account.id,
            product_id=product_id
        )
        db.add(new_save)
        db.commit()
        return {"message": "Product saved.", "saved": True}
    
    
@router.get("/me/saved", response_model=List[schemas.ProductOut])
def get_saved_products(
    db: Session = Depends(get_db),
    current_account = Depends(get_current_user)
):
    if not current_account:
        raise HTTPException(status_code=401, detail="Please log in to view saved products")

    account_type = "developer" if isinstance(current_account, models.Developer) else "user"

    saved_entries = db.query(models.SavedProduct).filter(
        models.SavedProduct.account_type == account_type,
        models.SavedProduct.account_id == current_account.id
    ).all()

    product_ids = [entry.product_id for entry in saved_entries]

    if not product_ids:
        return []

    products = db.query(models.Product).filter(
        models.Product.id.in_(product_ids),
        models.Product.status == True
    ).all()

    return products


@router.get("/admin/export-csv")
def export_products_csv(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    products = db.query(models.Product).order_by(models.Product.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Name", "Description", "Category", "Website", "Founder", "Company", "Contact Email",
        "Pricing", "Pricing Details", "Status", "Developer ID", "Date Added",
        "Keywords", "Twitter", "Instagram", "Facebook", "LinkedIn", "GitHub"
    ])

    for p in products:
        writer.writerow([
            p.name, p.description, p.category, p.website, p.founder, p.company_name, p.contact_email,
            p.pricing, p.pricing_details, "Active" if p.status else "Inactive", p.developer_id, p.created_at,
            p.keywords, p.twitter_url, p.instagram_url, p.facebook_url, p.linkedin_url, p.github_url
        ])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=enovox_products_export.csv"}
    )
    
@router.post("/admin/alternatives/foreign-tools")
def create_foreign_tool(admin_key: str, data: schemas.ForeignToolCreate, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    slug = generate_slug(data.name, db, models.ForeignTool)
    new_tool = models.ForeignTool(
        name=data.name,
        slug=slug,
        logo_url=data.logo_url,
        description=data.description,
        category=data.category
    )
    db.add(new_tool)
    db.commit()
    db.refresh(new_tool)
    return new_tool


@router.get("/admin/alternatives/foreign-tools")
def list_foreign_tools_admin(admin_key: str, category: Optional[str] = None, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    q = db.query(models.ForeignTool)
    if category:
        q = q.filter(models.ForeignTool.category == category)
    tools = q.order_by(models.ForeignTool.created_at.desc()).all()

    result = []
    for tool in tools:
        count = db.query(models.ProductAlternative).filter(models.ProductAlternative.foreign_tool_id == tool.id).count()
        result.append({
            "id": tool.id, "name": tool.name, "slug": tool.slug, "logo_url": tool.logo_url,
            "description": tool.description, "category": tool.category,
            "created_at": tool.created_at, "alternative_count": count
        })
    return result


@router.delete("/admin/alternatives/foreign-tools/{tool_id}")
def delete_foreign_tool(tool_id: int, admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    tool = db.query(models.ForeignTool).filter(models.ForeignTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Foreign tool not found")

    db.query(models.ProductAlternative).filter(models.ProductAlternative.foreign_tool_id == tool_id).delete()
    db.delete(tool)
    db.commit()
    return {"message": f"{tool.name} deleted."}

# ---------- Homepage daily foreign-tool comparisons ----------

# Display order of categories. Names must match ForeignTool.category (case-insensitive).
# TODO: complete this list with all your real categories.
HOMEPAGE_CATEGORY_ORDER = [
    "AI & Automation",
    "Fintech",
    "Education",
    "Business", 
    "Productivity",
    "E-commerce",
    "Web3 & Blockchain",
    "Design & Creative",
    "Transportation & Logistics", 
    "Health & Wellness",
    "Entertainment & Media",
    "Freelance & Gig Work",
    "Real Estate & Housing",
    "Agriculture",
    "Social & Community",
    "Developer Tools",
    "Legal & Compliance",
    "Energy & Utilities",
    "Travel & Tourism",
    "Gaming & Esports",
    "Other"
]

try:
    LAGOS_TZ = ZoneInfo("Africa/Lagos")
except Exception:
    LAGOS_TZ = timezone(timedelta(hours=1))  # Lagos has no DST, so a fixed offset is safe

_DAILY_EPOCH = date(2024, 1, 1)
_DAILY_CACHE = {"date": None, "built_at": None, "payload": None}
_DAILY_CACHE_TTL_SECONDS = 300  # admin edits show up within 5 minutes


def _tool_dict(t):
    return {"id": t.id, "name": t.name, "slug": t.slug,
            "logo_url": t.logo_url, "description": t.description}


def _alt_dict(p):
    return {"id": p.id, "name": p.name, "slug": p.slug, "logo_url": p.logo_url,
            "description": p.description, "category": p.category}


def _build_daily_comparisons(db: Session, today: date, expires_at: datetime):
    # One bulk query: every foreign tool joined to its ACTIVE linked products
    rows = (
        db.query(models.ForeignTool, models.Product)
        .join(models.ProductAlternative, models.ProductAlternative.foreign_tool_id == models.ForeignTool.id)
        .join(models.Product, models.Product.id == models.ProductAlternative.product_id)
        .filter(models.Product.status == True)
        .filter(models.ForeignTool.category.isnot(None))
        .order_by(models.ForeignTool.id.asc(), models.Product.id.asc())
        .all()
    )

    # tool_id -> {"tool": ForeignTool, "alts": [Product, ...]}
    tools = {}
    for tool, product in rows:
        if not (tool.category or "").strip():
            continue
        entry = tools.setdefault(tool.id, {"tool": tool, "alts": []})
        entry["alts"].append(product)

    # category (lowercase key) -> {"display": str, "tools": [entry, ...]}
    categories = {}
    for tool_id in sorted(tools):
        entry = tools[tool_id]
        display = entry["tool"].category.strip()
        cat = categories.setdefault(display.lower(), {"display": display, "tools": []})
        cat["tools"].append(entry)

    # Category order: listed ones first, then the rest alphabetically
    ordered_keys = []
    for name in HOMEPAGE_CATEGORY_ORDER:
        k = name.strip().lower()
        if k in categories and k not in ordered_keys:
            ordered_keys.append(k)
    ordered_keys += sorted(k for k in categories if k not in ordered_keys)

    base = {"date": today.isoformat(), "expires_at": expires_at.isoformat()}
    if not ordered_keys:
        return {**base, "groups": []}

    # Daily deterministic pick per category
    day_number = (today - _DAILY_EPOCH).days
    cards_by_key = {}
    for cat_index, key in enumerate(ordered_keys):
        cat = categories[key]
        n = len(cat["tools"])
        seed = day_number + cat_index
        entry = cat["tools"][seed % n]
        alts = entry["alts"]
        alt = alts[(seed // n) % len(alts)]
        cards_by_key[key] = {
            "category": cat["display"],
            "foreign_tool": _tool_dict(entry["tool"]),
            "alternative": _alt_dict(alt),
            "view_all_url": f"/alternative/{entry['tool'].slug}",
        }

    # Groups of 4 (fewer than 4 categories = one smaller group, no padding)
    if len(ordered_keys) < 4:
        key_groups = [ordered_keys]
    else:
        key_groups = []
        for i in range(0, len(ordered_keys), 4):
            chunk = ordered_keys[i:i + 4]
            if len(chunk) < 4:
                chunk = chunk + ordered_keys[:4 - len(chunk)]  # wrap to the start
            key_groups.append(chunk)

    groups = [
        {"group_index": gi, "cards": [cards_by_key[k] for k in chunk]}
        for gi, chunk in enumerate(key_groups)
    ]
    return {**base, "groups": groups}


@router.get("/alternatives/daily-comparisons")
def get_daily_comparisons(response: Response, db: Session = Depends(get_db)):
    now = datetime.now(LAGOS_TZ)
    today = now.date()
    next_midnight = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=LAGOS_TZ)
    seconds_left = max(60, int((next_midnight - now).total_seconds()))

    cache = _DAILY_CACHE
    fresh = (
        cache["date"] == today.isoformat()
        and cache["built_at"] is not None
        and (now - cache["built_at"]).total_seconds() < _DAILY_CACHE_TTL_SECONDS
    )
    if not fresh:
        cache["payload"] = _build_daily_comparisons(db, today, next_midnight)
        cache["date"] = today.isoformat()
        cache["built_at"] = now

    # Browsers/CDN may cache up to 5 min or until midnight, whichever is sooner
    response.headers["Cache-Control"] = f"public, max-age={min(seconds_left, _DAILY_CACHE_TTL_SECONDS)}"
    return cache["payload"]

@router.get("/alternatives/foreign-tools")
def list_foreign_tools_public(category: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.ForeignTool)
    if category:
        q = q.filter(models.ForeignTool.category == category)
    tools = q.all()

    result = []
    for tool in tools:
        count = db.query(models.ProductAlternative).filter(models.ProductAlternative.foreign_tool_id == tool.id).count()
        result.append({
            "id": tool.id, "name": tool.name, "slug": tool.slug,
            "logo_url": tool.logo_url, "description": tool.description,
            "category": tool.category, "alternative_count": count
        })
    return result


@router.get("/alternatives/foreign-tools/{slug}")
def get_foreign_tool_alternatives(slug: str, db: Session = Depends(get_db)):
    tool = db.query(models.ForeignTool).filter(models.ForeignTool.slug == slug).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Foreign tool not found")

    links = db.query(models.ProductAlternative).filter(models.ProductAlternative.foreign_tool_id == tool.id).all()
    product_ids = [l.product_id for l in links]
    products = db.query(models.Product).filter(
        models.Product.id.in_(product_ids),
        models.Product.status == True
    ).all()

    return {
        "foreign_tool": {"name": tool.name, "slug": tool.slug, "logo_url": tool.logo_url, "description": tool.description},
        "alternatives": products
    }


@router.get("/{product_id}/alternatives")
def get_product_alternatives(product_id: int, db: Session = Depends(get_db)):
    links = db.query(models.ProductAlternative).filter(models.ProductAlternative.product_id == product_id).all()
    tool_ids = [l.foreign_tool_id for l in links]
    return db.query(models.ForeignTool).filter(models.ForeignTool.id.in_(tool_ids)).all()


@router.put("/admin/{product_id}/alternatives")
def update_product_alternatives(product_id: int, admin_key: str, data: schemas.ProductAlternativesUpdate, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    db.query(models.ProductAlternative).filter(models.ProductAlternative.product_id == product_id).delete()

    for tool_id in data.foreign_tool_ids:
        db.add(models.ProductAlternative(product_id=product_id, foreign_tool_id=tool_id))

    db.commit()
    return {"message": "Alternatives updated.", "foreign_tool_ids": data.foreign_tool_ids}

@router.put("/admin/alternatives/foreign-tools/{tool_id}")
def update_foreign_tool(tool_id: int, admin_key: str, data: schemas.ForeignToolCreate, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    tool = db.query(models.ForeignTool).filter(models.ForeignTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Foreign tool not found")

    tool.name = data.name
    tool.logo_url = data.logo_url
    tool.description = data.description
    tool.category = data.category
    db.commit()
    db.refresh(tool)
    return tool

@router.get("/admin/dashboard-summary")
def dashboard_summary(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    return {
        "total_products": db.query(models.Product).filter(models.Product.status == True).count(),
        "pending_submissions": db.query(models.Submission).filter(models.Submission.status == "pending").count(),
        "pending_claims": db.query(models.ClaimRequest).filter(models.ClaimRequest.status == "pending").count(),
        "developers": db.query(models.Developer).count(),
        "newsletter_subscribers": len(get_all_recipients(db)),
        "total_searches": db.query(models.SearchLog).count(),
        "pending_spotlights": db.query(models.SpotlightApplication).filter(models.SpotlightApplication.status == "pending").count(),
    }


@router.get("/admin/claims/all")
def list_all_claims(admin_key: str, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return db.query(models.ClaimRequest).order_by(models.ClaimRequest.id.desc()).all()


MAX_SPONSORED = 10

@router.get("/sponsored/public")
def public_sponsored(db: Session = Depends(get_db)):
    return (
        db.query(models.Product)
        .filter(models.Product.is_sponsored == True, models.Product.status == True)
        .order_by(models.Product.sponsored_position.asc())
        .limit(MAX_SPONSORED)
        .all()
    )




@router.put("/{product_id}/sponsor")
def toggle_sponsor(product_id: int, admin_key: str, sponsored: Optional[bool] = None, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    target = (not product.is_sponsored) if sponsored is None else sponsored

    if target and not product.is_sponsored:
        active_count = db.query(models.Product).filter(models.Product.is_sponsored == True).count()
        if active_count >= MAX_SPONSORED:
            raise HTTPException(status_code=400, detail=f"Only {MAX_SPONSORED} sponsored slots allowed at once")
        max_pos = db.query(func.max(models.Product.sponsored_position)).scalar() or 0
        product.sponsored_position = max_pos + 1

    product.is_sponsored = target
    if not target:
        product.sponsored_position = None

    db.commit()
    return {"message": "Updated.", "is_sponsored": product.is_sponsored}

@router.put("/sponsored/reorder")
def reorder_sponsored(admin_key: str, data: schemas.SponsoredReorder, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    for index, pid in enumerate(data.ids):
        db.query(models.Product).filter(models.Product.id == pid).update({"sponsored_position": index})
    db.commit()
    return {"message": "Order saved."}

FILLABLE_FIELDS = [
    "name", "keywords", "pricing_details", "website", "logo_url",
    "appstore_url", "playstore_url", "platform", "twitter_url",
    "instagram_url", "facebook_url", "linkedin_url", "github_url",
    "description", "contact_email",
]


@router.post("/admin/fetch-from-url")
def fetch_product_from_url(admin_key: str, data: schemas.ProductFetchRequest, db: Session = Depends(get_db)):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")

    page = fetch_page_text(data.url)
    if "error" in page:
        raise HTTPException(status_code=502, detail=page["error"])

    prompt = f"""You are extracting product information from a company website's text, for a Nigerian tech directory.
Use ONLY what is actually present on the page. If a field isn't mentioned, leave it as an empty string, never guess or invent anything.

Page text:
{page['text']}

Links found on the page: {', '.join(page['found_links']) or 'none'}

Reply with ONLY one JSON object and nothing else. Keys:
name, keywords (comma-separated, max 5, based on what the product actually does), pricing_details, website, logo_url, appstore_url, playstore_url, platform (e.g. "Web", "iOS", "Android", "Web, iOS, Android" — only what's evidenced), twitter_url, instagram_url, facebook_url, linkedin_url, github_url, description (2-3 sentences, factual, no marketing fluff), contact_email."""

    try:
        raw = ask_ai(prompt)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI provider failed: {e}")

    draft = _extract_json_safe(raw)
    if not draft:
        raise HTTPException(status_code=502, detail="AI replied in an unexpected format. Try again.")

    result = {field: str(draft.get(field, "") or "") for field in FILLABLE_FIELDS}

    if not result["logo_url"] and page.get("og_image"):
        result["logo_url"] = page["og_image"]
    if not result["website"]:
        result["website"] = data.url

    return {"draft": result, "source_url": data.url}


def _extract_json_safe(text: str):
    import re
    if not text:
        return None
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return _json.loads(text[start:end + 1])
    except _json.JSONDecodeError:
        return None

