"""
Comprehensive Loan Service with Database Persistence
Handles personal loans, business loans, auto loans, and mortgage applications
Integrates with credit_risk_service, financial_analysis_service, and TigerBeetle
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from decimal import Decimal
from enum import Enum
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_, insert
from sqlalchemy.orm import selectinload

from app.models.loan import LoanApplication, LoanDisbursement, RepaymentSchedule
from app.services.credit_risk_service import CreditRiskService
from app.services.financial_analysis_service import FinancialAnalysisService
from app.services.notification_service import NotificationService
from app.services.document_management_service import DocumentManagementService

logger = structlog.get_logger()


class LoanType(str, Enum):
    PERSONAL = "personal"
    BUSINESS = "business"
    AUTO = "auto"
    MORTGAGE = "mortgage"
    STUDENT = "student"
    EDUCATION = "education"
    PAYDAY = "payday"


class LoanStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    PRE_APPROVED = "pre_approved"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISBURSED = "disbursed"
    ACTIVE = "active"
    PAID_OFF = "paid_off"
    DEFAULTED = "defaulted"
    CANCELLED = "cancelled"


class RepaymentFrequency(str, Enum):
    WEEKLY = "weekly"
    BI_WEEKLY = "bi_weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class DisbursementStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class RepaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"
    DEFAULTED = "defaulted"


class LoanService:
    """
    Comprehensive loan management service with full database persistence
    """

    def __init__(
        self,
        db: AsyncSession,
        credit_risk_service: CreditRiskService,
        financial_analysis_service: FinancialAnalysisService,
        notification_service: NotificationService,
        document_service: DocumentManagementService,
        tigerbeetle_client: Optional[Any] = None
    ):
        self.db = db
        self.credit_risk_service = credit_risk_service
        self.financial_analysis_service = financial_analysis_service
        self.notification_service = notification_service
        self.document_service = document_service
        self.tigerbeetle_client = tigerbeetle_client
        self.logger = logger.bind(service="loan_service")

    async def create_loan_application(
        self,
        user_id: str,
        account_id: str,
        loan_type: LoanType,
        amount: Decimal,
        purpose: str,
        term_months: int,
        employment_info: Dict[str, Any],
        income_info: Dict[str, Any],
        additional_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a new loan application with database persistence
        """
        self.logger.info(
            "Creating loan application",
            user_id=user_id,
            loan_type=loan_type,
            amount=float(amount)
        )

        loan_id = f"LOAN-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"

        validation_result = await self._validate_loan_parameters(
            loan_type, amount, term_months
        )
        if not validation_result["valid"]:
            return {
                "success": False,
                "loan_id": None,
                "error": validation_result["error"]
            }

        interest_rate = self._get_base_interest_rate(loan_type)

        try:
            loan_application = LoanApplication(
                loan_id=loan_id,
                user_id=uuid.UUID(user_id),
                account_id=uuid.UUID(account_id) if account_id else None,
                loan_type=loan_type.value if isinstance(loan_type, LoanType) else loan_type,
                amount=amount,
                currency="USD",
                interest_rate=interest_rate,
                term_months=term_months,
                purpose=purpose,
                status=LoanStatus.DRAFT.value,
                employment_info=employment_info,
                income_info=income_info,
                additional_info=additional_info or {},
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            self.db.add(loan_application)
            await self.db.commit()
            await self.db.refresh(loan_application)

            self.logger.info(
                "Loan application created and saved to database",
                loan_id=loan_id,
                status=LoanStatus.DRAFT.value
            )

            return {
                "success": True,
                "loan_id": loan_id,
                "status": LoanStatus.DRAFT.value,
                "message": "Loan application created successfully",
                "application": {
                    "loan_id": loan_id,
                    "user_id": user_id,
                    "loan_type": loan_type.value if isinstance(loan_type, LoanType) else loan_type,
                    "amount": float(amount),
                    "term_months": term_months,
                    "interest_rate": float(interest_rate),
                    "status": LoanStatus.DRAFT.value,
                    "created_at": loan_application.created_at.isoformat()
                }
            }

        except Exception as e:
            await self.db.rollback()
            self.logger.error(f"Error creating loan application: {str(e)}")
            return {
                "success": False,
                "loan_id": None,
                "error": str(e)
            }

    async def submit_loan_application(
        self,
        loan_id: str,
        documents: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Submit loan application for review with database persistence
        """
        self.logger.info("Submitting loan application", loan_id=loan_id)

        try:
            result = await self.db.execute(
                select(LoanApplication).where(LoanApplication.loan_id == loan_id)
            )
            loan_app = result.scalar_one_or_none()

            if not loan_app:
                return {
                    "success": False,
                    "error": f"Loan application not found: {loan_id}"
                }

            if loan_app.status != LoanStatus.DRAFT.value:
                return {
                    "success": False,
                    "error": f"Loan application cannot be submitted. Current status: {loan_app.status}"
                }

            document_results = []
            for doc in documents:
                doc_result = await self.document_service.upload_document(
                    user_id=doc.get("user_id"),
                    document_type=doc.get("type"),
                    file_data=doc.get("file_data"),
                    metadata={"loan_id": loan_id}
                )
                document_results.append(doc_result)

            loan_app.status = LoanStatus.SUBMITTED.value
            loan_app.documents = documents
            loan_app.submitted_at = datetime.utcnow()
            loan_app.updated_at = datetime.utcnow()

            await self.db.commit()
            await self.db.refresh(loan_app)

            self.logger.info(
                "Loan application submitted and saved to database",
                loan_id=loan_id,
                documents_count=len(documents)
            )

            return {
                "success": True,
                "loan_id": loan_id,
                "status": LoanStatus.SUBMITTED.value,
                "documents": document_results,
                "submitted_at": loan_app.submitted_at.isoformat()
            }

        except Exception as e:
            await self.db.rollback()
            self.logger.error(f"Error submitting loan application: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def assess_loan_application(
        self,
        loan_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """
        Assess loan application using credit risk and financial analysis
        Returns pre-approval decision with database persistence
        """
        self.logger.info("Assessing loan application", loan_id=loan_id)

        try:
            result = await self.db.execute(
                select(LoanApplication).where(LoanApplication.loan_id == loan_id)
            )
            loan_app = result.scalar_one_or_none()

            if not loan_app:
                return {
                    "success": False,
                    "error": f"Loan application not found: {loan_id}"
                }

            credit_assessment = await self.credit_risk_service.assess_credit_risk(
                user_id=user_id,
                loan_amount=float(loan_app.amount),
                loan_term=loan_app.term_months
            )

            credit_score = credit_assessment.get("credit_score", 0)
            risk_level = credit_assessment.get("risk_level", "high")

            annual_income = loan_app.income_info.get("annual_income", 0) if loan_app.income_info else 0
            financial_analysis = await self.financial_analysis_service.analyze_loan_affordability(
                user_id=user_id,
                loan_amount=float(loan_app.amount),
                monthly_income=annual_income / 12
            )

            affordability_score = financial_analysis.get("affordability_score", 0)
            debt_to_income_ratio = financial_analysis.get("debt_to_income_ratio", 100)

            interest_rate = self._calculate_interest_rate(
                credit_score=credit_score,
                risk_level=risk_level,
                loan_type=LoanType(loan_app.loan_type)
            )

            pre_approval_decision = self._make_pre_approval_decision(
                credit_score=credit_score,
                risk_level=risk_level,
                affordability_score=affordability_score,
                debt_to_income_ratio=debt_to_income_ratio
            )

            monthly_payment = self._calculate_monthly_payment(
                principal=float(loan_app.amount),
                annual_rate=interest_rate,
                term_months=loan_app.term_months
            )

            total_interest = (monthly_payment * loan_app.term_months) - float(loan_app.amount)
            total_repayment = float(loan_app.amount) + total_interest

            assessment_result = {
                "loan_id": loan_id,
                "pre_approved": pre_approval_decision["approved"],
                "decision_reason": pre_approval_decision["reason"],
                "credit_score": credit_score,
                "risk_level": risk_level,
                "affordability_score": affordability_score,
                "debt_to_income_ratio": debt_to_income_ratio,
                "interest_rate": interest_rate,
                "monthly_payment": round(monthly_payment, 2),
                "total_interest": round(total_interest, 2),
                "total_repayment": round(total_repayment, 2),
                "assessed_at": datetime.utcnow().isoformat()
            }

            new_status = LoanStatus.PRE_APPROVED.value if pre_approval_decision["approved"] else LoanStatus.UNDER_REVIEW.value
            
            loan_app.status = new_status
            loan_app.interest_rate = Decimal(str(interest_rate))
            loan_app.assessment_result = assessment_result
            loan_app.credit_score = credit_score
            loan_app.risk_level = risk_level
            loan_app.updated_at = datetime.utcnow()

            await self.db.commit()
            await self.db.refresh(loan_app)

            self.logger.info(
                "Loan assessment completed and saved to database",
                loan_id=loan_id,
                pre_approved=pre_approval_decision["approved"],
                interest_rate=interest_rate
            )

            return {
                "success": True,
                **assessment_result
            }

        except Exception as e:
            await self.db.rollback()
            self.logger.error(f"Error assessing loan application: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def approve_loan(
        self,
        loan_id: str,
        approved_by: str,
        approved_amount: Optional[Decimal] = None,
        approved_rate: Optional[Decimal] = None,
        approved_term: Optional[int] = None,
        approval_notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Final loan approval by loan officer with database persistence
        """
        self.logger.info("Approving loan", loan_id=loan_id, approved_by=approved_by)

        try:
            result = await self.db.execute(
                select(LoanApplication).where(LoanApplication.loan_id == loan_id)
            )
            loan_app = result.scalar_one_or_none()

            if not loan_app:
                return {
                    "success": False,
                    "error": f"Loan application not found: {loan_id}"
                }

            if loan_app.status not in [LoanStatus.SUBMITTED.value, LoanStatus.UNDER_REVIEW.value, LoanStatus.PRE_APPROVED.value]:
                return {
                    "success": False,
                    "error": f"Loan application cannot be approved. Current status: {loan_app.status}"
                }

            loan_app.status = LoanStatus.APPROVED.value
            loan_app.approved_by = uuid.UUID(approved_by)
            loan_app.approved_at = datetime.utcnow()
            loan_app.approval_notes = approval_notes
            loan_app.approved_amount = approved_amount or loan_app.amount
            loan_app.approved_rate = approved_rate or loan_app.interest_rate
            loan_app.approved_term = approved_term or loan_app.term_months
            loan_app.updated_at = datetime.utcnow()

            await self.db.commit()
            await self.db.refresh(loan_app)

            await self.notification_service.send_notification(
                user_id=str(loan_app.user_id),
                notification_type="loan_approved",
                title="Loan Approved!",
                message=f"Your loan application {loan_id} has been approved for ${float(loan_app.approved_amount):,.2f}.",
                channels=["email", "push", "sms"]
            )

            self.logger.info("Loan approved and saved to database", loan_id=loan_id)

            return {
                "success": True,
                "loan_id": loan_id,
                "status": LoanStatus.APPROVED.value,
                "approved_by": approved_by,
                "approved_amount": float(loan_app.approved_amount),
                "approved_rate": float(loan_app.approved_rate),
                "approved_term": loan_app.approved_term,
                "approved_at": loan_app.approved_at.isoformat()
            }

        except Exception as e:
            await self.db.rollback()
            self.logger.error(f"Error approving loan: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def disburse_loan(
        self,
        loan_id: str,
        disbursement_account_id: str,
        disbursement_method: str = "bank_transfer",
        account_number: Optional[str] = None,
        bank_code: Optional[str] = None,
        account_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Disburse approved loan to customer account with TigerBeetle integration
        """
        self.logger.info(
            "Disbursing loan",
            loan_id=loan_id,
            account_id=disbursement_account_id
        )

        try:
            result = await self.db.execute(
                select(LoanApplication).where(LoanApplication.loan_id == loan_id)
            )
            loan_app = result.scalar_one_or_none()

            if not loan_app:
                return {
                    "success": False,
                    "error": f"Loan application not found: {loan_id}"
                }

            if loan_app.status != LoanStatus.APPROVED.value:
                return {
                    "success": False,
                    "error": f"Loan must be approved before disbursement. Current status: {loan_app.status}"
                }

            disbursement_id = f"DISB-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
            loan_amount = float(loan_app.approved_amount or loan_app.amount)

            disbursement = LoanDisbursement(
                disbursement_id=disbursement_id,
                loan_application_id=loan_app.id,
                amount=loan_app.approved_amount or loan_app.amount,
                currency=loan_app.currency or "USD",
                account_id=uuid.UUID(disbursement_account_id),
                account_number=account_number,
                bank_code=bank_code,
                account_name=account_name,
                method=disbursement_method,
                status=DisbursementStatus.PENDING.value,
                created_at=datetime.utcnow()
            )

            self.db.add(disbursement)

            if self.tigerbeetle_client:
                try:
                    transfer_result = await self._execute_tigerbeetle_transfer(
                        from_account="LOAN_POOL_ACCOUNT",
                        to_account=disbursement_account_id,
                        amount=loan_amount,
                        reference=disbursement_id
                    )
                    if transfer_result["success"]:
                        disbursement.status = DisbursementStatus.COMPLETED.value
                        disbursement.transaction_id = transfer_result.get("transaction_id")
                        disbursement.completed_at = datetime.utcnow()
                    else:
                        disbursement.status = DisbursementStatus.FAILED.value
                        disbursement.failure_reason = transfer_result.get("error")
                except Exception as tb_error:
                    self.logger.error(f"TigerBeetle transfer failed: {str(tb_error)}")
                    disbursement.status = DisbursementStatus.PROCESSING.value
            else:
                disbursement.status = DisbursementStatus.PROCESSING.value

            loan_app.status = LoanStatus.DISBURSED.value
            loan_app.disbursement_id = disbursement_id
            loan_app.disbursed_at = datetime.utcnow()
            loan_app.updated_at = datetime.utcnow()

            await self.db.commit()
            await self.db.refresh(disbursement)
            await self.db.refresh(loan_app)

            repayment_schedule = await self._create_repayment_schedule(
                loan_id=loan_id,
                loan_application_id=loan_app.id,
                principal=loan_amount,
                interest_rate=float(loan_app.approved_rate or loan_app.interest_rate),
                term_months=loan_app.approved_term or loan_app.term_months,
                start_date=datetime.utcnow()
            )

            await self.notification_service.send_notification(
                user_id=str(loan_app.user_id),
                notification_type="loan_disbursed",
                title="Loan Disbursed",
                message=f"Your loan of ${loan_amount:,.2f} has been disbursed to your account.",
                channels=["email", "push", "sms"]
            )

            self.logger.info(
                "Loan disbursed successfully and saved to database",
                loan_id=loan_id,
                disbursement_id=disbursement_id,
                amount=loan_amount
            )

            return {
                "success": True,
                "loan_id": loan_id,
                "disbursement_id": disbursement_id,
                "amount": loan_amount,
                "status": LoanStatus.DISBURSED.value,
                "disbursement_status": disbursement.status,
                "repayment_schedule": repayment_schedule[:3]
            }

        except Exception as e:
            await self.db.rollback()
            self.logger.error(f"Error disbursing loan: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def reject_loan(
        self,
        loan_id: str,
        rejected_by: str,
        rejection_reason: str
    ) -> Dict[str, Any]:
        """
        Reject loan application with database persistence
        """
        self.logger.info("Rejecting loan", loan_id=loan_id, reason=rejection_reason)

        try:
            result = await self.db.execute(
                select(LoanApplication).where(LoanApplication.loan_id == loan_id)
            )
            loan_app = result.scalar_one_or_none()

            if not loan_app:
                return {
                    "success": False,
                    "error": f"Loan application not found: {loan_id}"
                }

            loan_app.status = LoanStatus.REJECTED.value
            loan_app.rejected_by = uuid.UUID(rejected_by)
            loan_app.rejected_at = datetime.utcnow()
            loan_app.rejection_reason = rejection_reason
            loan_app.updated_at = datetime.utcnow()

            await self.db.commit()
            await self.db.refresh(loan_app)

            await self.notification_service.send_notification(
                user_id=str(loan_app.user_id),
                notification_type="loan_rejected",
                title="Loan Application Update",
                message=f"Your loan application has been reviewed. Reason: {rejection_reason}",
                channels=["email", "push"]
            )

            self.logger.info("Loan rejected and saved to database", loan_id=loan_id)

            return {
                "success": True,
                "loan_id": loan_id,
                "status": LoanStatus.REJECTED.value,
                "rejected_by": rejected_by,
                "rejection_reason": rejection_reason,
                "rejected_at": loan_app.rejected_at.isoformat()
            }

        except Exception as e:
            await self.db.rollback()
            self.logger.error(f"Error rejecting loan: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def get_loan_details(self, loan_id: str) -> Dict[str, Any]:
        """
        Get complete loan details including repayment schedule from database
        """
        try:
            result = await self.db.execute(
                select(LoanApplication)
                .options(selectinload(LoanApplication.repayment_schedules))
                .where(LoanApplication.loan_id == loan_id)
            )
            loan_app = result.scalar_one_or_none()

            if not loan_app:
                return {
                    "success": False,
                    "error": f"Loan application not found: {loan_id}"
                }

            outstanding_balance = await self._calculate_outstanding_balance(loan_app)
            next_payment = await self._get_next_payment(loan_app)

            return {
                "success": True,
                "loan_id": loan_id,
                "user_id": str(loan_app.user_id),
                "loan_type": loan_app.loan_type,
                "status": loan_app.status,
                "amount": float(loan_app.amount),
                "approved_amount": float(loan_app.approved_amount) if loan_app.approved_amount else None,
                "interest_rate": float(loan_app.interest_rate) if loan_app.interest_rate else None,
                "term_months": loan_app.term_months,
                "purpose": loan_app.purpose,
                "monthly_payment": self._calculate_monthly_payment(
                    float(loan_app.approved_amount or loan_app.amount),
                    float(loan_app.approved_rate or loan_app.interest_rate or 8.5),
                    loan_app.approved_term or loan_app.term_months
                ),
                "outstanding_balance": outstanding_balance,
                "next_payment_date": next_payment.get("due_date") if next_payment else None,
                "next_payment_amount": next_payment.get("amount") if next_payment else None,
                "created_at": loan_app.created_at.isoformat() if loan_app.created_at else None,
                "approved_at": loan_app.approved_at.isoformat() if loan_app.approved_at else None,
                "disbursed_at": loan_app.disbursed_at.isoformat() if loan_app.disbursed_at else None
            }

        except Exception as e:
            self.logger.error(f"Error fetching loan details: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def make_loan_payment(
        self,
        loan_id: str,
        payment_amount: Decimal,
        payment_method: str = "bank_transfer",
        source_account_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process loan repayment with TigerBeetle integration
        """
        self.logger.info(
            "Processing loan payment",
            loan_id=loan_id,
            amount=float(payment_amount)
        )

        try:
            result = await self.db.execute(
                select(LoanApplication)
                .options(selectinload(LoanApplication.repayment_schedules))
                .where(LoanApplication.loan_id == loan_id)
            )
            loan_app = result.scalar_one_or_none()

            if not loan_app:
                return {
                    "success": False,
                    "error": f"Loan application not found: {loan_id}"
                }

            payment_id = f"PAY-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"

            if self.tigerbeetle_client:
                try:
                    transfer_result = await self._execute_tigerbeetle_transfer(
                        from_account=source_account_id or str(loan_app.account_id),
                        to_account="LOAN_REPAYMENT_ACCOUNT",
                        amount=float(payment_amount),
                        reference=payment_id
                    )
                    if not transfer_result["success"]:
                        return {
                            "success": False,
                            "error": f"Payment transfer failed: {transfer_result.get('error')}"
                        }
                except Exception as tb_error:
                    self.logger.error(f"TigerBeetle payment failed: {str(tb_error)}")

            pending_schedules = [
                s for s in loan_app.repayment_schedules 
                if s.status in [RepaymentStatus.PENDING.value, RepaymentStatus.OVERDUE.value]
            ]
            
            remaining_payment = float(payment_amount)
            updated_schedules = []

            for schedule in sorted(pending_schedules, key=lambda x: x.installment_number):
                if remaining_payment <= 0:
                    break
                
                schedule_amount = float(schedule.total_amount - (schedule.paid_amount or Decimal("0")))
                
                if remaining_payment >= schedule_amount:
                    schedule.paid_amount = schedule.total_amount
                    schedule.status = RepaymentStatus.PAID.value
                    schedule.paid_at = datetime.utcnow()
                    remaining_payment -= schedule_amount
                else:
                    schedule.paid_amount = (schedule.paid_amount or Decimal("0")) + Decimal(str(remaining_payment))
                    schedule.status = RepaymentStatus.PARTIAL.value
                    remaining_payment = 0
                
                updated_schedules.append(schedule.installment_number)

            new_balance = await self._calculate_outstanding_balance(loan_app)

            if new_balance <= 0:
                loan_app.status = LoanStatus.PAID_OFF.value
                loan_app.paid_off_at = datetime.utcnow()

            loan_app.updated_at = datetime.utcnow()

            await self.db.commit()

            self.logger.info(
                "Loan payment processed and saved to database",
                payment_id=payment_id,
                updated_schedules=updated_schedules
            )

            return {
                "success": True,
                "payment_id": payment_id,
                "loan_id": loan_id,
                "amount": float(payment_amount),
                "new_balance": new_balance,
                "status": "completed",
                "updated_installments": updated_schedules,
                "loan_status": loan_app.status
            }

        except Exception as e:
            await self.db.rollback()
            self.logger.error(f"Error processing loan payment: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    async def get_user_loans(
        self,
        user_id: str,
        status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get all loans for a user from database
        """
        try:
            query = select(LoanApplication).where(
                LoanApplication.user_id == uuid.UUID(user_id)
            )

            if status:
                query = query.where(LoanApplication.status == status)

            result = await self.db.execute(
                query.order_by(LoanApplication.created_at.desc())
            )
            loans = result.scalars().all()

            return {
                "success": True,
                "loans": [
                    {
                        "loan_id": loan.loan_id,
                        "loan_type": loan.loan_type,
                        "amount": float(loan.amount),
                        "status": loan.status,
                        "interest_rate": float(loan.interest_rate) if loan.interest_rate else None,
                        "term_months": loan.term_months,
                        "created_at": loan.created_at.isoformat() if loan.created_at else None
                    }
                    for loan in loans
                ],
                "total": len(loans)
            }

        except Exception as e:
            self.logger.error(f"Error fetching user loans: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }

    def _get_base_interest_rate(self, loan_type: LoanType) -> Decimal:
        """Get base interest rate for loan type"""
        rates = {
            LoanType.PERSONAL: Decimal("12.00"),
            LoanType.BUSINESS: Decimal("10.00"),
            LoanType.AUTO: Decimal("8.00"),
            LoanType.MORTGAGE: Decimal("6.50"),
            LoanType.STUDENT: Decimal("5.50"),
            LoanType.EDUCATION: Decimal("5.50"),
            LoanType.PAYDAY: Decimal("20.00"),
        }
        return rates.get(loan_type, Decimal("12.00"))

    async def _validate_loan_parameters(
        self,
        loan_type: LoanType,
        amount: Decimal,
        term_months: int
    ) -> Dict[str, Any]:
        """Validate loan parameters against business rules"""
        limits = {
            LoanType.PERSONAL: {"min": 1000, "max": 100000},
            LoanType.BUSINESS: {"min": 10000, "max": 1000000},
            LoanType.AUTO: {"min": 5000, "max": 150000},
            LoanType.MORTGAGE: {"min": 50000, "max": 5000000},
            LoanType.STUDENT: {"min": 1000, "max": 50000},
            LoanType.EDUCATION: {"min": 1000, "max": 50000},
            LoanType.PAYDAY: {"min": 100, "max": 5000}
        }

        limit = limits.get(loan_type)
        if not limit:
            return {"valid": False, "error": "Invalid loan type"}

        if float(amount) < limit["min"] or float(amount) > limit["max"]:
            return {
                "valid": False,
                "error": f"Loan amount must be between ${limit['min']:,} and ${limit['max']:,}"
            }

        if term_months < 6 or term_months > 360:
            return {
                "valid": False,
                "error": "Loan term must be between 6 and 360 months"
            }

        return {"valid": True}

    def _calculate_interest_rate(
        self,
        credit_score: int,
        risk_level: str,
        loan_type: LoanType
    ) -> float:
        """Calculate interest rate based on credit score and risk level"""
        base_rates = {
            LoanType.PERSONAL: 8.0,
            LoanType.BUSINESS: 7.5,
            LoanType.AUTO: 6.5,
            LoanType.MORTGAGE: 5.5,
            LoanType.STUDENT: 5.0,
            LoanType.EDUCATION: 5.0,
            LoanType.PAYDAY: 15.0
        }

        base_rate = base_rates.get(loan_type, 8.0)

        if credit_score >= 750:
            rate_adjustment = -1.5
        elif credit_score >= 700:
            rate_adjustment = -0.5
        elif credit_score >= 650:
            rate_adjustment = 0.5
        elif credit_score >= 600:
            rate_adjustment = 1.5
        else:
            rate_adjustment = 3.0

        risk_adjustments = {
            "low": -0.5,
            "medium": 0.0,
            "high": 1.0,
            "very_high": 2.5
        }

        risk_adjustment = risk_adjustments.get(risk_level, 1.0)

        final_rate = base_rate + rate_adjustment + risk_adjustment
        return max(4.0, min(final_rate, 25.0))

    def _make_pre_approval_decision(
        self,
        credit_score: int,
        risk_level: str,
        affordability_score: float,
        debt_to_income_ratio: float
    ) -> Dict[str, Any]:
        """Make pre-approval decision based on multiple factors"""
        if credit_score < 580:
            return {
                "approved": False,
                "reason": "Credit score below minimum threshold (580)"
            }

        if debt_to_income_ratio > 43:
            return {
                "approved": False,
                "reason": "Debt-to-income ratio exceeds maximum (43%)"
            }

        if risk_level == "very_high":
            return {
                "approved": False,
                "reason": "Risk level too high for automatic approval"
            }

        if affordability_score < 0.5:
            return {
                "approved": False,
                "reason": "Affordability score below threshold"
            }

        return {
            "approved": True,
            "reason": "Meets all pre-approval criteria"
        }

    def _calculate_monthly_payment(
        self,
        principal: float,
        annual_rate: float,
        term_months: int
    ) -> float:
        """Calculate monthly payment using amortization formula"""
        monthly_rate = annual_rate / 100 / 12
        
        if monthly_rate == 0:
            return principal / term_months

        monthly_payment = principal * (
            monthly_rate * (1 + monthly_rate) ** term_months
        ) / (
            (1 + monthly_rate) ** term_months - 1
        )

        return round(monthly_payment, 2)

    async def _create_repayment_schedule(
        self,
        loan_id: str,
        loan_application_id: int,
        principal: float,
        interest_rate: float,
        term_months: int,
        start_date: datetime
    ) -> List[Dict[str, Any]]:
        """Create complete loan repayment schedule with database persistence"""
        monthly_payment = self._calculate_monthly_payment(
            principal, interest_rate, term_months
        )

        schedule = []
        balance = principal
        payment_date = start_date

        for month in range(1, term_months + 1):
            payment_date = payment_date + timedelta(days=30)
            
            interest_payment = balance * (interest_rate / 100 / 12)
            principal_payment = monthly_payment - interest_payment
            balance = balance - principal_payment

            repayment = RepaymentSchedule(
                loan_application_id=loan_application_id,
                installment_number=month,
                due_date=payment_date,
                principal_amount=Decimal(str(round(principal_payment, 2))),
                interest_amount=Decimal(str(round(interest_payment, 2))),
                total_amount=Decimal(str(round(monthly_payment, 2))),
                outstanding_amount=Decimal(str(round(max(0, balance), 2))),
                status=RepaymentStatus.PENDING.value
            )

            self.db.add(repayment)

            schedule.append({
                "payment_number": month,
                "payment_date": payment_date.isoformat(),
                "payment_amount": round(monthly_payment, 2),
                "principal_amount": round(principal_payment, 2),
                "interest_amount": round(interest_payment, 2),
                "remaining_balance": round(max(0, balance), 2),
                "status": RepaymentStatus.PENDING.value
            })

        await self.db.commit()

        self.logger.info(
            "Repayment schedule created and saved to database",
            loan_id=loan_id,
            installments=term_months
        )

        return schedule

    async def _calculate_outstanding_balance(self, loan_app: LoanApplication) -> float:
        """Calculate outstanding balance for a loan"""
        if not loan_app.repayment_schedules:
            return float(loan_app.approved_amount or loan_app.amount)
        
        total_paid = sum(
            float(s.paid_amount or 0) for s in loan_app.repayment_schedules
        )
        total_due = sum(
            float(s.total_amount) for s in loan_app.repayment_schedules
        )
        
        return max(0, total_due - total_paid)

    async def _get_next_payment(self, loan_app: LoanApplication) -> Optional[Dict[str, Any]]:
        """Get next pending payment for a loan"""
        if not loan_app.repayment_schedules:
            return None
        
        pending = [
            s for s in loan_app.repayment_schedules 
            if s.status in [RepaymentStatus.PENDING.value, RepaymentStatus.OVERDUE.value, RepaymentStatus.PARTIAL.value]
        ]
        
        if not pending:
            return None
        
        next_payment = min(pending, key=lambda x: x.installment_number)
        remaining = float(next_payment.total_amount) - float(next_payment.paid_amount or 0)
        
        return {
            "installment_number": next_payment.installment_number,
            "due_date": next_payment.due_date.isoformat() if next_payment.due_date else None,
            "amount": remaining,
            "status": next_payment.status
        }

    async def _execute_tigerbeetle_transfer(
        self,
        from_account: str,
        to_account: str,
        amount: float,
        reference: str
    ) -> Dict[str, Any]:
        """Execute transfer through TigerBeetle ledger"""
        if not self.tigerbeetle_client:
            return {
                "success": False,
                "error": "TigerBeetle client not configured"
            }
        
        try:
            transfer_id = str(uuid.uuid4())
            
            result = await self.tigerbeetle_client.create_transfer(
                id=transfer_id,
                debit_account_id=from_account,
                credit_account_id=to_account,
                amount=int(amount * 100),
                ledger=1,
                code=1,
                user_data=reference.encode()
            )
            
            return {
                "success": True,
                "transaction_id": transfer_id,
                "result": result
            }
        except Exception as e:
            self.logger.error(f"TigerBeetle transfer error: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
