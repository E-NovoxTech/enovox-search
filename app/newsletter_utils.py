import resend
import os

resend.api_key = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM")
SITE_URL = "https://search.enovoxtech.com"


def get_all_recipients(db):
    from . import models

    dev_emails = db.query(models.Developer.email).filter(models.Developer.newsletter_opt_in == True).all()
    user_emails = db.query(models.User.email).filter(models.User.newsletter_opt_in == True).all()
    subscriber_emails = db.query(models.NewsletterSubscriber.email).all()

    all_emails = set()
    for (email,) in dev_emails:
        all_emails.add(email)
    for (email,) in user_emails:
        all_emails.add(email)
    for (email,) in subscriber_emails:
        all_emails.add(email)

    return list(all_emails)


def build_product_update_html(title: str, intro: str, products: list) -> str:
    product_blocks = ""
    for p in products:
        desc = (p.description or "")[:120]

        if p.logo_url:
            logo_html = f'<img src="{p.logo_url}" width="56" height="56" style="border-radius:8px; object-fit:cover;">'
        else:
            initial = p.name[0].upper() if p.name else "?"
            logo_html = f'''<div style="width:56px; height:56px; border-radius:8px; background:#2563eb; color:#fff; font-size:24px; font-weight:bold; text-align:center; line-height:56px;">{initial}</div>'''

        product_blocks += f"""
        <tr>
            <td style="padding:16px 0; border-bottom:1px solid #eee;">
                <table>
                    <tr>
                        <td style="vertical-align:top; padding-right:16px;">
                            {logo_html}
                        </td>
                        <td>
                            <h3 style="margin:0 0 6px 0; font-size:16px;">{p.name}</h3>
                            <p style="margin:0 0 8px 0; font-size:14px; color:#555;">{desc}{"..." if len(p.description or "") > 120 else ""}</p>
                            <a href="{SITE_URL}/product/{p.slug}?utm_source=newsletter&utm_medium=email" style="font-size:14px; color:#2563eb;">Check it out →</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        """

    return wrap_in_template(title, f"""
        <h2 style="margin-bottom:8px;">{title}</h2>
        <p style="color:#555; margin-bottom:20px;">{intro or ""}</p>
        <table width="100%" cellpadding="0" cellspacing="0">
            {product_blocks}
        </table>
    """)

def wrap_in_template(subject: str, inner_html: str) -> str:
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; background:#f9f9f9; padding:24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:#fff; border-radius:12px; padding:32px;">
            <tr>
                <td style="text-align:center; padding-bottom:24px;">
                    <img src="{SITE_URL}/static/assets/logo.png" height="64">
                </td>
            </tr>
            <tr>
                <td>{inner_html}</td>
            </tr>
            <tr>
                <td style="padding-top:32px; text-align:center; font-size:12px; color:#999;">
                    <p>Enovox Search — Nigerian Tech Discovery Platform</p>
                    <p><a href="{SITE_URL}/unsubscribe?email={{{{RECIPIENT_EMAIL}}}}" style="color:#999; text-decoration: underline; margin-top: 10px;">Unsubscribe</a></p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """


def send_newsletter(recipients: list, subject: str, html_body: str):
    results = {"sent": 0, "failed": []}
    for email in recipients:
        personalized_html = html_body.replace("{{RECIPIENT_EMAIL}}", email)
        try:
            resend.Emails.send({
                "from": EMAIL_FROM,
                "to": email,
                "subject": subject,
                "html": personalized_html
            })
            results["sent"] += 1
        except Exception as e:
            results["failed"].append({"email": email, "error": str(e)})
    return results