from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Date, ForeignKey
from datetime import datetime, date
from .database import Base


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
    created_at = Column(DateTime, default=datetime.utcnow)
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=True)
    contact_email = Column(String, nullable=True)
    company= Column(String, nullable=True)
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


class SearchUsage(Base):
    __tablename__ = "search_usage"

    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String, index=True, nullable=False)  
    date = Column(Date, default=date.today, index=True)
    count = Column(Integer, default=0)