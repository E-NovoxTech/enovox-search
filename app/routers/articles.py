import os
import re
from datetime import date, datetime
from typing import List, Optional


import bleach
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/articles", tags=["Articles"])

ARTICLE_TYPES = ["product_discovery", "news", "updates", "guides", "industry_trends"]

ALLOWED_TAGS = [
    "p", "br", "strong", "em", "b", "i", "u", "a", "ul", "ol", "li",
    "h2", "h3", "h4", "blockquote", "img", "figure", "figcaption", "code", "pre",
]
ALLOWED_ATTRS = {"a": ["href", "target", "rel"], "img": ["src", "alt"]}


def check_admin(admin_key: str):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")


def sanitize_html(raw: str) -> str:
    return bleach.clean(raw, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)


def generate_article_slug(title: str, db: Session) -> str:
    base = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-') or "article"
    slug, n = base, 1
    while db.query(models.Article).filter(models.Article.slug == slug).first():
        n += 1
        slug = f"{base}-{n}"
    return slug


def set_article_links(article_id: int, product_ids: List[int], foreign_tool_ids: List[int], spotlight_ids: List[int], db: Session):
    db.query(models.ArticleProduct).filter(models.ArticleProduct.article_id == article_id).delete()
    db.query(models.ArticleForeignTool).filter(models.ArticleForeignTool.article_id == article_id).delete()
    db.query(models.ArticleSpotlight).filter(models.ArticleSpotlight.article_id == article_id).delete()

    for pid in dict.fromkeys(product_ids):
        db.add(models.ArticleProduct(article_id=article_id, product_id=pid))
    for fid in dict.fromkeys(foreign_tool_ids):
        db.add(models.ArticleForeignTool(article_id=article_id, foreign_tool_id=fid))
    for sid in dict.fromkeys(spotlight_ids):
        db.add(models.ArticleSpotlight(article_id=article_id, spotlight_id=sid))


# ---------- ADMIN: CATEGORIES ----------

@router.post("/admin/categories")
def create_category(admin_key: str, data: schemas.ArticleCategoryCreate, db: Session = Depends(get_db)):
    check_admin(admin_key)
    slug = re.sub(r'[^a-z0-9]+', '-', data.name.lower()).strip('-')
    if db.query(models.ArticleCategory).filter(models.ArticleCategory.slug == slug).first():
        raise HTTPException(status_code=400, detail="A category with this name already exists")
    cat = models.ArticleCategory(name=data.name, slug=slug)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.get("/admin/categories")
