"""
Pydantic schemas for authentication
"""
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, validator, Field
import uuid


class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, regex=r'^\+?[1-9]\d{1,14}$')
    date_of_birth: Optional[date] = None
    address: Optional[str] = Field(None, max_length=500)


class UserCreate(UserBase):
    """Schema for user registration"""
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)
    
    @validator('confirm_password')
    def passwords_match(cls, v, values, **kwargs):
        if 'password' in values and v != values['password']:
            raise ValueError('Passwords do not match')
        return v
    
    @validator('password')
    def validate_password(cls, v):
        """Validate password strength"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        
        has_upper = any(c.isupper() for c in v)
        has_lower = any(c.islower() for c in v)
        has_digit = any(c.isdigit() for c in v)
        has_special = any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in v)
        
        if not (has_upper and has_lower and has_digit and has_special):
            raise ValueError(
                'Password must contain at least one uppercase letter, '
                'one lowercase letter, one digit, and one special character'
            )
        
        return v
    
    @validator('email')
    def validate_email(cls, v):
        """Normalize email to lowercase"""
        return v.lower()


class UserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr
    password: str = Field(..., min_length=1)
    
    @validator('email')
    def validate_email(cls, v):
        """Normalize email to lowercase"""
        return v.lower()


class UserResponse(BaseModel):
    """Schema for user response (excludes sensitive data)"""
    id: uuid.UUID
    email: str
    full_name: str
    phone_number: Optional[str]
    date_of_birth: Optional[date]
    address: Optional[str]
    is_active: bool
    is_verified: bool
    email_verified: bool
    phone_verified: bool
    kyc_status: str
    kyc_completed_at: Optional[datetime]
    last_login: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Schema for token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request"""
    refresh_token: str = Field(..., min_length=1)


class PasswordResetRequest(BaseModel):
    """Schema for password reset request"""
    email: EmailStr
    
    @validator('email')
    def validate_email(cls, v):
        return v.lower()


class PasswordResetConfirm(BaseModel):
    """Schema for password reset confirmation"""
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)
    
    @validator('confirm_password')
    def passwords_match(cls, v, values, **kwargs):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v


class EmailVerificationRequest(BaseModel):
    """Schema for email verification request"""
    token: str = Field(..., min_length=1)


class PhoneVerificationRequest(BaseModel):
    """Schema for phone verification request"""
    phone_number: str = Field(..., regex=r'^\+?[1-9]\d{1,14}$')


class PhoneVerificationConfirm(BaseModel):
    """Schema for phone verification confirmation"""
    phone_number: str = Field(..., regex=r'^\+?[1-9]\d{1,14}$')
    verification_code: str = Field(..., min_length=4, max_length=8)


class UserUpdate(BaseModel):
    """Schema for user profile update"""
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    phone_number: Optional[str] = Field(None, regex=r'^\+?[1-9]\d{1,14}$')
    date_of_birth: Optional[date] = None
    address: Optional[str] = Field(None, max_length=500)


class ChangePasswordRequest(BaseModel):
    """Schema for password change request"""
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)
    
    @validator('confirm_password')
    def passwords_match(cls, v, values, **kwargs):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v
