from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional, List
import os

from .. import models, schemas
from ..database import get_db
from ..utils import generate_slug

router = APIRouter(prefix="/products", tags=["Products"])


def apply_filters(q, query, category, pricing, product_type, platform, featured, is_popular, is_new_arrival):
    if query:
        words = query.split()
        word_filters = []
        for word in words:
            word_filters.append(models.Product.name.ilike(f"%{word}%"))
            word_filters.append(models.Product.description.ilike(f"%{word}%"))
            word_filters.append(models.Product.category.ilike(f"%{word}%"))
        q = q.filter(or_(*word_filters))

    if category:
        q = q.filter(models.Product.category.ilike(category))

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
    category: Optional[str] = None,
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
    category: Optional[str] = None,
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

    if sort == "name_asc":
        q = q.order_by(models.Product.name.asc())
    elif sort == "name_desc":
        q = q.order_by(models.Product.name.desc())
    elif sort == "newest":
        q = q.order_by(models.Product.created_at.desc())

    return q.offset(offset).limit(limit).all()


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