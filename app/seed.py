from .database import SessionLocal
from . import models
from .utils import generate_slug

db = SessionLocal()

sample_products = [
    models.Product(
        name="Paystack",
        description="Payment infrastructure for African businesses",
        category="Fintech",
        pricing="Paid",
        website="https://paystack.com",
        platform="Web",
        product_type="Software",
        founder="Shola Akinlade",
        appstore_url="https://apps.apple.com/us/app/paystack-merchant/id1481413006",
        playstore_url="https://play.google.com/store/apps/details?id=com.paystack.go&hl=en-US",
    ),
    models.Product(
        name="Flutterwave",
        description="Payment technology for businesses across Africa",
        category="Fintech",
        pricing="Paid",
        website="https://flutterwave.com",
        platform="Web/Mobile",
        product_type="Software",
        founder="Iyinoluwa Aboyeji",
        appstore_url="https://apps.apple.com/us/app/flutterwave/id1534897339",
        playstore_url="https://play.google.com/store/apps/details?id=com.flutterwave.app",
    ),
    models.Product(
        name="Rida",
        description="Ride-hailing platform for Nigerian cities",
        category="Transportation",
        pricing="Free",
        website="https://rida.ng",
        platform="Mobile",
        product_type="App",
        founder="Sam lim",
        appstore_url="https://apps.apple.com/us/app/rida-taxi-moto-rides/id6761409920",
        playstore_url="https://play.google.com/store/apps/details?id=com.ridataxi.rider&pcampaignid=web_share",
    ),
]

for product in sample_products:
    product.slug = generate_slug(product.name, db)

db.add_all(sample_products)
db.commit()
db.close()

print("Seed data added successfully.")