def list_categories_admin(admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    return db.query(models.ArticleCategory).order_by(models.ArticleCategory.name.asc()).all()


@router.delete("/admin/categories/{category_id}")
def delete_category(category_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    cat = db.query(models.ArticleCategory).filter(models.ArticleCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    in_use = db.query(models.Article).filter(models.Article.category_id == category_id).count()
    if in_use:
        raise HTTPException(status_code=400, detail=f"Can't delete: {in_use} article(s) use this category")
    db.delete(cat)
    db.commit()
    return {"message": "Deleted."}


# ---------- ADMIN: ARTICLES ----------

@router.post("/admin")
def create_article(admin_key: str, data: schemas.ArticleCreate, db: Session = Depends(get_db)):
    check_admin(admin_key)

    if data.type not in ARTICLE_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {ARTICLE_TYPES}")

    if data.type == "product_discovery" and not data.product_ids:
        raise HTTPException(status_code=400, detail="Product Discovery articles need at least one Nigerian product")

    if data.category_id is not None:
        if not db.query(models.ArticleCategory).filter(models.ArticleCategory.id == data.category_id).first():
            raise HTTPException(status_code=400, detail="Invalid category")

    slug = generate_article_slug(data.title, db)
    article = models.Article(
        type=data.type, title=data.title, slug=slug, summary=data.summary,
        content_html=sanitize_html(data.content_html), cover_image_url=data.cover_image_url,
        category_id=data.category_id, author_name=data.author_name, author_avatar_url=data.author_avatar_url,
        seo_title=data.seo_title, meta_description=data.meta_description, is_featured=data.is_featured,
        status="draft",
    )
    db.add(article)
    db.flush()
    set_article_links(article.id, data.product_ids, data.foreign_tool_ids, data.spotlight_ids, db)
    db.commit()
    db.refresh(article)
    return {"message": "Article created as draft.", "id": article.id, "slug": article.slug}


@router.get("/admin")
def list_articles_admin(
    admin_key: str,
    status: Optional[str] = None,
    type: Optional[str] = None,
    category_id: Optional[int] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    check_admin(admin_key)
    query = db.query(models.Article)
    if status:
        query = query.filter(models.Article.status == status)
    if type:
        query = query.filter(models.Article.type == type)
    if category_id:
        query = query.filter(models.Article.category_id == category_id)
    if q:
        like = f"%{q}%"
        query = query.filter(models.Article.title.ilike(like))
    articles = query.order_by(models.Article.updated_at.desc()).all()

    counts_q = db.query(models.Article.status, models.Article.id)
    counts = {"all": 0, "draft": 0, "published": 0, "scheduled": 0, "unpublished": 0, "archived": 0}
    for s, _ in counts_q.all():
        counts["all"] += 1
        if s in counts:
            counts[s] += 1

    return {
        "counts": counts,
        "articles": [{
            "id": a.id, "title": a.title, "slug": a.slug, "type": a.type, "status": a.status,
            "category_id": a.category_id, "cover_image_url": a.cover_image_url,
            "is_featured": a.is_featured, "updated_at": a.updated_at,
            "published_at": a.published_at, "scheduled_at": a.scheduled_at,
        } for a in articles]
    }


@router.get("/admin/{article_id}")
def get_article_admin(article_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    a = db.query(models.Article).filter(models.Article.id == article_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Article not found")

    product_ids = [r.product_id for r in db.query(models.ArticleProduct).filter(models.ArticleProduct.article_id == a.id).all()]
    foreign_tool_ids = [r.foreign_tool_id for r in db.query(models.ArticleForeignTool).filter(models.ArticleForeignTool.article_id == a.id).all()]
    spotlight_ids = [r.spotlight_id for r in db.query(models.ArticleSpotlight).filter(models.ArticleSpotlight.article_id == a.id).all()]

    return {
        "id": a.id, "type": a.type, "title": a.title, "slug": a.slug, "summary": a.summary,
        "content_html": a.content_html, "cover_image_url": a.cover_image_url, "category_id": a.category_id,
        "author_name": a.author_name, "author_avatar_url": a.author_avatar_url,
        "seo_title": a.seo_title, "meta_description": a.meta_description,
        "status": a.status, "is_featured": a.is_featured,
        "published_at": a.published_at, "scheduled_at": a.scheduled_at,
        "product_ids": product_ids, "foreign_tool_ids": foreign_tool_ids, "spotlight_ids": spotlight_ids,
    }


@router.put("/admin/{article_id}")
def update_article(article_id: int, admin_key: str, data: schemas.ArticleUpdate, db: Session = Depends(get_db)):
    check_admin(admin_key)
    a = db.query(models.Article).filter(models.Article.id == article_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Article not found")

    update = data.dict(exclude_unset=True)

    if "type" in update and update["type"] not in ARTICLE_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {ARTICLE_TYPES}")

    product_ids = update.pop("product_ids", None)
    foreign_tool_ids = update.pop("foreign_tool_ids", None)
    spotlight_ids = update.pop("spotlight_ids", None)
    new_status = update.pop("status", None)
    new_slug = update.pop("slug", None)

    if "content_html" in update:
        update["content_html"] = sanitize_html(update["content_html"])

    for field, value in update.items():
        setattr(a, field, value)

    if new_slug and new_slug != a.slug:
        if db.query(models.Article).filter(models.Article.slug == new_slug, models.Article.id != a.id).first():
            raise HTTPException(status_code=400, detail="That slug is already taken")
        a.slug = new_slug

    if product_ids is not None or foreign_tool_ids is not None or spotlight_ids is not None:
        set_article_links(
            a.id,
            product_ids if product_ids is not None else [r.product_id for r in db.query(models.ArticleProduct).filter(models.ArticleProduct.article_id == a.id).all()],
            foreign_tool_ids if foreign_tool_ids is not None else [r.foreign_tool_id for r in db.query(models.ArticleForeignTool).filter(models.ArticleForeignTool.article_id == a.id).all()],
            spotlight_ids if spotlight_ids is not None else [r.spotlight_id for r in db.query(models.ArticleSpotlight).filter(models.ArticleSpotlight.article_id == a.id).all()],
            db,
        )

    if new_status:
        if new_status not in ("draft", "published", "scheduled", "unpublished", "archived"):
            raise HTTPException(status_code=400, detail="Invalid status")

        if new_status == "published":
            has_product = db.query(models.ArticleProduct).filter(models.ArticleProduct.article_id == a.id).first()
            if a.type == "product_discovery" and not has_product:
                raise HTTPException(status_code=400, detail="Product Discovery articles need at least one Nigerian product before publishing")
            a.status = "published"
            if not a.published_at:
                a.published_at = datetime.utcnow()
            a.scheduled_at = None

        elif new_status == "scheduled":
            if "scheduled_at" not in update and not a.scheduled_at:
                raise HTTPException(status_code=400, detail="Set scheduled_at to schedule this article")
            a.status = "scheduled"

        else:
            a.status = new_status

    a.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Saved.", "status": a.status}


@router.delete("/admin/{article_id}")
def delete_article(article_id: int, admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    a = db.query(models.Article).filter(models.Article.id == article_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Article not found")
    db.query(models.ArticleProduct).filter(models.ArticleProduct.article_id == a.id).delete()
    db.query(models.ArticleForeignTool).filter(models.ArticleForeignTool.article_id == a.id).delete()
    db.query(models.ArticleSpotlight).filter(models.ArticleSpotlight.article_id == a.id).delete()
    db.delete(a)
    db.commit()
    return {"message": "Deleted permanently."}


@router.post("/admin/auto-publish-due")
def auto_publish_due_articles(admin_key: str, db: Session = Depends(get_db)):
    check_admin(admin_key)
    now = datetime.utcnow()
    due = db.query(models.Article).filter(
        models.Article.status == "scheduled",
        models.Article.scheduled_at.isnot(None),
        models.Article.scheduled_at <= now,
    ).all()
    published = []
    for a in due:
        a.status = "published"
        a.published_at = now
        published.append({"id": a.id, "title": a.title})
    db.commit()
    return {"message": f"Published {len(published)} article(s).", "published": published}


# ---------- PUBLIC (must stay below every /admin route above, and /public before /{slug}) ----------

def _article_card(a: models.Article, db: Session) -> dict:
    category = None
    if a.category_id:
        cat = db.query(models.ArticleCategory).filter(models.ArticleCategory.id == a.category_id).first()
        if cat:
            category = {"id": cat.id, "name": cat.name, "slug": cat.slug}

    word_count = len(re.sub(r"<[^>]+>", " ", a.content_html).split())
    read_minutes = max(1, round(word_count / 200))

    return {
        "id": a.id, "slug": a.slug, "title": a.title, "summary": a.summary,
        "cover_image_url": a.cover_image_url, "type": a.type, "category": category,
        "author_name": a.author_name, "author_avatar_url": a.author_avatar_url,
        "published_at": a.published_at, "read_minutes": read_minutes, "is_featured": a.is_featured,
    }


@router.get("/public")
def public_articles(
    type: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 9,
    db: Session = Depends(get_db),
):
    query = db.query(models.Article).filter(models.Article.status == "published")

    if type:
        query = query.filter(models.Article.type == type)
    if category:
        cat = db.query(models.ArticleCategory).filter(models.ArticleCategory.slug == category).first()
        query = query.filter(models.Article.category_id == (cat.id if cat else -1))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(models.Article.title.ilike(like), models.Article.summary.ilike(like)))

    query = query.order_by(models.Article.published_at.desc())
    total = query.count()
    offset = max(0, (page - 1) * page_size)
    articles = query.offset(offset).limit(page_size).all()

    featured = None
    if not type and not category and not q:
        f = (
            db.query(models.Article)
            .filter(models.Article.status == "published", models.Article.is_featured == True)
            .order_by(models.Article.published_at.desc())
            .first()
        )
        if f:
            featured = _article_card(f, db)

    categories = [
        {"id": c.id, "name": c.name, "slug": c.slug}
        for c in db.query(models.ArticleCategory).order_by(models.ArticleCategory.name.asc()).all()
    ]

    return {
        "items": [_article_card(a, db) for a in articles],
        "total": total,
        "featured": featured,
        "categories": categories,
    }


@router.get("data/{slug}")
def get_article(slug: str, db: Session = Depends(get_db)):
    a = db.query(models.Article).filter(models.Article.slug == slug, models.Article.status == "published").first()
    if not a:
        raise HTTPException(status_code=404, detail="Article not found")

    category = None
    if a.category_id:
        cat = db.query(models.ArticleCategory).filter(models.ArticleCategory.id == a.category_id).first()
        if cat:
            category = {"id": cat.id, "name": cat.name, "slug": cat.slug}

    products = (
        db.query(models.Product)
        .join(models.ArticleProduct, models.ArticleProduct.product_id == models.Product.id)
        .filter(models.ArticleProduct.article_id == a.id, models.Product.status == True)
        .all()
    )
    related_products = [
        {"name": p.name, "slug": p.slug, "logo_url": p.logo_url, "category": p.category, "tagline": p.description}
        for p in products
    ]

    tool_links = db.query(models.ArticleForeignTool).filter(models.ArticleForeignTool.article_id == a.id).all()
    related_alternatives = []
    for link in tool_links:
        tool = db.query(models.ForeignTool).filter(models.ForeignTool.id == link.foreign_tool_id).first()
        if not tool:
            continue
        alt_products = (
            db.query(models.Product)
            .join(models.ProductAlternative, models.ProductAlternative.product_id == models.Product.id)
            .filter(models.ProductAlternative.foreign_tool_id == tool.id, models.Product.status == True)
            .all()
        )
        for alt in alt_products:
            related_alternatives.append({
                "foreign_tool": {"name": tool.name, "logo_url": tool.logo_url},
                "alternative": {"name": alt.name, "slug": alt.slug, "logo_url": alt.logo_url},
            })

    spotlight_links = db.query(models.ArticleSpotlight).filter(models.ArticleSpotlight.article_id == a.id).all()
    related_founders = []
    for link in spotlight_links:
        s = db.query(models.Spotlight).filter(models.Spotlight.id == link.spotlight_id, models.Spotlight.status == "published").first()
        if not s:
            continue
        app = s.application
        related_founders.append({
            "name": app.founder_name, "role": f"Founder, {app.startup_name}",
            "photo_url": app.photo_url, "product_slug": None,
            "url": f"/spotlight/{s.slug}", "bio": s.summary,
        })

    related_articles = (
        db.query(models.Article)
        .filter(models.Article.status == "published", models.Article.id != a.id, models.Article.type == a.type)
        .order_by(models.Article.published_at.desc())
        .limit(3)
        .all()
    )

    word_count = len(re.sub(r"<[^>]+>", " ", a.content_html).split())
    read_minutes = max(1, round(word_count / 200))

    return {
        "id": a.id, "slug": a.slug, "title": a.title, "summary": a.summary,
        "content_html": a.content_html, "cover_image_url": a.cover_image_url,
        "type": a.type, "type_label": a.type.replace("_", " ").title(), "category": category,
        "author_name": a.author_name, "author_avatar_url": a.author_avatar_url,
        "seo_title": a.seo_title or a.title, "meta_description": a.meta_description or a.summary,
        "published_at": a.published_at, "read_minutes": read_minutes,
        "related_products": related_products,
        "related_alternatives": related_alternatives,
        "related_founders": related_founders,
        "related_articles": [_article_card(ra, db) for ra in related_articles],
    }

