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

def send_welcome_email(to_email: str, first_name: str, is_developer: bool):
    cta_text = "View Dashboard" if is_developer else "Explore Enovox Search"
    cta_url = f"{os.getenv('SITE_URL', 'https://search.enovoxtech.com')}/{'dashboard' if is_developer else 'explore'}"

    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": to_email,
        "subject": "Welcome to Enovox Search!",
        "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
                <h2>Hi {first_name},</h2>
                <p><strong>Welcome to Enovox Search!</strong></p>
                <p>We're glad to have you here.</p>
                <p>Enovox Search helps you discover Nigerian-built apps, AI tools and software, explore innovative products, and see what Nigerians are building.</p>

                <h3>What's next?</h3>
                <p>Start exploring the Nigerian tech ecosystem and discover tools that might be useful to you.</p>
                <p style="text-align: center; margin: 24px 0;">
                    <a href="{cta_url}" style="background: #1d4ed8; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">{cta_text}</a>
                </p>

                <h3>Join our community</h3>
                <p>Stay connected with us and other members of the ecosystem.</p>
                <p><strong>WhatsApp Channel</strong> — Get product discoveries, announcements and updates.</p>
                <p style="text-align: center; margin: 12px 0;">
                    <a href="https://whatsapp.com/channel/0029VbDeO2IJuyA553UjYp0r" style="background: #16a34a; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none;">Join Our WhatsApp Channel</a>
                </p>
                <p><strong>WhatsApp Community Group</strong> — Connect, share ideas and join conversations with other members.</p>
                <p style="text-align: center; margin: 12px 0;">
                    <a href="https://chat.whatsapp.com/CDAeutcMHKkDHFYQOc0pyn?s=cl&p=a&mlu=4&ilr=4" style="background: #16a34a; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none;">Join Our WhatsApp Group</a>
                </p>

                <p>Have feedback, suggestions or questions? We'd love to hear from you.</p>
                <p>Thank you for being part of Enovox Search.<br>The Enovox Search Team</p>
                <p style="color: #888; font-size: 13px;">Discover what Nigerians are building.</p>
            </div>
        """
    })

def send_product_approved_email(to_email: str, product_name: str, slug: str):
    link = f"{os.getenv('SITE_URL', 'https://search.enovoxtech.com')}/product/{slug}"
    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": to_email,
        "subject": f"{product_name} is now live on Enovox Search!",
        "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
                <h2>Good news!</h2>
                <p><strong>{product_name}</strong> has been approved and is now live on Enovox Search.</p>
                <p style="text-align: center; margin: 24px 0;">
                    <a href="{link}" style="background: #1d4ed8; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">View Your Listing</a>
                </p>
                <p>Share it with your network and let people discover what you've built.</p>
                <p>Thank you for being part of Enovox Search.<br>The Enovox Search Team</p>
            </div>
        """
    })

def send_new_signup_alert(account_type: str, email: str):
    admin_email = os.getenv("ADMIN_EMAIL")
    if not admin_email:
        return
    try:
        resend.Emails.send({
            "from": EMAIL_FROM,
            "to": admin_email,
            "subject": f"New {account_type} signup: {email}",
            "html": f"<p>A new <strong>{account_type}</strong> account just signed up.</p><p>Email: {email}</p>"
        })
    except Exception as e:
        print(f"[signup alert] failed: {e}")
        
        
        
        
        