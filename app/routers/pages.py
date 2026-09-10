from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(tags=["Pages"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/product/{slug}")
def product_page(slug: str, request: Request, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(
        models.Product.slug == slug,
        models.Product.status == True
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return templates.TemplateResponse(request=request, name="product.html", context={"product": product})