from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, utils
from app.ai_router import ask_ai
from app.routers.users import get_current_user

router = APIRouter(prefix="/ai", tags=["ai"])

class AskRequest(BaseModel):
    query: str

class ProductDetailsRequest(BaseModel):
    slug: str


def get_identity_and_limit(current_account, http_request):
    if current_account is None:
        return f"ip:{http_request.client.host}", 3, True  # True = anonymous
    elif isinstance(current_account, models.Developer):
        return f"dev:{current_account.id}", 10, False
    else:
        return f"user:{current_account.id}", 10, False


@router.post("/ask")
def ask(request: AskRequest, http_request: Request, db: Session = Depends(get_db),
        current_account = Depends(get_current_user)):

    identifier, limit, is_anonymous = get_identity_and_limit(current_account, http_request)

    if not utils.check_and_increment_usage(db, identifier, limit):
        detail = {"message": f"Daily search limit reached. Try again tomorrow."}
        if is_anonymous:
            detail["message"] += " Sign up or log in to get more searches per day."
            detail["action"] = "signup_or_login"
        raise HTTPException(status_code=429, detail=detail)

    KNOWN_CATEGORIES = (
        "AI & Automation, Fintech, Education, Business, Productivity, E-commerce, "
        "Transportation, Health & Wellness, Entertainment & Media, Real Estate & Housing, "
        "Agriculture, Social & Community, Developer Tools, Other"
    )

    classify_prompt = (
        f"A user typed this into a Nigerian tech product search tool: \"{request.query}\"\n\n"
        f"This tool ONLY finds/recommends/describes Nigerian tech products in its database. "
        f"It does not write code, answer general trivia, or do anything unrelated to product discovery.\n\n"
        f"The database only uses these exact categories: {KNOWN_CATEGORIES}\n\n"
        f"If the query is about finding, comparing, or asking about a product/tool/app "
        f"(including 'alternative to X' style questions), reply with 2-4 comma-separated search terms. "
        f"At least one term MUST be the closest matching category from the list above "
        f"(e.g. 'banking app' -> include 'Fintech'; 'app for farmers' -> include 'Agriculture'). "
        f"You may also include specific keywords from the query itself alongside the category. "
        f"Reply with ONLY the comma-separated terms, nothing else.\n"
        f"If the query is NOT related to product discovery (e.g. 'write me code', 'what is a noun', general chit-chat), "
        f"reply with exactly: OFF_TOPIC"
    )
    classification = ask_ai(classify_prompt).strip()

    if "OFF_TOPIC" in classification.upper():
        return {
            "answer": "I'm here to help you find and learn about Nigerian tech products in our directory — I can't help with that, but feel free to ask me about a product or describe what you need!",
            "products": []
        }

    keywords = [k.strip() for k in classification.split(",") if k.strip()]

    matches = []
    seen_ids = set()

    # Priority 1: exact/near product name match (handles "tell me about Paystack" style queries)
    name_match = db.query(models.Product).filter(
        models.Product.status == True,
        models.Product.name.ilike(f"%{request.query.strip()}%")
    ).first()

    if name_match:
        matches.append(name_match)
        seen_ids.add(name_match.id)
        # pad with same-category products only, not loose keyword matches
        same_category = db.query(models.Product).filter(
            models.Product.status == True,
            models.Product.category == name_match.category,
            models.Product.id != name_match.id
        ).limit(1).all()
        for p in same_category:
            matches.append(p)
            seen_ids.add(p.id)
    else:
        # Priority 2: broad keyword search (for "I need X" style queries)
        for kw in keywords:
            results = db.query(models.Product).filter(
                models.Product.status == True,
                models.Product.name.ilike(f"%{kw}%") |
                models.Product.description.ilike(f"%{kw}%") |
                models.Product.category.ilike(f"%{kw}%") |
                models.Product.keywords.ilike(f"%{kw}%")
            ).limit(5).all()
            for p in results:
                if p.id not in seen_ids:
                    matches.append(p)
                    seen_ids.add(p.id)
            if len(matches) >= 2:
                break

    if not matches:
        return {"answer": "I couldn't find any matching products in our database yet.", "products": []}

    matches = matches[:2]  # short-first: cap at 2

    context = "\n".join(
        f"- {p.name}: {p.description} (Category: {p.category}, Pricing: {p.pricing})"
        for p in matches
    )

    final_prompt = (
        f"You are a product recommendation assistant for a Nigerian tech directory. "
        f"Only recommend from the products listed below — never mention or invent any other products.\n\n"
        f"Products:\n{context}\n\n"
        f"User question: {request.query}\n\n"
        f"Respond in this exact format:\n"
        f"1. Start with one short sentence directly answering the question.\n"
        f"2. Then list each product as:\n"
        f"   **Product Name** — one-sentence reason it fits, then Pricing: X\n"
        f"3. Write in a warm, natural, human tone — not robotic or overly formal. Keep it under 100 words total. No extra commentary, no markdown headers."
    )

    answer = ask_ai(final_prompt)
    words = answer.split()
    if len(words) > 100:
        answer = " ".join(words[:100]) + "..."

    return {
        "answer": answer,
        "products": [{"name": p.name, "slug": p.slug} for p in matches]
    }


@router.post("/product-details")
def product_details(request: ProductDetailsRequest, http_request: Request, db: Session = Depends(get_db),
                     current_account = Depends(get_current_user)):

    identifier, limit, is_anonymous = get_identity_and_limit(current_account, http_request)

    if not utils.check_and_increment_usage(db, identifier, limit):
        detail = {"message": f"Daily search limit reached .Try again tomorrow."}
        if is_anonymous:
            detail["message"] += " Sign up or log in to get more searches per day."
            detail["action"] = "signup_or_login"
        raise HTTPException(status_code=429, detail=detail)

    product = db.query(models.Product).filter(
        models.Product.slug == request.slug,
        models.Product.status == True
    ).first()

    if not product:
        return {"answer": "Sorry, I couldn't find that product.", "product": None, "similar_products": []}

    detail_prompt = (
        f"You are describing a Nigerian tech product to a user, using ONLY the information below. "
        f"You may rephrase or elaborate for clarity, but NEVER add facts, features, or claims not present in this description.\n\n"
        f"Product: {product.name}\n"
        f"Description: {product.description}\n"
        f"Category: {product.category}\n"
        f"Pricing: {product.pricing}\n"
        f"Platform: {product.platform or 'Not specified'}\n\n"
        f"Write a clear, helpful 2-4 sentence expanded description based strictly on the above."
    )
    answer = ask_ai(detail_prompt)

    similar = db.query(models.Product).filter(
        models.Product.category == product.category,
        models.Product.id != product.id,
        models.Product.status == True
    ).limit(3).all()

    return {
        "answer": answer,
        "product": {"name": product.name, "slug": product.slug},
        "similar_products": [{"name": p.name, "slug": p.slug} for p in similar]
    }