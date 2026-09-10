import re
from sqlalchemy.orm import Session
from . import models


def generate_slug(name: str, db: Session) -> str:
    base_slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    slug = base_slug
    counter = 1

    while db.query(models.Product).filter(models.Product.slug == slug).first():
        counter += 1
        slug = f"{base_slug}-{counter}"

    return slug