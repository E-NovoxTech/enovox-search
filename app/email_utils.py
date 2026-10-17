import resend
import os
import random
from datetime import datetime, timedelta

resend.api_key = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM")

def generate_verification_code():
    return str(random.randint(100000, 999999))

def send_verification_email(to_email: str, code: str):
    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": to_email,
        "subject": "Verify your Enovox Search account",
        "html": f"""
            <p>Your verification code is:</p>
            <h2>{code}</h2>
            <p>This code expires in 15 minutes.</p>
        """
    })
    
def send_password_reset_email(to_email: str, code: str):
    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": to_email,
        "subject": "Reset your Enovox Search password",
        "html": f"""
            <p>You requested a password reset. Your code is:</p>
            <h2>{code}</h2>
            <p>This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
        """
    })
    
def send_spotlight_published_email(to_email: str, founder_name: str, startup_name: str, slug: str):
    site_url = os.getenv("SITE_URL", "https://search.enovoxtech.com")
    link = f"{site_url}/spotlight/{slug}"
    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": to_email,
        "subject": f"Your spotlight is live, {founder_name}!", 
        "html": f"""
            <p>Hi {founder_name},</p>
            <p>Your founder spotlight for <strong>{startup_name}</strong> is now live on Enovox Search.</p>
            <p><a href="{link}">{link}</a></p>
            <p>Share it with your network, your team, and anyone who should see what you're building.</p>
            <p>Thank you for being part of Enovox Search.</p>
        """
    })
    
def send_claim_code_email(to_email: str, code: str, product_name: str):
    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": to_email,
        "subject": f"Verify ownership of {product_name}",
        "html": f"""
            <p>Use this code to claim <strong>{product_name}</strong> on Enovox Search:</p>
            <h2>{code}</h2>
            <p>This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
        """
    })  