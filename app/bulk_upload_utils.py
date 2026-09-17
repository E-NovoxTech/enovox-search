import pandas as pd
import io

HEADER_MAP = {
    "Product Name": "name",
    "Description": "description",
    "Category": "category",
    "Pricing": "pricing",
    "Price Details": "pricing_details",
    "Website": "website",
    "Product Type": "product_type",
    "Founder": "founder",
    "Company": "company",
    "Logo URL": "logo_url",
    "Keywords": "keywords",
    "Contact Email": "contact_email",
    "GitHub URL": "github_url",
    "App Store URL": "appstore_url",
    "Play Store URL": "playstore_url",
    "User Count Range": "user_count_range",
    "Twitter URL": "twitter_url",
    "Instagram URL": "instagram_url",
    "Facebook URL": "facebook_url",
    "LinkedIn URL": "linkedin_url",
}

def parse_csv_to_rows(file_bytes: bytes):
    df = pd.read_csv(io.BytesIO(file_bytes))
    df = df.rename(columns=HEADER_MAP)
    df = df.where(pd.notnull(df), None)

    rows = []
    for _, row in df.iterrows():
        row_dict = row.to_dict()
        name = row_dict.get("name")
        if not name or str(name).strip() == "":
            continue  # rows with no name are dropped entirely, can't preview without a name
        rows.append({k: (None if v is None or str(v).strip() == "" else str(v).strip()) for k, v in row_dict.items()})

    return rows