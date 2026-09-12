import re
from sqlalchemy.orm import Session
from . import models
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os


def generate_slug(name: str, db: Session) -> str:
    base_slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    slug = base_slug
    counter = 1

    while db.query(models.Product).filter(models.Product.slug == slug).first():
        counter += 1
        slug = f"{base_slug}-{counter}"

    return slug


def send_submission_alert(product_name: str, developer_email: str, category: str):
    sender_email = os.getenv("EMAIL_SENDER")
    sender_password = os.getenv("EMAIL_PASSWORD")
    admin_email = os.getenv("ADMIN_EMAIL", sender_email)
    
    if not sender_email or not sender_password:
        print("Email credentials not configured. Skipping notification.")
        return

    subject = f"🚀 New Product Submission: {product_name}"
    body = f"""
    A new product has been submitted to Enovox Search and is waiting for your review!
    
    - Product Name: {product_name}
    - Category: {category}
    - Developer Email: {developer_email}
    
    Log in to your admin dashboard to approve or reject it:
    https://enovox-search.onrender.com/admin
    """

    message = MIMEMultipart()
    message["From"] = sender_email
    message["To"] = admin_email
    message["Subject"] = subject
    message.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(os.getenv("SMTP_SERVER", "smtp.gmail.com"), int(os.getenv("SMTP_PORT", 587))) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, admin_email, message.as_string())
        print("Admin email notification sent successfully.")
    except Exception as e:
        print(f"Failed to send email notification: {e}")