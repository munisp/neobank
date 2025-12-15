"""
Loan Database Models
Implements loan application, disbursement, and repayment tracking
"""

from sqlalchemy import Column, String, Numeric, DateTime, Enum as SQLEnum, Integer, JSON, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from decimal import Decimal
from typing import Optional, List, Dict, Any

from .base import Base


class LoanStatus(str, enum.Enum):
    """Loan application status"""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISBURSED = "disbursed"
    ACTIVE = "active"
    COMPLETED = "completed"
    DEFAULTED = "defaulted"
    CANCELLED = "cancelled"


class LoanType(str, enum.Enum):
    """Loan product types"""
    PERSONAL = "personal"
    BUSINESS = "business"
    MORTGAGE = "mortgage"
    AUTO = "auto"
    EDUCATION = "education"
    PAYDAY = "payday"


class DisbursementStatus(str, enum.Enum):
    """Disbursement status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RepaymentStatus(str, enum.Enum):
    """Repayment status"""
    PENDING = "pending"
    PAID = "paid"
    OVERDUE = "overdue"
    PARTIAL = "partial"
    WAIVED = "waived"


class LoanApplication(Base):
    """
    Loan application model
    Stores loan application data and tracks status
    """
    __tablename__ = "loan_applications"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_id = Column(String(50), unique=True, nullable=False, index=True)  # Human-readable ID
    
    # Applicant
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Loan details
    loan_type = Column(SQLEnum(LoanType), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="NGN")
    interest_rate = Column(Numeric(5, 2), nullable=False)  # Annual percentage rate
    term_months = Column(Integer, nullable=False)  # Loan term in months
    
    # Purpose
    purpose = Column(String(500), nullable=False)
    
    # Status
    status = Column(SQLEnum(LoanStatus), nullable=False, default=LoanStatus.DRAFT)
    
    # Personal information
    personal_info = Column(JSON, nullable=False)  # Name, DOB, address, etc.
    
    # Employment information
    employment_info = Column(JSON, nullable=False)  # Employer, income, etc.
    
    # Income information
    income_info = Column(JSON, nullable=False)  # Monthly income, sources, etc.
    
    # Additional information
    additional_info = Column(JSON, nullable=True)  # Collateral, guarantors, etc.
    
    # Documents
    documents = Column(JSON, nullable=True)  # List of uploaded document IDs
    
    # Credit assessment
    credit_score = Column(Integer, nullable=True)
    risk_rating = Column(String(20), nullable=True)  # Low, Medium, High
    
    # Approval
    approved_amount = Column(Numeric(15, 2), nullable=True)
    approved_rate = Column(Numeric(5, 2), nullable=True)
    approved_term = Column(Integer, nullable=True)
    approved_by = Column(UUID(as_uuid=True), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    
    # Rejection
    rejection_reason = Column(String(500), nullable=True)
    rejected_by = Column(UUID(as_uuid=True), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    
    # Relationships
    disbursements = relationship("LoanDisbursement", back_populates="loan_application", cascade="all, delete-orphan")
    repayments = relationship("RepaymentSchedule", back_populates="loan_application", cascade="all, delete-orphan")
    
    def calculate_monthly_payment(self) -> Decimal:
        """Calculate monthly payment amount"""
        if not self.approved_amount or not self.approved_rate or not self.approved_term:
            return Decimal("0.00")
        
        principal = Decimal(str(self.approved_amount))
        monthly_rate = Decimal(str(self.approved_rate)) / Decimal("100") / Decimal("12")
        num_payments = Decimal(str(self.approved_term))
        
        if monthly_rate == 0:
            return principal / num_payments
        
        # Monthly payment formula: P * [r(1+r)^n] / [(1+r)^n - 1]
        monthly_payment = principal * (monthly_rate * (1 + monthly_rate) ** num_payments) / \
                         ((1 + monthly_rate) ** num_payments - 1)
        
        return monthly_payment.quantize(Decimal("0.01"))
    
    def calculate_total_payment(self) -> Decimal:
        """Calculate total payment amount"""
        monthly_payment = self.calculate_monthly_payment()
        if not self.approved_term:
            return Decimal("0.00")
        return (monthly_payment * Decimal(str(self.approved_term))).quantize(Decimal("0.01"))
    
    def calculate_total_interest(self) -> Decimal:
        """Calculate total interest amount"""
        if not self.approved_amount:
            return Decimal("0.00")
        total_payment = self.calculate_total_payment()
        return (total_payment - Decimal(str(self.approved_amount))).quantize(Decimal("0.01"))
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "loan_id": self.loan_id,
            "user_id": str(self.user_id),
            "loan_type": self.loan_type.value,
            "amount": float(self.amount),
            "currency": self.currency,
            "interest_rate": float(self.interest_rate),
            "term_months": self.term_months,
            "purpose": self.purpose,
            "status": self.status.value,
            "personal_info": self.personal_info,
            "employment_info": self.employment_info,
            "income_info": self.income_info,
            "additional_info": self.additional_info,
            "documents": self.documents,
            "credit_score": self.credit_score,
            "risk_rating": self.risk_rating,
            "approved_amount": float(self.approved_amount) if self.approved_amount else None,
            "approved_rate": float(self.approved_rate) if self.approved_rate else None,
            "approved_term": self.approved_term,
            "approved_by": str(self.approved_by) if self.approved_by else None,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "rejection_reason": self.rejection_reason,
            "rejected_by": str(self.rejected_by) if self.rejected_by else None,
            "rejected_at": self.rejected_at.isoformat() if self.rejected_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<LoanApplication(loan_id={self.loan_id}, status={self.status.value}, amount={self.amount})>"


class LoanDisbursement(Base):
    """
    Loan disbursement model
    Tracks loan disbursement transactions
    """
    __tablename__ = "loan_disbursements"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    disbursement_id = Column(String(50), unique=True, nullable=False, index=True)
    
    # Loan reference
    loan_application_id = Column(UUID(as_uuid=True), ForeignKey("loan_applications.id"), nullable=False)
    
    # Disbursement details
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="NGN")
    
    # Destination
    account_number = Column(String(50), nullable=False)
    bank_code = Column(String(20), nullable=False)
    account_name = Column(String(255), nullable=False)
    
    # Status
    status = Column(SQLEnum(DisbursementStatus), nullable=False, default=DisbursementStatus.PENDING)
    
    # Transaction reference
    transaction_id = Column(String(100), nullable=True)  # External transaction ID
    
    # Processing
    processed_by = Column(UUID(as_uuid=True), nullable=True)
    processed_at = Column(DateTime, nullable=True)
    
    # Failure
    failure_reason = Column(String(500), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Metadata
    metadata = Column(JSON, nullable=True)
    
    # Relationship
    loan_application = relationship("LoanApplication", back_populates="disbursements")
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "disbursement_id": self.disbursement_id,
            "loan_application_id": str(self.loan_application_id),
            "amount": float(self.amount),
            "currency": self.currency,
            "account_number": self.account_number,
            "bank_code": self.bank_code,
            "account_name": self.account_name,
            "status": self.status.value,
            "transaction_id": self.transaction_id,
            "processed_by": str(self.processed_by) if self.processed_by else None,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
            "failure_reason": self.failure_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<LoanDisbursement(disbursement_id={self.disbursement_id}, status={self.status.value}, amount={self.amount})>"


class RepaymentSchedule(Base):
    """
    Repayment schedule model
    Tracks loan repayment schedule and payments
    """
    __tablename__ = "repayment_schedules"
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Loan reference
    loan_application_id = Column(UUID(as_uuid=True), ForeignKey("loan_applications.id"), nullable=False)
    
    # Schedule details
    installment_number = Column(Integer, nullable=False)  # 1, 2, 3, etc.
    due_date = Column(DateTime, nullable=False)
    
    # Amounts
    principal_amount = Column(Numeric(15, 2), nullable=False)
    interest_amount = Column(Numeric(15, 2), nullable=False)
    total_amount = Column(Numeric(15, 2), nullable=False)
    
    # Payment tracking
    paid_amount = Column(Numeric(15, 2), nullable=False, default=Decimal("0.00"))
    outstanding_amount = Column(Numeric(15, 2), nullable=False)
    
    # Status
    status = Column(SQLEnum(RepaymentStatus), nullable=False, default=RepaymentStatus.PENDING)
    
    # Payment details
    paid_at = Column(DateTime, nullable=True)
    payment_reference = Column(String(100), nullable=True)
    
    # Late payment
    is_overdue = Column(Boolean, default=False, nullable=False)
    overdue_days = Column(Integer, default=0, nullable=False)
    late_fee = Column(Numeric(15, 2), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Metadata
    metadata = Column(JSON, nullable=True)
    
    # Relationship
    loan_application = relationship("LoanApplication", back_populates="repayments")
    
    def mark_as_paid(self, amount: Decimal, payment_reference: str) -> None:
        """Mark repayment as paid"""
        self.paid_amount = amount
        self.outstanding_amount = self.total_amount - amount
        
        if self.outstanding_amount <= Decimal("0.00"):
            self.status = RepaymentStatus.PAID
            self.outstanding_amount = Decimal("0.00")
        else:
            self.status = RepaymentStatus.PARTIAL
        
        self.paid_at = datetime.utcnow()
        self.payment_reference = payment_reference
    
    def check_overdue(self) -> None:
        """Check if repayment is overdue"""
        if self.status == RepaymentStatus.PAID:
            return
        
        if datetime.utcnow() > self.due_date:
            self.is_overdue = True
            self.overdue_days = (datetime.utcnow() - self.due_date).days
            self.status = RepaymentStatus.OVERDUE
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "loan_application_id": str(self.loan_application_id),
            "installment_number": self.installment_number,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "principal_amount": float(self.principal_amount),
            "interest_amount": float(self.interest_amount),
            "total_amount": float(self.total_amount),
            "paid_amount": float(self.paid_amount),
            "outstanding_amount": float(self.outstanding_amount),
            "status": self.status.value,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "payment_reference": self.payment_reference,
            "is_overdue": self.is_overdue,
            "overdue_days": self.overdue_days,
            "late_fee": float(self.late_fee) if self.late_fee else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def __repr__(self) -> str:
        return f"<RepaymentSchedule(installment={self.installment_number}, status={self.status.value}, amount={self.total_amount})>"
