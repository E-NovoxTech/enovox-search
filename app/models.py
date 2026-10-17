from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Date, ForeignKey, UniqueConstraint
from datetime import datetime, date
from .database import Base
from sqlalchemy.orm import relationship

class Developer(Base):
    __tablename__ = "developers"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)   
    is_verified = Column(Boolean, default=False)
    verification_code = Column(String, nullable=True)
    verification_code_expires = Column(DateTime, nullable=True)
    auth_provider = Column(String, default="password", nullable=True)
    newsletter_opt_in = Column(Boolean, default=False)
    reset_code = Column(String, nullable=True)
    reset_code_expires = Column(DateTime, nullable=True)
    
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    keywords = Column(String, nullable=True)
    category = Column(String, nullable=False)
    pricing = Column(String, nullable=True)
    pricing_details = Column(String, nullable=True)
    website = Column(String, nullable=True)
    platform = Column(String, nullable=True)
    product_type = Column(String, nullable=True)
    founder = Column(String, nullable=False)
    status = Column(Boolean, default=True)
    logo_url = Column(String, nullable=True)
    slug = Column(String, unique=True, index=True, nullable=True)
    appstore_url = Column(String, nullable=True)
    playstore_url = Column(String, nullable=True)
    user_count_range = Column(String, nullable=True)
    featured = Column(Boolean, default=False)
    is_popular = Column(Boolean, default=False)
    is_new_arrival = Column(Boolean, default=False)
    is_sponsored = Column(Boolean, default=False, nullable=False, server_default="0")
    sponsored_position = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=True)
    contact_email = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    twitter_url = Column(String, nullable=True)
    instagram_url = Column(String, nullable=True)
    facebook_url = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    github_url = Column(String, nullable=True)


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    company = Column(String, nullable=True)
    founder = Column(String, nullable=True)
    description = Column(Text, nullable=False)
    keywords = Column(String, nullable=True)
    category = Column(String, nullable=False)
    website = Column(String, nullable=True)
    pricing = Column(String, nullable=True)
    pricing_details = Column(String, nullable=True)
    product_type = Column(String, nullable=True)
    email = Column(String, nullable=False)
    logo_url = Column(String, nullable=True)
    appstore_url = Column(String, nullable=True)
    playstore_url = Column(String, nullable=True)
    user_count_range = Column(String, nullable=True)
    twitter_url = Column(String, nullable=True)
    instagram_url = Column(String, nullable=True)
    facebook_url = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    github_url = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    status = Column(String, default="pending")
    rejection_reason = Column(Text, nullable=True)
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    foreign_tool_ids = Column(String, nullable=True)
    
    
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_verified = Column(Boolean, default=False)
    verification_code = Column(String, nullable=True)
    verification_code_expires = Column(DateTime, nullable=True)
    auth_provider = Column(String, default="password", nullable=True)
    newsletter_opt_in = Column(Boolean, default=False)
    reset_code = Column(String, nullable=True)
    reset_code_expires = Column(DateTime, nullable=True)

class SearchUsage(Base):
    __tablename__ = "search_usage"

    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String, index=True, nullable=False)  
    date = Column(Date, default=date.today, index=True)
    count = Column(Integer, default=0)

class ClaimRequest(Base):
    __tablename__ = "claim_requests"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    role = Column(String, nullable=False)
    social_url = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending | approved | rejected
    rejection_reason = Column(String, nullable=True)
    created_at = Column(Date, default=date.today)
    verification_code = Column(String, nullable=True)
    verification_code_expires = Column(DateTime, nullable=True)
    
class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False)
    created_at = Column(Date, default=date.today)
 
class SiteBanner(Base):
    __tablename__ = "site_banner"
    id = Column(Integer, primary_key=True, index=True)
    message = Column(String, nullable=True)
    link_url = Column(String, nullable=True)
    link_text = Column(String, nullable=True)
    is_active = Column(Boolean, default=False)
    is_marquee = Column(Boolean, default=False)
    updated_at = Column(Date, default=date.today)
    link_style = Column(String, default="button")
    
class SearchLog(Base):
    __tablename__ = "search_logs"
    id = Column(Integer, primary_key=True, index=True)
    query = Column(String, nullable=False)
    results_count = Column(Integer, default=0)
    created_at = Column(Date, default=date.today)


