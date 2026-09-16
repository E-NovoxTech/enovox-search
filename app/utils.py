import re
from sqlalchemy.orm import Session
from . import models
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from datetime import date
import resend

resend.api_key = os.getenv("RESEND_API_KEY")


def generate_slug(name: str, db: Session) -> str:
    base_slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    slug = base_slug
    counter = 1

    while db.query(models.Product).filter(models.Product.slug == slug).first():
        counter += 1
        slug = f"{base_slug}-{counter}"

    return slug



def send_submission_alert(product_name: str, developer_email: str, category: str):
    admin_email = os.getenv("ADMIN_EMAIL")
    if not admin_email:
        print("ADMIN_EMAIL not configured. Skipping notification.")
        return

    try:
        resend.Emails.send({
            "from": os.getenv("EMAIL_FROM"),
            "to": admin_email,
            "subject": f"🚀 New Product Submission: {product_name}",
            "html": f"""
                <p>A new product has been submitted to Enovox Search and is waiting for your review!</p>
                <ul>
                    <li>Product Name: {product_name}</li>
                    <li>Category: {category}</li>
                    <li>Developer Email: {developer_email}</li>
                </ul>
                <p><a href="https://search.enovoxtech.com/admin">Log in to your admin dashboard</a></p>
            """
        })
        print("Admin email notification sent successfully.")
    except Exception as e:
        print(f"Failed to send email notification: {e}") 


def check_and_increment_usage(db: Session, identifier: str, limit: int) -> bool:
    """Returns True if allowed (and increments count), False if over limit."""
    today = date.today()
    usage = db.query(models.SearchUsage).filter(
        models.SearchUsage.identifier == identifier,
        models.SearchUsage.date == today
    ).first()

    if not usage:
        usage = models.SearchUsage(identifier=identifier, date=today, count=0)
        db.add(usage)

    if usage.count >= limit:
        return False

    usage.count += 1
    db.commit()
    return True