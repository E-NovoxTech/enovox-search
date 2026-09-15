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