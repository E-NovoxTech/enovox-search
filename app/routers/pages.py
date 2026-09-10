from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from fastapi import Response
import os

from .. import models
from ..database import get_db

router = APIRouter(tags=["Pages"])
templates = Jinja2Templates(directory="static")

# Clean URL routes for all static pages
@router.get("/")
def home_page(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@router.get("/explore")
def explore_page(request: Request):
    return templates.TemplateResponse(request=request, name="explore.html")

@router.get("/about")
def about_page(request: Request):
    return templates.TemplateResponse(request=request, name="about.html")

@router.get("/submit")
def submit_page(request: Request):
    return templates.TemplateResponse(request=request, name="submit.html")

@router.get("/contact")
def contact_page(request: Request):
    return templates.TemplateResponse(request=request, name="contact.html")

@router.get("/privacy")
def privacy_page(request: Request):
    return templates.TemplateResponse(request=request, name="privacy.html")

@router.get("/term")
def term_page(request: Request):
    return templates.TemplateResponse(request=request, name="term.html")

# Added Auth and Admin Pages
@router.get("/login")
def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html")

@router.get("/signup")
def signup_page(request: Request):
    return templates.TemplateResponse(request=request, name="signup.html")

@router.get("/admin")
def admin_page(request: Request):
    return templates.TemplateResponse(request=request, name="admin.html")

# Your existing dynamic product route
@router.get("/product/{slug}")
def product_page(slug: str, request: Request, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(
        models.Product.slug == slug,
        models.Product.status == True
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return templates.TemplateResponse(request=request, name="product.html", context={"product": product})
@router.get("/sitemap.xml")
def sitemap(db: Session = Depends(get_db)):
    site_url = os.getenv("SITE_URL", "https://enovox-search.onrender.com")

    products = db.query(models.Product).filter(models.Product.status == True).all()

    urls = [
        f"{site_url}/",
        f"{site_url}/explore",
        f"{site_url}/about",
        f"{site_url}/submit",
        f"{site_url}/contact",
        f"{site_url}/privacy",
        f"{site_url}/term",
    ]

    for product in products:
        if product.slug:
            urls.append(f"{site_url}/product/{product.slug}")

    xml_items = "\n".join(f"  <url><loc>{url}</loc></url>" for url in urls)
    xml_content = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{xml_items}\n</urlset>'

    return Response(content=xml_content, media_type="application/xml")


@router.get("/robots.txt")
def robots():
    content = "User-agent: *\nAllow: /\nSitemap: " + os.getenv("SITE_URL", "https://enovox-search.onrender.com") + "/sitemap.xml"
    return Response(content=content, media_type="text/plain")