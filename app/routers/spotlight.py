import json
import os
import re
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..ai_router import ask_ai
from ..database import get_db
from ..routers.developers import get_current_developer
from ..routers.users import get_current_user
from ..email_utils import send_spotlight_published_email

router = APIRouter(prefix="/spotlight", tags=["Spotlight"])

NIGERIAN_STATES = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
    "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo",
    "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
    "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba",
    "Yobe", "Zamfara", "Abuja",
]
MAX_SKILLS = 5
MAX_PRODUCTS = 2


# ---------- HELPERS ----------

def check_admin(admin_key: str):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")


def startup_key(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', name.lower())


def clean_skills(skills: List[str]) -> Optional[str]:
    cleaned = []
    for s in skills:
        s = s.strip()
        if s and s.lower() not in [c.lower() for c in cleaned]:
            cleaned.append(s)
    if len(cleaned) > MAX_SKILLS:
        raise HTTPException(status_code=400, detail=f"Add at most {MAX_SKILLS} skills")
    return ",".join(cleaned) if cleaned else None


def validate_application(data: schemas.SpotlightApply, db: Session, current_id: Optional[int] = None, strict: bool = True):
    if data.save_as_draft:
        strict = False

    if strict:
        required = {
            "founder_name": data.founder_name, "photo_url": data.photo_url,
            "startup_name": data.startup_name, "state": data.state,
            "what_it_does": data.what_it_does, "vision": data.vision,
            "quote": data.quote,
        }
        missing = [name for name, value in required.items() if not (value or "").strip()]
        if missing:
            raise HTTPException(status_code=400, detail=f"Required: {', '.join(missing)}")
        if data.state not in NIGERIAN_STATES:
            raise HTTPException(status_code=400, detail="Choose a valid Nigerian state")
        if not data.consent or not data.guidelines_agreed:
            raise HTTPException(status_code=400, detail="You must consent to publication and agree to the Developer Guidelines")
        socials = [data.instagram_url, data.x_url, data.facebook_url, data.linkedin_url, data.tiktok_url, data.github_url]
        if not any((s or "").strip() for s in socials):
            raise HTTPException(status_code=400, detail="Add at least one social link")

    if len(set(data.product_ids)) > MAX_PRODUCTS:
        raise HTTPException(status_code=400, detail=f"Pick at most {MAX_PRODUCTS} products")

    if data.startup_name:
        key = startup_key(data.startup_name)
        clash = db.query(models.SpotlightApplication).filter(models.SpotlightApplication.startup_key == key)
        if current_id:
            clash = clash.filter(models.SpotlightApplication.id != current_id)
        if clash.first():
            raise HTTPException(status_code=400, detail="This startup has already applied for a spotlight")
        return key
    return None


def set_application_products(app_id: int, product_ids: List[int], developer_id: Optional[int], db: Session):
    db.query(models.SpotlightApplicationProduct).filter(
        models.SpotlightApplicationProduct.application_id == app_id
    ).delete()
    query = db.query(models.Product.id).filter(models.Product.id.in_(product_ids))
    if developer_id is not None:
        query = query.filter(models.Product.developer_id == developer_id)
    owned = {pid for (pid,) in query.all()}
    for pid in dict.fromkeys(product_ids):
        if pid in owned:
            db.add(models.SpotlightApplicationProduct(application_id=app_id, product_id=pid))


def fill_application(app: models.SpotlightApplication, data: schemas.SpotlightApply, key: Optional[str]):
    app.founder_name = data.founder_name
    app.photo_url = data.photo_url
    app.startup_name = data.startup_name
    app.startup_key = key or (startup_key(data.startup_name) if data.startup_name else f"draft-{id(app)}")
    app.state = data.state
    app.what_it_does = data.what_it_does
    app.challenges = data.challenges
    app.achievement = data.achievement
    app.vision = data.vision
    app.quote = data.quote
    app.why_nigeria = data.why_nigeria
    app.startup_website = data.startup_website
    app.skills = clean_skills(data.skills)
    app.instagram_url = data.instagram_url
    app.x_url = data.x_url
    app.facebook_url = data.facebook_url
    app.linkedin_url = data.linkedin_url
    app.tiktok_url = data.tiktok_url
    app.github_url = data.github_url
    app.open_to_work = data.open_to_work
    app.consent = data.consent
    app.guidelines_agreed = data.guidelines_agreed
    app.updated_at = date.today()

def _extract_json(text: str):
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
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None


def _generate_spotlight_slug(base_name: str, db: Session) -> str:
    base_slug = re.sub(r'[^a-z0-9]+', '-', base_name.lower()).strip('-') or "spotlight"
    slug, n = base_slug, 1
    while db.query(models.Spotlight).filter(models.Spotlight.slug == slug).first():
        n += 1
        slug = f"{base_slug}-{n}"
    return slug


def _public_card(s: models.Spotlight) -> dict:
    a = s.application
    return {
        "id": s.id, "slug": s.slug, "headline": s.headline, "summary": s.summary,
        "founder_name": a.founder_name, "startup_name": a.startup_name, "state": a.state,
        "photo_url": a.photo_url, "open_to_work": a.open_to_work, "published_at": s.published_at,
    }


# ---------- FOUNDER ----------

@router.post("/apply")
def apply(data: schemas.SpotlightApply, db: Session = Depends(get_db), current_dev: models.Developer = Depends(get_current_developer)):
    key = validate_application(data, db, strict=True)
    app = models.SpotlightApplication(developer_id=current_dev.id, source="founder", contact_email=current_dev.email, status="draft" if data.save_as_draft else "pending")
    fill_application(app, data, key)
    db.add(app)
    db.flush()
    set_application_products(app.id, data.product_ids, current_dev.id, db)
    db.commit()
    db.refresh(app)
    return {"message": "Saved as draft." if data.save_as_draft else "Application received. We'll review it shortly.", "id": app.id, "status": app.status}

@router.get("/my")
def my_applications(db: Session = Depends(get_db), current_dev: models.Developer = Depends(get_current_developer)):
    return db.query(models.SpotlightApplication).filter(
        models.SpotlightApplication.developer_id == current_dev.id
    ).order_by(models.SpotlightApplication.created_at.desc()).all()


@router.put("/apply/{app_id}")
def edit_rejected(app_id: int, data: schemas.SpotlightEdit, db: Session = Depends(get_db), current_dev: models.Developer = Depends(get_current_developer)):
    app = db.query(models.SpotlightApplication).filter(
        models.SpotlightApplication.id == app_id,
        models.SpotlightApplication.developer_id == current_dev.id,
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status not in ("rejected", "draft"):
        raise HTTPException(status_code=400, detail="Only rejected or draft applications can be edited")

    key = validate_application(data, db, current_id=app.id, strict=True)
    fill_application(app, data, key)
    app.status = "draft" if data.save_as_draft else "pending"
    app.rejection_reason = None if not data.save_as_draft else app.rejection_reason
    set_application_products(app.id, data.product_ids, current_dev.id, db)
    db.commit()
    return {"message": "Updated.", "status": app.status}


@router.post("/{spotlight_id}/hire-report")
def report_hire(spotlight_id: int, data: schemas.HireReport, db: Session = Depends(get_db), current_dev: models.Developer = Depends(get_current_developer)):
    s = db.query(models.Spotlight).filter(models.Spotlight.id == spotlight_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Spotlight not found")
    if s.application.developer_id is None or s.application.developer_id != current_dev.id:
        raise HTTPException(status_code=403, detail="Only the featured founder can report a hire")
    db.add(models.SpotlightHire(spotlight_id=s.id, hired_by=data.hired_by, note=data.note, hired_on=data.hired_on))
    db.commit()
    return {"message": "Thanks. We'll confirm it with you before it counts."}


# ---------- ADMIN: APPLICATIONS ----------

@router.post("/admin/applications")
def admin_create_application(admin_key: str, data: schemas.SpotlightApply, db: Session = Depends(get_db)):
    check_admin(admin_key)
    key = validate_application(data, db, strict=False)
    app = models.SpotlightApplication(developer_id=None, source="admin", contact_email=None, status="approved")
    fill_application(app, data, key)
    db.add(app)
    db.flush()
    set_application_products(app.id, data.product_ids, None, db)
    _ensure_spotlight_draft(app, db)
    db.commit()
    return {"message": "Founder added. Create the draft in Spotlights.", "id": app.id}


@router.get("/admin/applications")
def admin_applications(admin_key: str, status: Optional[str] = "pending", db: Session = Depends(get_db)):
    check_admin(admin_key)
    q = db.query(models.SpotlightApplication)
    if status:
        q = q.filter(models.SpotlightApplication.status == status)
    return q.order_by(models.SpotlightApplication.created_at.asc()).all()


@router.get("/admin/counts")
def admin_counts(admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    rows = db.query(models.SpotlightApplication.status, func.count(models.SpotlightApplication.id)).group_by(
        models.SpotlightApplication.status).all()
    return {status: count for status, count in rows}


@router.post("/admin/applications/{app_id}/reject")
def reject_application(app_id: int, admin_key: str, reason: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    app = db.query(models.SpotlightApplication).filter(models.SpotlightApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    app.status = "rejected"
    app.rejection_reason = reason
    db.commit()
    return {"message": "Rejected."}


@router.post("/admin/applications/{app_id}/approve")
def approve_application(app_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    app = db.query(models.SpotlightApplication).filter(models.SpotlightApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending applications can be approved")

    app.status = "approved"
    _ensure_spotlight_draft(app, db)
    db.commit()
    return {"message": "Approved. Spotlight draft created in Founder Spotlights."}


@router.post("/admin/applications/{app_id}/create-spotlight")
def create_spotlight_from_application(app_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    app = db.query(models.SpotlightApplication).filter(models.SpotlightApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    created = _ensure_spotlight_draft(app, db)
    db.commit()
    return {"message": "Draft created in Founder Spotlights." if created else "Spotlight already exists for this application."}


def _ensure_spotlight_draft(app: models.SpotlightApplication, db: Session) -> bool:
    existing = db.query(models.Spotlight).filter(models.Spotlight.application_id == app.id).first()
    if existing:
        return False
    slug = _generate_spotlight_slug(app.startup_name, db)
    db.add(models.Spotlight(
        application_id=app.id, slug=slug, headline=app.startup_name,
        summary=app.what_it_does[:250], body_building=app.what_it_does,
        quote=app.quote,
        why_believe=app.why_nigeria,    
        body_why_started=app.challenges, body_headed=app.vision,
        status="draft", updated_at=datetime.utcnow(),
    ))
    return True


@router.post("/admin/applications/{app_id}/draft")
def draft_spotlight(app_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    app = db.query(models.SpotlightApplication).filter(models.SpotlightApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    prompt = f"""You are writing a public founder spotlight for Enovox Search, a Nigerian tech directory.
Use ONLY the facts below. Do not invent numbers, dates, quotes, funding or results.
Write warm, clear, confident English. If a fact is missing, leave that field as an empty string.

Founder: {app.founder_name}
Startup: {app.startup_name}
State: {app.state}
What it does: {app.what_it_does}
Challenges: {app.challenges or ""}
Achievement: {app.achievement or ""}
Vision: {app.vision}

Reply with ONLY one JSON object and nothing else. Keys:
headline (one line, names the startup),
summary (two sentences),
body_opening (3-4 sentences introducing the founder and what they're building),
body_building (3-4 sentences on the problem, who it's for, and what it does today -- give a full, well-explained picture, not a summary),
quote (one short line in the founder's own words, taken from their answers),
body_why_started (3-4 sentences on their motivation and journey),
body_headed (3-4 sentences on what's next and what they're working toward),
why_believe (3-4 sentences on why this matters for Nigeria, written with genuine conviction)."""
    try:
        raw = ask_ai(prompt)
    except Exception as e:
        print(f"[spotlight draft] ask_ai raised: {e}")
        raise HTTPException(status_code=502, detail="AI provider failed. Try again in a moment.")

    print(f"[spotlight draft] raw reply: {raw!r}")
    draft = _extract_json(raw if isinstance(raw, str) else str(raw))
    if not draft:
        raise HTTPException(status_code=502, detail="AI replied, but not in the expected format. Check the terminal for the raw reply.")

    expected = ["headline", "summary", "body_opening", "body_building", "quote",
                "body_why_started", "body_headed", "why_believe"]
    draft = {k: str(draft.get(k, "") or "") for k in expected}
    return {"draft": draft, "application_id": app.id}


# ---------- ADMIN: SPOTLIGHTS ----------

@router.get("/admin/spotlights")
def admin_spotlights(admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    rows = db.query(models.Spotlight).order_by(models.Spotlight.id.desc()).all()
    return [{
        "id": s.id, "slug": s.slug, "headline": s.headline, "status": s.status,
        "published_at": s.published_at, "updated_at": s.updated_at,
        "startup_name": s.application.startup_name, "founder_name": s.application.founder_name,
        "hire_count": db.query(models.SpotlightHire).filter(
            models.SpotlightHire.spotlight_id == s.id, models.SpotlightHire.confirmed == True).count(),
    } for s in rows]


@router.get("/admin/spotlights/{spotlight_id}")
def admin_spotlight_detail(spotlight_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    s = db.query(models.Spotlight).filter(models.Spotlight.id == spotlight_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Spotlight not found")
    a = s.application
    return {
        "id": s.id, "slug": s.slug, "status": s.status,
        "headline": s.headline, "summary": s.summary, "body_opening": s.body_opening,
        "body_building": s.body_building, "quote": s.quote, "body_why_started": s.body_why_started,
        "body_headed": s.body_headed, "why_believe": s.why_believe,
        "published_at": s.published_at, "updated_at": s.updated_at,
        "application": a,
    }


@router.put("/admin/spotlights/{spotlight_id}")
def update_spotlight(spotlight_id: int, admin_key: str, data: schemas.SpotlightUpdate, db: Session = Depends(get_db)):
    check_admin(admin_key)
    s = db.query(models.Spotlight).filter(models.Spotlight.id == spotlight_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Spotlight not found")

    update = data.dict(exclude_unset=True)
    new_status = update.pop("status", None)
    for field, value in update.items():
        setattr(s, field, value)

    if new_status and new_status != s.status:
        if new_status not in ("draft", "published", "unpublished"):
            raise HTTPException(status_code=400, detail="Invalid status")
        was_published_before = bool(s.published_at)
        s.status = new_status
        if new_status == "published" and not was_published_before:
            s.published_at = datetime.utcnow()
            a = s.application
            if a.developer_id is not None and a.contact_email:
                try:
                    send_spotlight_published_email(a.contact_email, a.founder_name, a.startup_name, s.slug)
                except Exception as e:
                    print(f"[spotlight publish email] failed: {e}")

    s.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Saved.", "status": s.status}


# ---------- ADMIN: HIRES ----------

@router.get("/admin/hires")
def admin_hires(admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    rows = (db.query(models.SpotlightHire, models.Spotlight, models.SpotlightApplication)
            .join(models.Spotlight, models.Spotlight.id == models.SpotlightHire.spotlight_id)
            .join(models.SpotlightApplication, models.SpotlightApplication.id == models.Spotlight.application_id)
            .order_by(models.SpotlightHire.created_at.desc()).all())
    return [{
        "id": h.id, "startup": a.startup_name, "founder": a.founder_name,
        "hired_by": h.hired_by, "note": h.note, "hired_on": h.hired_on, "confirmed": h.confirmed,
    } for h, s, a in rows]


@router.post("/admin/hires/{hire_id}/confirm")
def confirm_hire(hire_id: int, admin_key: str, data: schemas.HireConfirm, db: Session = Depends(get_db)):
    check_admin(admin_key)
    hire = db.query(models.SpotlightHire).filter(models.SpotlightHire.id == hire_id).first()
    if not hire:
        raise HTTPException(status_code=404, detail="Hire report not found")
    hire.confirmed = data.confirmed
    db.commit()
    return {"message": "Updated.", "confirmed": hire.confirmed}
@router.delete("/apply/{app_id}")
def delete_draft(app_id: int, db: Session = Depends(get_db), current_dev: models.Developer = Depends(get_current_developer)):
    app = db.query(models.SpotlightApplication).filter(
        models.SpotlightApplication.id == app_id,
        models.SpotlightApplication.developer_id == current_dev.id,
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "draft":
        raise HTTPException(status_code=400, detail="Only drafts can be deleted")
    db.query(models.SpotlightApplicationProduct).filter(
        models.SpotlightApplicationProduct.application_id == app.id
    ).delete()
    db.delete(app)
    db.commit()
    return {"message": "Draft deleted."}

# ---------- PUBLIC (must stay below every /admin and fixed route above) ----------

@router.get("/public")
def public_spotlights(db: Session = Depends(get_db)):
    rows = (db.query(models.Spotlight)
            .filter(models.Spotlight.status == "published")
            .order_by(models.Spotlight.published_at.desc()).all())
    if not rows:
        return {"featured": None, "more": []}
    return {"featured": _public_card(rows[0]), "more": [_public_card(s) for s in rows[1:7]]}




@router.post("/{spotlight_id}/react")
def react(
    spotlight_id: int,
    data: schemas.SpotlightReact,
    db: Session = Depends(get_db),
    current_account = Depends(get_current_user)
):
    if not current_account:
        raise HTTPException(status_code=401, detail="Please log in to react")
    if data.value not in (None, "like", "dislike"):
        raise HTTPException(status_code=400, detail="value must be like, dislike, or null")
    s = db.query(models.Spotlight).filter(models.Spotlight.id == spotlight_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Spotlight not found")

    account_type = "developer" if isinstance(current_account, models.Developer) else "user"

    row = db.query(models.SpotlightReaction).filter(
        models.SpotlightReaction.spotlight_id == s.id,
        models.SpotlightReaction.account_type == account_type,
        models.SpotlightReaction.account_id == current_account.id,
    ).first()
    if data.value is None:
        if row:
            db.delete(row)
    elif row:
        row.value = data.value
    else:
        db.add(models.SpotlightReaction(
            spotlight_id=s.id, account_type=account_type,
            account_id=current_account.id, value=data.value
        ))
    db.commit()
    likes = db.query(models.SpotlightReaction).filter(models.SpotlightReaction.spotlight_id == s.id, models.SpotlightReaction.value == "like").count()
    dislikes = db.query(models.SpotlightReaction).filter(models.SpotlightReaction.spotlight_id == s.id, models.SpotlightReaction.value == "dislike").count()
    return {"likes": likes, "dislikes": dislikes}