class SavedProduct(Base):
    __tablename__ = "saved_products"
    id = Column(Integer, primary_key=True, index=True)
    account_type = Column(String, nullable=False)  # "developer" or "user"
    account_id = Column(Integer, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    created_at = Column(Date, default=date.today)
    
class ForeignTool(Base):
    __tablename__ = "foreign_tools"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    logo_url = Column(String, nullable=True)
    description = Column(String, nullable=True)
    category = Column(String, nullable=False)
    created_at = Column(Date, default=date.today)


class ProductAlternative(Base):
    __tablename__ = "product_alternatives"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    foreign_tool_id = Column(Integer, ForeignKey("foreign_tools.id"), nullable=False)
    created_at = Column(Date, default=date.today) 
    
class Collection(Base):
    __tablename__ = "collections"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    emoji = Column(String, nullable=True)
    description = Column(String, nullable=True)
    section_type = Column(String, nullable=False, default="manual")  # "manual" or "auto"
    auto_rule = Column(String, nullable=True)                        # "newest" for now
    is_published = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    display_order = Column(Integer, default=0)
    created_at = Column(Date, default=date.today)


class CollectionProduct(Base):
    __tablename__ = "collection_products"
    id = Column(Integer, primary_key=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    position = Column(Integer, default=0)
    
    
class SpotlightApplication(Base):
    __tablename__ = "spotlight_applications"
    id = Column(Integer, primary_key=True, index=True)
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=True)
    source = Column(String, nullable=False, default="founder")  # "founder" or "admin"
    founder_name = Column(String, nullable=False)
    photo_url = Column(String, nullable=False)
    startup_name = Column(String, nullable=False)
    startup_key = Column(String, nullable=False, unique=True)  # normalised name, one application per startup
    state = Column(String, nullable=False)
    what_it_does = Column(String, nullable=False)
    quote = Column(String, nullable=True)
    challenges = Column(String, nullable=True)
    achievement = Column(String, nullable=True)
    vision = Column(String, nullable=False)
    startup_website = Column(String, nullable=True)
    skills = Column(String, nullable=True)            # comma-separated, max 5
    instagram_url = Column(String, nullable=True)
    x_url = Column(String, nullable=True)
    facebook_url = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    tiktok_url = Column(String, nullable=True)
    github_url = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)   # was nullable=False
    why_nigeria = Column(String, nullable=True)      # new
    open_to_work = Column(Boolean, default=False)
    consent = Column(Boolean, nullable=False, default=False)
    guidelines_agreed = Column(Boolean, nullable=False, default=False)
    status = Column(String, nullable=False, default="draft")  # draft, pending, approved, rejected
    rejection_reason = Column(String, nullable=True)
    created_at = Column(Date, default=date.today)
    updated_at = Column(Date, default=date.today)


class SpotlightApplicationProduct(Base):
    __tablename__ = "spotlight_application_products"
    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("spotlight_applications.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)


class Spotlight(Base):
    __tablename__ = "spotlights"
    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("spotlight_applications.id"), nullable=False, unique=True)
    application = relationship("SpotlightApplication")   # <-- add this line
    slug = Column(String, unique=True, nullable=False)
    headline = Column(String, nullable=False)
    summary = Column(String, nullable=True)
    body_opening = Column(String, nullable=True)
    body_building = Column(String, nullable=True)
    quote = Column(String, nullable=True)
    body_why_started = Column(String, nullable=True)
    body_headed = Column(String, nullable=True)
    why_believe = Column(String, nullable=True)
    status = Column(String, nullable=False, default="draft")  # draft, scheduled, published, unpublished
    published_at = Column(DateTime, nullable=True)
    scheduled_for = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)


class SpotlightReaction(Base):
    __tablename__ = "spotlight_reactions"
    id = Column(Integer, primary_key=True, index=True)
    spotlight_id = Column(Integer, ForeignKey("spotlights.id", ondelete="CASCADE"), nullable=False)
    account_type = Column(String, nullable=False)
    account_id = Column(Integer, nullable=False)
    value = Column(String, nullable=False)  # "like" or "dislike"
    __table_args__ = (UniqueConstraint("spotlight_id", "account_type", "account_id"),)


class SpotlightHire(Base):
    __tablename__ = "spotlight_hires"
    id = Column(Integer, primary_key=True, index=True)
    spotlight_id = Column(Integer, ForeignKey("spotlights.id", ondelete="CASCADE"), nullable=False)
    hired_by = Column(String, nullable=True)
    note = Column(String, nullable=True)
    hired_on = Column(Date, nullable=True)
    confirmed = Column(Boolean, default=False)
    created_at = Column(Date, default=date.today)
    
class SponsoredProduct(Base):
    __tablename__ = "sponsored_products"
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    position = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    created_at = Column(Date, default=date.today)
    
    