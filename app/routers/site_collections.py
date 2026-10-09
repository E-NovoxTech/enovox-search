from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import List
import os
import re

from .. import models, schemas
from ..database import get_db
from ..indexnow_utils import submit_to_indexnow

router = APIRouter(prefix="/collections", tags=["Collections"])

MAX_PRODUCTS = 30
ROW_SIZE = 6
MIN_PRODUCTS = 3


def check_admin(admin_key: str):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")


def get_or_404(collection_id: int, db: Session):
    c = db.query(models.Collection).filter(models.Collection.id == collection_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    return c


def generate_collection_slug(title: str, db: Session) -> str:
    base = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-') or "collection"
    slug, n = base, 1
    while db.query(models.Collection).filter(models.Collection.slug == slug).first():
        n += 1
        slug = f"{base}-{n}"
    return slug


def get_status(c) -> str:
    today = date.today()
    if c.is_archived:
        return "archived"
    if not c.is_published:
        return "draft"
    if c.start_date and c.start_date > today:
        return "scheduled"
    if c.end_date and c.end_date < today:
        return "expired"
    return "live"


def live_query(c, db: Session):
    if c.section_type == "auto":
        # Only "newest" exists for now. Add `elif c.auto_rule == "most_saved": ...` here later.
        return (db.query(models.Product)
                .filter(models.Product.status == True)
                .order_by(models.Product.created_at.desc(), models.Product.id.desc()))
    return (db.query(models.Product)
            .join(models.CollectionProduct, models.CollectionProduct.product_id == models.Product.id)
            .filter(models.CollectionProduct.collection_id == c.id, models.Product.status == True)
            .order_by(models.CollectionProduct.position.asc()))


def get_live_products(c, db: Session, limit=None):
    q = live_query(c, db)
    if c.section_type == "auto":
        limit = ROW_SIZE  # auto sections always show the latest 6
    return q.limit(limit).all() if limit else q.all()


def count_live_products(c, db: Session) -> int:
    n = live_query(c, db).count()
    return min(n, ROW_SIZE) if c.section_type == "auto" else n


def set_products(collection_id: int, product_ids: List[int], db: Session):
    unique_ids = list(dict.fromkeys(product_ids))
    valid = {pid for (pid,) in db.query(models.Product.id).filter(models.Product.id.in_(unique_ids)).all()}
    db.query(models.CollectionProduct).filter(models.CollectionProduct.collection_id == collection_id).delete()
    position = 0
    for pid in unique_ids:
        if pid in valid:
            db.add(models.CollectionProduct(collection_id=collection_id, product_id=pid, position=position))
            position += 1


def admin_row(c, db: Session) -> dict:
    status = get_status(c)
    live_count = count_live_products(c, db)
    selected = None
    if c.section_type == "manual":
        selected = db.query(models.CollectionProduct).filter(models.CollectionProduct.collection_id == c.id).count()

    warnings = []
    if status == "live" and live_count < MIN_PRODUCTS:
        warnings.append(f"Only {live_count} live products. Needs at least {MIN_PRODUCTS}, so it is hidden on the site.")
    if status == "live" and c.end_date:
        days = (c.end_date - date.today()).days
        if days <= 3:
            warnings.append("Ends today" if days == 0 else f"Ends in {days} day(s)")

    return {
        "id": c.id, "title": c.title, "emoji": c.emoji, "slug": c.slug,
        "section_type": c.section_type, "auto_rule": c.auto_rule,
        "status": status, "is_published": c.is_published, "is_archived": c.is_archived,
        "live_count": live_count, "selected_count": selected,
        "has_own_page": c.section_type == "manual" and live_count > ROW_SIZE,
        "start_date": c.start_date, "end_date": c.end_date,
        "display_order": c.display_order, "warnings": warnings,
    }


# ---------- PUBLIC ----------

@router.get("/public", response_model=List[schemas.CollectionSectionOut])
def public_sections(db: Session = Depends(get_db)):
    sections = (db.query(models.Collection)
                .filter(models.Collection.is_archived == False)
                .order_by(models.Collection.display_order.asc(), models.Collection.id.asc())
                .all())
    result = []
    for c in sections:
        if get_status(c) != "live":
            continue
        total = count_live_products(c, db)
        if total < MIN_PRODUCTS:
            continue
        result.append({
            "id": c.id, "title": c.title, "slug": c.slug, "emoji": c.emoji,
            "description": c.description, "section_type": c.section_type,
            "products": get_live_products(c, db, ROW_SIZE),
            "total": total,
            "has_more": c.section_type == "manual" and total > ROW_SIZE,
        })
    return result


# ---------- ADMIN ----------

@router.get("/admin")
def admin_list(admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    all_c = (db.query(models.Collection)
             .order_by(models.Collection.display_order.asc(), models.Collection.id.asc()).all())
    rows = [admin_row(c, db) for c in all_c]
    counts = {"all": len(rows)}
    for s in ("live", "scheduled", "draft", "expired", "archived"):
        counts[s] = sum(1 for r in rows if r["status"] == s)
    return {"counts": counts, "collections": rows}


# NOTE: /admin/reorder must stay ABOVE /admin/{collection_id}
@router.put("/admin/reorder")
def reorder_collections(admin_key: str, data: schemas.CollectionReorder, db: Session = Depends(get_db)):
    check_admin(admin_key)
    for index, cid in enumerate(data.ids):
        db.query(models.Collection).filter(models.Collection.id == cid).update({"display_order": index})
    db.commit()
    return {"message": "Order saved."}


@router.get("/admin/{collection_id}")
def admin_detail(collection_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    c = get_or_404(collection_id, db)
    row = admin_row(c, db)
    row["description"] = c.description
    picked = (db.query(models.Product)
              .join(models.CollectionProduct, models.CollectionProduct.product_id == models.Product.id)
              .filter(models.CollectionProduct.collection_id == c.id)
              .order_by(models.CollectionProduct.position.asc()).all())
    row["products"] = [
        {"id": p.id, "name": p.name, "logo_url": p.logo_url, "category": p.category, "is_live": p.status}
        for p in picked
    ]
    return row


@router.post("/admin")
def create_collection(admin_key: str, data: schemas.CollectionCreate, db: Session = Depends(get_db)):
    check_admin(admin_key)
    if data.section_type not in ("manual", "auto"):
        raise HTTPException(status_code=400, detail="section_type must be 'manual' or 'auto'")
    if data.section_type == "manual" and len(set(data.product_ids)) > MAX_PRODUCTS:
        raise HTTPException(status_code=400, detail=f"A collection can hold at most {MAX_PRODUCTS} products")

    max_order = db.query(func.max(models.Collection.display_order)).scalar() or 0
    c = models.Collection(
        title=data.title,
        slug=generate_collection_slug(data.title, db),
        emoji=data.emoji,
        description=data.description,
        section_type=data.section_type,
        auto_rule=data.auto_rule if data.section_type == "auto" else None,
        is_published=data.is_published,
        start_date=data.start_date,
        end_date=data.end_date,
        display_order=max_order + 1,
    )
    db.add(c)
    db.flush()
    if data.section_type == "manual":
        set_products(c.id, data.product_ids, db)
    db.commit()
    db.refresh(c)
    return admin_row(c, db)


@router.put("/admin/{collection_id}")
def update_collection(collection_id: int, admin_key: str, data: schemas.CollectionUpdate, db: Session = Depends(get_db)):
    check_admin(admin_key)
    c = get_or_404(collection_id, db)

    update = data.dict(exclude_unset=True)
    if "title" in update and not update["title"]:
        update.pop("title")

    product_ids = update.pop("product_ids", None)
    if product_ids is not None:
        if c.section_type != "manual":
            raise HTTPException(status_code=400, detail="Only manual collections have picked products")
        if len(set(product_ids)) > MAX_PRODUCTS:
            raise HTTPException(status_code=400, detail=f"A collection can hold at most {MAX_PRODUCTS} products")
        set_products(c.id, product_ids, db)

    for field, value in update.items():
        setattr(c, field, value)

    db.commit()
    db.refresh(c)

    if (update.get("is_published") and get_status(c) == "live"
            and c.section_type == "manual" and count_live_products(c, db) > ROW_SIZE):
        submit_to_indexnow(f"/collection/{c.slug}")

    return admin_row(c, db)


@router.post("/admin/{collection_id}/duplicate")
def duplicate_collection(collection_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    c = get_or_404(collection_id, db)
    max_order = db.query(func.max(models.Collection.display_order)).scalar() or 0
    new_title = f"{c.title} (copy)"
    copy = models.Collection(
        title=new_title, slug=generate_collection_slug(new_title, db),
        emoji=c.emoji, description=c.description, section_type=c.section_type,
        auto_rule=c.auto_rule, is_published=False, is_archived=False,
        display_order=max_order + 1,
    )
    db.add(copy)
    db.flush()
    if c.section_type == "manual":
        ids = [r.product_id for r in db.query(models.CollectionProduct)
               .filter(models.CollectionProduct.collection_id == c.id)
               .order_by(models.CollectionProduct.position.asc()).all()]
        set_products(copy.id, ids, db)
    db.commit()
    db.refresh(copy)
    return admin_row(copy, db)