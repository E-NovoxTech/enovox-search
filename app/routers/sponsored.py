from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime
from typing import Optional, List
import os

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/sponsored", tags=["Sponsored"])
MAX_SPONSORED = 10


def check_admin(admin_key: str):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")


def is_currently_active(s, now):
    if not s.is_active:
        return False
    if s.start_date and s.start_date > now:
        return False
    if s.end_date and s.end_date < now:
        return False
    return True


@router.get("/public")
def public_sponsored(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    rows = (
        db.query(models.SponsoredProduct)
        .join(models.Product, models.Product.id == models.SponsoredProduct.product_id)
        .filter(models.Product.status == True)
        .order_by(models.SponsoredProduct.position.asc())
        .all()
    )
    live = [r for r in rows if is_currently_active(r, now)][:MAX_SPONSORED]
    product_ids = [r.product_id for r in live]
    products = db.query(models.Product).filter(models.Product.id.in_(product_ids)).all()
    by_id = {p.id: p for p in products}
    return [by_id[r.product_id] for r in live if r.product_id in by_id]


@router.get("/admin")
def admin_list(admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    rows = (
        db.query(models.SponsoredProduct, models.Product)
        .join(models.Product, models.Product.id == models.SponsoredProduct.product_id)
        .order_by(models.SponsoredProduct.position.asc())
        .all()
    )
    now = datetime.utcnow()
    return [{
        "id": s.id, "product_id": p.id, "name": p.name, "logo_url": p.logo_url,
        "category": p.category, "status": p.status, "position": s.position,
        "is_active": s.is_active, "start_date": s.start_date, "end_date": s.end_date,
        "currently_live": is_currently_active(s, now),
    } for s, p in rows]


@router.post("/admin")
def add_sponsored(admin_key: str, data: schemas.SponsoredCreate, db: Session = Depends(get_db)):
    check_admin(admin_key)
    product = db.query(models.Product).filter(models.Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if db.query(models.SponsoredProduct).filter(models.SponsoredProduct.product_id == data.product_id, models.SponsoredProduct.is_active == True).first():
        raise HTTPException(status_code=400, detail="This product is already sponsored")

    active_count = db.query(models.SponsoredProduct).filter(models.SponsoredProduct.is_active == True).count()
    if active_count >= MAX_SPONSORED:
        raise HTTPException(status_code=400, detail=f"Only {MAX_SPONSORED} sponsored slots allowed at once")

    max_pos = db.query(func.max(models.SponsoredProduct.position)).scalar() or 0
    s = models.SponsoredProduct(product_id=data.product_id, position=max_pos + 1, start_date=data.start_date, end_date=data.end_date)
    db.add(s)
    db.commit()
    return {"message": "Added."}


@router.put("/admin/reorder")
def reorder(admin_key: str, data: schemas.SponsoredReorder, db: Session = Depends(get_db)):
    check_admin(admin_key)
    for index, sid in enumerate(data.ids):
        db.query(models.SponsoredProduct).filter(models.SponsoredProduct.id == sid).update({"position": index})
    db.commit()
    return {"message": "Order saved."}


@router.put("/admin/{sponsored_id}/toggle")
def toggle_active(sponsored_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    s = db.query(models.SponsoredProduct).filter(models.SponsoredProduct.id == sponsored_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    if not s.is_active:
        active_count = db.query(models.SponsoredProduct).filter(models.SponsoredProduct.is_active == True).count()
        if active_count >= MAX_SPONSORED:
            raise HTTPException(status_code=400, detail=f"Only {MAX_SPONSORED} sponsored slots allowed at once")
    s.is_active = not s.is_active
    db.commit()
    return {"message": "Updated.", "is_active": s.is_active}


@router.delete("/admin/{sponsored_id}")
def remove_sponsored(sponsored_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    s = db.query(models.SponsoredProduct).filter(models.SponsoredProduct.id == sponsored_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(s)
    db.commit()
    return {"message": "Removed."}