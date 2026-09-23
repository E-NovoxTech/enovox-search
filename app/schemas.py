from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class ProductBase(BaseModel):
    name: str
    description: str
    category: str
    pricing: Optional[str] = None
    pricing_details: Optional[str] = None
    website: Optional[str] = None
    platform: Optional[str] = None
    product_type: Optional[str] = None
    founder: str
    logo_url: Optional[str] = None
    appstore_url: Optional[str] = None
    playstore_url: Optional[str] = None
    user_count_range: Optional[str] = None
    contact_email: Optional[str] = None
    company_name: Optional[str] = None
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    linkedin_url: Optional[str] = None

class ProductOut(ProductBase):
    id: int
    status: bool
    slug: Optional[str] = None
    featured: bool
    is_popular: bool
    is_new_arrival: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    pricing: Optional[str] = None
    website: Optional[str] = None
    platform: Optional[str] = None
    product_type: Optional[str] = None
    founder: Optional[str] = None
    logo_url: Optional[str] = None
    appstore_url: Optional[str] = None
    playstore_url: Optional[str] = None
    user_count_range: Optional[str] = None
    contact_email: Optional[str] = None
    company_name: Optional[str] = None
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    status: Optional[bool] = None
    featured: Optional[bool] = None
    is_popular: Optional[bool] = None
    is_new_arrival: Optional[bool] = None

class SubmissionCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    company: Optional[str] = None
    founder: str = Field(..., min_length=2, max_length=100)
    description: str = Field(..., min_length=20, max_length=1000)
    keywords: str
    category: str
    website: Optional[str] = None
    pricing: Optional[str] = None
    pricing_details: Optional[str] = None
    product_type: Optional[str] = None
    email: Optional[EmailStr] = None
    logo_url: Optional[str] = None
    appstore_url: Optional[str] = None
    playstore_url: Optional[str] = None
    user_count_range: Optional[str] = None
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    contact_email: str
    github_url: Optional[str] = None
    
class DeveloperSignup(BaseModel):
    email: str
    password: str
    newsletter_opt_in: Optional[bool] = False

class UserSignup(BaseModel):
    email: str
    password: str
    newsletter_opt_in: Optional[bool] = False


class DeveloperLogin(BaseModel):
    email: EmailStr
    password: str


class DeveloperOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SubmissionOut(BaseModel):
    id: int
    name: str
    category: str
    email: Optional[str] = None
    reviewed: bool

    class Config:
        from_attributes = True
class SubmissionDetail(BaseModel):
    id: int
    name: str
    company: Optional[str] = None
    description: str
    category: str
    website: Optional[str] = None
    pricing: Optional[str] = None
    product_type: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    appstore_url: Optional[str] = None
    playstore_url: Optional[str] = None
    user_count_range: Optional[str] = None
    founder: str
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    developer_id: Optional[int] = None

    class Config:
        from_attributes = True


class RejectSubmission(BaseModel):
    reason: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str  

class VerifyEmail(BaseModel):
    email: str
    code: str
    account_type: str

class ResendCode(BaseModel):
    email: str
    account_type: str
    
class GoogleAuth(BaseModel):
    credential: str
    account_type: Optional[str] = None
    newsletter_opt_in: Optional[bool] = False
    
class SubmissionEdit(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    pricing: Optional[str] = None
    pricing_details: Optional[str] = None
    website: Optional[str] = None
    product_type: Optional[str] = None
    logo_url: Optional[str] = None
    appstore_url: Optional[str] = None
    playstore_url: Optional[str] = None
    user_count_range: Optional[str] = None
    founder: Optional[str] = None
    company: Optional[str] = None
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    keywords: Optional[str] = None
    contact_email: Optional[str] = None
    github_url: Optional[str] = None

class BulkProductRow(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    pricing: Optional[str] = None
    pricing_details: Optional[str] = None
    website: Optional[str] = None
    product_type: Optional[str] = None
    founder: Optional[str] = None
    company: Optional[str] = None
    logo_url: Optional[str] = None
    keywords: Optional[str] = None
    contact_email: Optional[str] = None
    github_url: Optional[str] = None
    appstore_url: Optional[str] = None
    playstore_url: Optional[str] = None
    user_count_range: Optional[str] = None
    twitter_url: Optional[str] = None
    instagram_url: Optional[str] = None
    facebook_url: Optional[str] = None
    linkedin_url: Optional[str] = None

class BulkPublishRequest(BaseModel):
    products: List[BulkProductRow]
    
    
class ClaimSubmit(BaseModel):
    name: str
    email: str
    role: str
    social_url: Optional[str] = None
    
class NewsletterSubscribe(BaseModel):
    email: str

class NewsletterProductSend(BaseModel):
    title: str
    intro: Optional[str] = None
    product_ids: List[int]

class NewsletterCustomSend(BaseModel):
    subject: str
    html_body: str
    
class ForgotPassword(BaseModel):
    email: str
    account_type: str

class ResetPassword(BaseModel):
    email: str
    code: str
    new_password: str
    account_type: str