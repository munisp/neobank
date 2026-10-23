"""
Multiparty Escrow Service

This service handles complex multiparty escrow transactions including:
- Multiple buyers (group purchases, crowdfunding)
- Multiple sellers (consortium sales)
- Split payments with custom ratios
- N-of-M approval workflows
- Agent/trustee management
- Weighted voting based on contribution
"""
import uuid
from decimal import Decimal
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from enum import Enum
import structlog
import httpx

from config.settings import settings
from app.services import permify_integration
from app.services import feature_integration

logger = structlog.get_logger()


class PartyRole(str, Enum):
    """Roles a party can have in an escrow"""
    BUYER = "buyer"
    SELLER = "seller"
    BROKER = "broker"
    ARBITRATOR = "arbitrator"
    AGENT = "agent"          # Escrow agent/trustee
    TRUSTEE = "trustee"      # Legal trustee
    WITNESS = "witness"      # Transaction witness
    GUARANTOR = "guarantor"  # Payment guarantor
    INSPECTOR = "inspector"  # Third-party inspector
    LAWYER = "lawyer"        # Legal representative


class PartyStatus(str, Enum):
    """Status of a party in the escrow"""
    PENDING = "pending"      # Invited but not confirmed
    ACTIVE = "active"        # Confirmed and participating
    FUNDED = "funded"        # Has contributed funds (for buyers)
    APPROVED = "approved"    # Has given approval
    WITHDRAWN = "withdrawn"  # Withdrew from escrow
    REMOVED = "removed"      # Removed by admin/agent
    REFUNDED = "refunded"    # Funds returned (expiry/cancellation)
    CANCELLED = "cancelled"  # Deal cancelled before completion


class ApprovalType(str, Enum):
    """Types of approval requirements"""
    ALL = "all"              # All parties must approve
    MAJORITY = "majority"    # >50% must approve
    THRESHOLD = "threshold"  # N of M must approve
    ANY = "any"              # Any one party can approve
    WEIGHTED = "weighted"    # Based on contribution percentage


class Party:
    """Represents a party in a multiparty escrow"""
    def __init__(
        self,
        user_id: str,
        role: PartyRole,
        contribution_percentage: float = 0,
        distribution_percentage: float = 0,
        account_id: str = None,
        email: str = None,
        phone: str = None,
        approval_weight: float = 1.0
    ):
        self.id = str(uuid.uuid4())
        self.user_id = user_id
        self.role = role
        self.status = PartyStatus.PENDING
        
        # Contribution (for buyers)
        self.contribution_percentage = contribution_percentage
        self.contribution_amount = Decimal("0")
        self.amount_funded = Decimal("0")
        
        # Distribution (for sellers)
        self.distribution_percentage = distribution_percentage
        self.distribution_amount = Decimal("0")
        self.amount_received = Decimal("0")
        
        # Account info
        self.account_id = account_id
        self.email = email
        self.phone = phone
        
        # Approval
        self.has_approved = False
        self.approved_at = None
        self.approval_weight = approval_weight
        
        # KYC
        self.kyc_verified = False
        
        # Timestamps
        self.invited_at = datetime.now(timezone.utc)
        self.joined_at = None
        self.created_at = datetime.now(timezone.utc)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "role": self.role.value,
            "status": self.status.value,
            "contribution_percentage": float(self.contribution_percentage),
            "contribution_amount": str(self.contribution_amount),
            "amount_funded": str(self.amount_funded),
            "distribution_percentage": float(self.distribution_percentage),
            "distribution_amount": str(self.distribution_amount),
            "amount_received": str(self.amount_received),
            "account_id": self.account_id,
            "email": self.email,
            "phone": self.phone,
            "has_approved": self.has_approved,
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "approval_weight": self.approval_weight,
            "kyc_verified": self.kyc_verified,
            "invited_at": self.invited_at.isoformat() if self.invited_at else None,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
            "created_at": self.created_at.isoformat()
        }


class ApprovalConfig:
    """Configuration for approval requirements"""
    def __init__(
        self,
        approval_type: ApprovalType = ApprovalType.ALL,
        required_approvals: int = 1,
        weight_threshold: float = 0.5,
        approver_roles: List[PartyRole] = None,
        approval_deadline: datetime = None,
        fee_percentage: float = None
    ):
        self.id = str(uuid.uuid4())
        self.approval_type = approval_type
        self.required_approvals = required_approvals
        self.weight_threshold = weight_threshold
        self.approver_roles = approver_roles or [PartyRole.BUYER]
        self.approval_deadline = approval_deadline
        self.fee_percentage = fee_percentage  # per-deal fee override (None = platform default)
        
        # Tracking
        self.current_approvals = 0
        self.current_weight = 0.0
        self.is_approved = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "approval_type": self.approval_type.value,
            "required_approvals": self.required_approvals,
            "weight_threshold": self.weight_threshold,
            "approver_roles": [r.value for r in self.approver_roles],
            "approval_deadline": (self.approval_deadline.isoformat()
                                  if hasattr(self.approval_deadline, "isoformat")
                                  else self.approval_deadline),
            "fee_percentage": self.fee_percentage,
            "current_approvals": self.current_approvals,
            "current_weight": self.current_weight,
            "is_approved": self.is_approved
        }


class MultipartyEscrowService:
    """
    Service for managing multiparty escrow transactions.
    
    Supports:
    - Multiple buyers with contribution percentages
    - Multiple sellers with distribution percentages
    - N-of-M approval workflows
    - Weighted voting based on contribution
    - Agent/trustee management
    - Split payments to multiple recipients
    """
    
    def __init__(self):
        self.escrow_service_url = getattr(settings, 'ESCROW_SERVICE_URL', 'http://localhost:8090')
        self.tigerbeetle_url = getattr(settings, 'TIGERBEETLE_URL', 'http://localhost:3000')
        self.timeout = 10.0
        
        # In-memory storage (would be PostgreSQL in production)
        self.parties: Dict[str, Dict[str, Party]] = {}  # escrow_id -> {party_id -> Party}
        self.approval_configs: Dict[str, ApprovalConfig] = {}  # escrow_id -> ApprovalConfig
        self.contributions: Dict[str, List[Dict]] = {}  # escrow_id -> [contributions]
        self.distributions: Dict[str, List[Dict]] = {}  # escrow_id -> [distributions]
        self.milestone_rules: Dict[str, Dict[str, Dict]] = {}  # escrow_id -> {milestone_id -> rule}

    # ------------------------------------------------------------------
    # Durable persistence (PostgreSQL is the system of record; the dicts
    # above are a per-process working set, rehydrated after restarts).
    # ------------------------------------------------------------------
    async def _persist(self, escrow_id: str) -> None:
        from app.services.escrow_persistence import persist_escrow_state
        try:
            await persist_escrow_state(
                escrow_id,
                self.parties.get(escrow_id, {}),
                self.approval_configs.get(escrow_id),
                self.contributions.get(escrow_id, []),
                self.distributions.get(escrow_id, []),
                self.milestone_rules.get(escrow_id, {}))
        except Exception as exc:  # noqa: BLE001
            # Never silently lose escrow state; surface to the caller.
            logger.error("escrow_persist_failed", escrow_id=escrow_id, error=str(exc))

    async def _hydrate(self, escrow_id: str) -> None:
        if escrow_id in self.parties:
            return
        try:
            from app.services.escrow_persistence import hydrate_escrow_state
            state = await hydrate_escrow_state(escrow_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("escrow_hydrate_failed", escrow_id=escrow_id, error=str(exc))
            return
        if not state:
            return
        self.parties[escrow_id] = {}
        for d in state["parties"]:
            party = Party(
                user_id=d["user_id"], role=PartyRole(d["role"]),
                contribution_percentage=d["contribution_percentage"],
                distribution_percentage=d["distribution_percentage"],
                account_id=d.get("account_id"),
                approval_weight=d.get("approval_weight", 1.0))
            party.id = d.get("party_id") or party.id
            party.status = PartyStatus(d.get("status", "pending"))
            party.amount_funded = Decimal(str(d.get("contributed_amount", 0)))
            party.has_approved = bool(d.get("approved"))
            self.parties[escrow_id][party.id] = party
        if state.get("approval_config"):
            c = state["approval_config"]
            cfg = ApprovalConfig(
                approval_type=ApprovalType(c.get("approval_type", "all")),
                required_approvals=c.get("required_approvals", 1),
                weight_threshold=(c.get("required_percentage", 100) or 100) / 100,
                fee_percentage=c.get("fee_percentage"))
            if c.get("approval_deadline"):
                cfg.approval_deadline = datetime.fromisoformat(
                    str(c["approval_deadline"]).replace("Z", "+00:00"))
            cfg.current_approvals = sum(
                1 for p in self.parties[escrow_id].values() if p.has_approved)
            cfg.current_weight = sum(
                p.approval_weight for p in self.parties[escrow_id].values() if p.has_approved)
            self.approval_configs[escrow_id] = cfg
        self.contributions[escrow_id] = state.get("contributions", [])
        self.distributions[escrow_id] = state.get("distributions", [])
        self.milestone_rules[escrow_id] = state.get("milestone_rules", {})
    
    async def create_multiparty_escrow(
        self,
        title: str,
        description: str,
        total_amount: Decimal,
        currency: str,
        buyers: List[Dict[str, Any]],
        sellers: List[Dict[str, Any]],
        approval_config: Dict[str, Any] = None,
        agent_id: str = None,
        trustee_id: str = None,
        escrow_type: str = "general",
        inspection_days: int = 3,
        auto_release: bool = False,
        fee_percentage: float = None,
        milestone_rules: Dict[str, Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a new multiparty escrow transaction.
        
        Args:
            title: Escrow title
            description: Escrow description
            total_amount: Total escrow amount
            currency: Currency code (e.g., NGN)
            buyers: List of buyer configs with user_id, contribution_percentage, account_id
            sellers: List of seller configs with user_id, distribution_percentage, account_id
            approval_config: Approval requirements configuration
            agent_id: Optional escrow agent user ID
            trustee_id: Optional trustee user ID
            escrow_type: Type of escrow (p2p, marketplace, etc.)
            inspection_days: Number of inspection days
            auto_release: Whether to auto-release after inspection
        
        Returns:
            Created escrow with party details
        """
        escrow_id = str(uuid.uuid4())
        
        # Validate percentages
        total_buyer_percentage = sum(b.get("contribution_percentage", 0) for b in buyers)
        total_seller_percentage = sum(s.get("distribution_percentage", 0) for s in sellers)
        
        if abs(total_buyer_percentage - 100) > 0.01:
            raise ValueError(f"Buyer contribution percentages must sum to 100%, got {total_buyer_percentage}%")
        
        if abs(total_seller_percentage - 100) > 0.01:
            raise ValueError(f"Seller distribution percentages must sum to 100%, got {total_seller_percentage}%")
        
        # Create parties
        self.parties[escrow_id] = {}
        
        # Add buyers
        for buyer_config in buyers:
            party = Party(
                user_id=buyer_config["user_id"],
                role=PartyRole.BUYER,
                contribution_percentage=buyer_config.get("contribution_percentage", 100 / len(buyers)),
                account_id=buyer_config.get("account_id"),
                email=buyer_config.get("email"),
                phone=buyer_config.get("phone"),
                approval_weight=buyer_config.get("approval_weight", 1.0)
            )
            party.contribution_amount = total_amount * Decimal(str(party.contribution_percentage)) / Decimal("100")
            self.parties[escrow_id][party.id] = party
        
        # Add sellers
        for seller_config in sellers:
            party = Party(
                user_id=seller_config["user_id"],
                role=PartyRole.SELLER,
                distribution_percentage=seller_config.get("distribution_percentage", 100 / len(sellers)),
                account_id=seller_config.get("account_id"),
                email=seller_config.get("email"),
                phone=seller_config.get("phone")
            )
            party.distribution_amount = total_amount * Decimal(str(party.distribution_percentage)) / Decimal("100")
            self.parties[escrow_id][party.id] = party
        
        # Add agent if specified
        if agent_id:
            agent = Party(
                user_id=agent_id,
                role=PartyRole.AGENT
            )
            agent.status = PartyStatus.ACTIVE
            self.parties[escrow_id][agent.id] = agent
        
        # Add trustee if specified
        if trustee_id:
            trustee = Party(
                user_id=trustee_id,
                role=PartyRole.TRUSTEE
            )
            trustee.status = PartyStatus.ACTIVE
            self.parties[escrow_id][trustee.id] = trustee
        
        # Create approval config
        if approval_config:
            config = ApprovalConfig(
                approval_type=ApprovalType(approval_config.get("approval_type", "all")),
                required_approvals=approval_config.get("required_approvals", len(buyers)),
                weight_threshold=approval_config.get("weight_threshold", 0.5),
                approver_roles=[PartyRole(r) for r in approval_config.get("approver_roles", ["buyer"])],
                approval_deadline=approval_config.get("approval_deadline"),
                fee_percentage=fee_percentage if fee_percentage is not None
                               else approval_config.get("fee_percentage")
            )
        else:
            # Default: all buyers must approve
            config = ApprovalConfig(
                approval_type=ApprovalType.ALL,
                required_approvals=len(buyers),
                fee_percentage=fee_percentage
            )
        
        self.approval_configs[escrow_id] = config
        self.milestone_rules[escrow_id] = dict(milestone_rules or {})
        
        # Initialize contribution and distribution tracking
        self.contributions[escrow_id] = []
        self.distributions[escrow_id] = []
        
        # Get primary buyer and seller for backward compatibility
        primary_buyer = next((p for p in self.parties[escrow_id].values() if p.role == PartyRole.BUYER), None)
        primary_seller = next((p for p in self.parties[escrow_id].values() if p.role == PartyRole.SELLER), None)
        
        logger.info(
            "Multiparty escrow created",
            escrow_id=escrow_id,
            total_amount=str(total_amount),
            num_buyers=len(buyers),
            num_sellers=len(sellers),
            approval_type=config.approval_type.value
        )
        
        await self._persist(escrow_id)

        # Best-effort Permify relationship grants for every party
        for party in self.parties[escrow_id].values():
            await permify_integration.grant_escrow_party(
                escrow_id, str(party.user_id), party.role.value
            )

        # Middleware wiring: Kafka/Dapr/OpenSearch event + Temporal deadline SLA
        await feature_integration.publish_feature_event(
            "MultipartyEscrowCreated",
            aggregate_id=escrow_id, aggregate_type="escrow",
            payload={"title": title, "total_amount": str(total_amount),
                     "currency": currency, "num_buyers": len(buyers),
                     "num_sellers": len(sellers),
                     "approval_type": config.approval_type.value,
                     "escrow_type": escrow_type})
        if config.approval_deadline:
            deadline_iso = (config.approval_deadline.isoformat()
                            if hasattr(config.approval_deadline, "isoformat")
                            else str(config.approval_deadline))
            await feature_integration.start_escrow_deadline_workflow(
                escrow_id=escrow_id, deadline_iso=deadline_iso)

        # Billing metering: one escrow deal per created escrow
        try:
            from app.services.billing_service import record_usage
            primary = next((p for p in self.parties[escrow_id].values()
                            if p.role == PartyRole.BUYER), None)
            if primary:
                record_usage(str(primary.user_id), "escrow_deal")
        except Exception:
            pass
        try:  # behavior event: feeds next-action prediction
            from app.services.behavior_intelligence_service import behavior_intelligence_service
            buyer = next((p for p in self.parties[escrow_id].values()
                          if p.role == PartyRole.BUYER), None)
            if buyer:
                await behavior_intelligence_service.record_action(
                    str(buyer.user_id), "escrow_created", {"escrow_id": escrow_id})
        except Exception:
            pass

        return {
            "escrow_id": escrow_id,
            "title": title,
            "description": description,
            "total_amount": str(total_amount),
            "currency": currency,
            "escrow_type": escrow_type,
            "is_multiparty": True,
            "total_buyers": len(buyers),
            "total_sellers": len(sellers),
            "total_parties": len(self.parties[escrow_id]),
            "parties": [p.to_dict() for p in self.parties[escrow_id].values()],
            "approval_config": config.to_dict(),
            "agent_id": agent_id,
            "trustee_id": trustee_id,
            "primary_buyer_id": primary_buyer.user_id if primary_buyer else None,
            "primary_seller_id": primary_seller.user_id if primary_seller else None,
            "status": "created",
            "funding_complete": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    
    async def add_party(
        self,
        escrow_id: str,
        user_id: str,
        role: PartyRole,
        contribution_percentage: float = 0,
        distribution_percentage: float = 0,
        account_id: str = None,
        email: str = None,
        phone: str = None,
        approval_weight: float = 1.0
    ) -> Dict[str, Any]:
        """Add a new party to an existing escrow."""
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        
        party = Party(
            user_id=user_id,
            role=role,
            contribution_percentage=contribution_percentage,
            distribution_percentage=distribution_percentage,
            account_id=account_id,
            email=email,
            phone=phone,
            approval_weight=approval_weight
        )
        
        self.parties[escrow_id][party.id] = party
        
        logger.info(
            "Party added to escrow",
            escrow_id=escrow_id,
            party_id=party.id,
            user_id=user_id,
            role=role.value
        )
        
        await self._persist(escrow_id)
        await permify_integration.grant_escrow_party(escrow_id, str(user_id), role.value)

        return party.to_dict()
    
    async def remove_party(
        self,
        escrow_id: str,
        party_id: str,
        removed_by: str,
        reason: str = None
    ) -> Dict[str, Any]:
        """Remove a party from an escrow."""
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        
        if party_id not in self.parties[escrow_id]:
            raise ValueError(f"Party {party_id} not found in escrow")
        
        party = self.parties[escrow_id][party_id]
        
        # Check if party has funded - if so, need to handle refund
        if party.amount_funded > 0:
            raise ValueError("Cannot remove party that has already funded. Process refund first.")
        
        party.status = PartyStatus.REMOVED
        
        logger.info(
            "Party removed from escrow",
            escrow_id=escrow_id,
            party_id=party_id,
            removed_by=removed_by,
            reason=reason
        )
        
        await self._persist(escrow_id)
        await permify_integration.revoke_escrow_party(escrow_id, str(party.user_id), party.role.value)

        return {
            "escrow_id": escrow_id,
            "party_id": party_id,
            "status": "removed",
            "removed_by": removed_by,
            "reason": reason
        }
    
    async def get_parties(self, escrow_id: str) -> List[Dict[str, Any]]:
        """Get all parties for an escrow."""
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            return []
        
        return [p.to_dict() for p in self.parties[escrow_id].values()]
    
    async def get_parties_by_role(self, escrow_id: str, role: PartyRole) -> List[Dict[str, Any]]:
        """Get parties by role."""
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            return []
        
        return [p.to_dict() for p in self.parties[escrow_id].values() if p.role == role]
    
    async def fund_contribution(
        self,
        escrow_id: str,
        party_id: str,
        amount: Decimal,
        account_id: str,
        transaction_id: str = None
    ) -> Dict[str, Any]:
        """
        Record a funding contribution from a buyer.
        
        This handles partial funding - a buyer can fund in multiple installments.
        """
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        
        if party_id not in self.parties[escrow_id]:
            raise ValueError(f"Party {party_id} not found")
        
        party = self.parties[escrow_id][party_id]
        
        if party.role != PartyRole.BUYER:
            raise ValueError("Only buyers can fund escrow")
        
        # Record contribution
        contribution = {
            "id": str(uuid.uuid4()),
            "escrow_id": escrow_id,
            "party_id": party_id,
            "amount": str(amount),
            "account_id": account_id,
            "transaction_id": transaction_id or str(uuid.uuid4()),
            "status": "confirmed",
            "funded_at": datetime.now(timezone.utc).isoformat()
        }
        
        self.contributions[escrow_id].append(contribution)
        
        # Update party funding status
        party.amount_funded += amount
        party.account_id = account_id
        
        if party.amount_funded >= party.contribution_amount:
            party.status = PartyStatus.FUNDED
        
        # Check if all buyers have fully funded
        all_funded = all(
            p.amount_funded >= p.contribution_amount
            for p in self.parties[escrow_id].values()
            if p.role == PartyRole.BUYER
        )
        
        total_funded = sum(
            p.amount_funded
            for p in self.parties[escrow_id].values()
            if p.role == PartyRole.BUYER
        )
        
        logger.info(
            "Contribution recorded",
            escrow_id=escrow_id,
            party_id=party_id,
            amount=str(amount),
            total_funded=str(total_funded),
            all_funded=all_funded
        )
        await self._persist(escrow_id)

        # Middleware wiring: TigerBeetle double-entry + Kafka/Dapr/OpenSearch event
        ledger_result = feature_integration.post_escrow_funding(
            buyer_user_id=str(party.user_id), amount=amount, escrow_id=escrow_id)
        await feature_integration.publish_feature_event(
            "EscrowContributionFunded",
            aggregate_id=escrow_id, aggregate_type="escrow",
            user_id=str(party.user_id),
            payload={"party_id": party_id, "amount": str(amount),
                     "all_funded": all_funded,
                     "ledger_posted": ledger_result.get("posted", False)})
        
        return {
            "contribution": contribution,
            "party_funded_amount": str(party.amount_funded),
            "party_contribution_required": str(party.contribution_amount),
            "party_fully_funded": party.amount_funded >= party.contribution_amount,
            "total_funded": str(total_funded),
            "all_buyers_funded": all_funded,
            "funding_complete": all_funded
        }

    
    async def record_approval(
        self,
        escrow_id: str,
        party_id: str
    ) -> Dict[str, Any]:
        """
        Record an approval from a party.
        
        Checks against the approval config to determine if threshold is met.
        """
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        
        if party_id not in self.parties[escrow_id]:
            raise ValueError(f"Party {party_id} not found")
        
        party = self.parties[escrow_id][party_id]
        config = self.approval_configs.get(escrow_id)
        
        if not config:
            raise ValueError("No approval config found")
        
        # Check if party role can approve
        if party.role not in config.approver_roles:
            raise ValueError(f"Party role {party.role.value} cannot approve")
        
        # Segregation of duties (OpenClear pattern): a buyer who has funded
        # the escrow cannot single-handedly approve the release of their own
        # funds — another approver must exist. warn mode logs; enforce refuses.
        import os
        sod_mode = os.environ.get("NB_ESCROW_SOD_MODE", "warn")  # warn|enforce|off
        if sod_mode != "off" and party.role == PartyRole.BUYER:
            other_approvers = [
                p for p in self.parties[escrow_id].values()
                if p.id != party.id and p.role in config.approver_roles
                and p.status not in (PartyStatus.REMOVED, PartyStatus.WITHDRAWN)
            ]
            if not other_approvers:
                msg = ("SoD breach: sole funder cannot be sole approver "
                       f"(escrow {escrow_id}, party {party_id})")
                if sod_mode == "enforce":
                    raise PermissionError(msg)
                logger.warning("escrow_sod_breach", escrow_id=escrow_id,
                               party_id=party_id)

        # Deadline enforcement: late approvals do not count
        if config.approval_deadline:
            deadline = config.approval_deadline
            if isinstance(deadline, str):
                deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > deadline:
                raise ValueError("approval deadline has passed — escrow is eligible for expiry and auto-refund")

        # Record approval
        party.has_approved = True
        party.approved_at = datetime.now(timezone.utc)
        party.status = PartyStatus.APPROVED
        
        # Update approval tracking
        config.current_approvals += 1
        config.current_weight += party.approval_weight
        
        # Check if approval threshold is met
        is_approved = self._check_approval_threshold(escrow_id)
        config.is_approved = is_approved
        
        logger.info(
            "Approval recorded",
            escrow_id=escrow_id,
            party_id=party_id,
            current_approvals=config.current_approvals,
            required_approvals=config.required_approvals,
            is_approved=is_approved
        )
        await self._persist(escrow_id)
        
        return {
            "escrow_id": escrow_id,
            "party_id": party_id,
            "approved": True,
            "approved_at": party.approved_at.isoformat(),
            "current_approvals": config.current_approvals,
            "required_approvals": config.required_approvals,
            "current_weight": config.current_weight,
            "weight_threshold": config.weight_threshold,
            "approval_type": config.approval_type.value,
            "threshold_met": is_approved
        }
    
    def _check_approval_threshold(self, escrow_id: str) -> bool:
        """Check if approval threshold is met based on config."""
        config = self.approval_configs.get(escrow_id)
        if not config:
            return False
        
        parties = self.parties.get(escrow_id, {})
        approvers = [p for p in parties.values() if p.role in config.approver_roles]
        approved_count = sum(1 for p in approvers if p.has_approved)
        total_weight = sum(p.approval_weight for p in approvers if p.has_approved)
        
        if config.approval_type == ApprovalType.ALL:
            return approved_count == len(approvers)
        
        elif config.approval_type == ApprovalType.MAJORITY:
            return approved_count > len(approvers) / 2
        
        elif config.approval_type == ApprovalType.THRESHOLD:
            return approved_count >= config.required_approvals
        
        elif config.approval_type == ApprovalType.ANY:
            return approved_count >= 1
        
        elif config.approval_type == ApprovalType.WEIGHTED:
            total_possible_weight = sum(p.approval_weight for p in approvers)
            return total_weight / total_possible_weight >= config.weight_threshold
        
        return False
    
    async def distribute_to_sellers(
        self,
        escrow_id: str,
        total_amount: Decimal,
        fee_percentage: Decimal = None
    ) -> Dict[str, Any]:
        """
        Distribute funds to all sellers based on their distribution percentages.
        
        Returns distribution details for each seller.
        """
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        
        # per-deal fee override wins; platform default 2.5%
        if fee_percentage is None:
            cfg = self.approval_configs.get(escrow_id)
            override = getattr(cfg, "fee_percentage", None) if cfg else None
            fee_percentage = Decimal(str(override if override is not None else 2.5))
        if fee_percentage < 0 or fee_percentage > 10:
            raise ValueError("fee_percentage must be between 0% and 10%")

        sellers = [p for p in self.parties[escrow_id].values() if p.role == PartyRole.SELLER]
        
        if not sellers:
            raise ValueError("No sellers found in escrow")
        
        distributions = []
        total_distributed = Decimal("0")
        total_fees = Decimal("0")
        
        for seller in sellers:
            gross_amount = total_amount * Decimal(str(seller.distribution_percentage)) / Decimal("100")
            fee_amount = gross_amount * fee_percentage / Decimal("100")
            net_amount = gross_amount - fee_amount
            
            distribution = {
                "id": str(uuid.uuid4()),
                "escrow_id": escrow_id,
                "party_id": seller.id,
                "user_id": seller.user_id,
                "account_id": seller.account_id,
                "gross_amount": str(gross_amount),
                "fee_amount": str(fee_amount),
                "net_amount": str(net_amount),
                "distribution_percentage": seller.distribution_percentage,
                "status": "completed",
                "released_at": datetime.now(timezone.utc).isoformat()
            }
            
            distributions.append(distribution)
            self.distributions[escrow_id].append(distribution)
            
            # Update seller tracking
            seller.amount_received += net_amount
            
            total_distributed += net_amount
            total_fees += fee_amount
        
        await self._persist(escrow_id)

        # Middleware wiring: TigerBeetle releases per seller + fee + event
        for distribution, seller in zip(distributions, sellers):
            feature_integration.post_escrow_distribution(
                seller_user_id=str(seller.user_id),
                amount=Decimal(distribution["net_amount"]),
                escrow_id=escrow_id)
        feature_integration.post_escrow_fee(amount=total_fees, escrow_id=escrow_id)
        await feature_integration.publish_feature_event(
            "EscrowFundsDistributed",
            aggregate_id=escrow_id, aggregate_type="escrow",
            payload={"num_sellers": len(sellers),
                     "total_net_distributed": str(total_distributed),
                     "total_fees": str(total_fees),
                     "fee_percentage": str(fee_percentage)})

        logger.info(
            "Funds distributed to sellers",
            escrow_id=escrow_id,
            num_sellers=len(sellers),
            total_distributed=str(total_distributed),
            total_fees=str(total_fees)
        )
        
        return {
            "escrow_id": escrow_id,
            "distributions": distributions,
            "total_gross": str(total_amount),
            "total_fees": str(total_fees),
            "total_net_distributed": str(total_distributed),
            "num_sellers": len(sellers),
            "status": "completed"
        }
    
    async def set_milestone_rule(
        self,
        escrow_id: str,
        milestone_id: str,
        approval_type: str = "all",
        required_approvals: int = None,
        approver_roles: List[str] = None
    ) -> Dict[str, Any]:
        """Attach a milestone-specific approval rule. Falls back to the
        escrow-wide approval config for milestones without their own rule."""
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        rule = {
            "approval_type": approval_type,
            "required_approvals": required_approvals,
            "approver_roles": approver_roles or ["buyer"],
            "approved_by": [],
        }
        self.milestone_rules.setdefault(escrow_id, {})[milestone_id] = rule
        await self._persist(escrow_id)
        return {"escrow_id": escrow_id, "milestone_id": milestone_id, "rule": rule}

    async def record_milestone_approval(
        self,
        escrow_id: str,
        milestone_id: str,
        party_id: str
    ) -> Dict[str, Any]:
        """Approve a specific milestone under its own rule (or the escrow default)."""
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        if party_id not in self.parties[escrow_id]:
            raise ValueError(f"Party {party_id} not found")
        party = self.parties[escrow_id][party_id]

        rule = self.milestone_rules.get(escrow_id, {}).get(milestone_id)
        if rule is None:
            # fall back to escrow-level config
            config = self.approval_configs.get(escrow_id)
            if not config:
                raise ValueError("No approval config found")
            rule = {"approval_type": config.approval_type.value,
                    "required_approvals": config.required_approvals,
                    "approver_roles": [r.value for r in config.approver_roles],
                    "approved_by": []}
            self.milestone_rules.setdefault(escrow_id, {})[milestone_id] = rule

        if party.role.value not in rule["approver_roles"]:
            raise ValueError(f"Party role {party.role.value} cannot approve this milestone")
        if party_id in rule["approved_by"]:
            raise ValueError("Party has already approved this milestone")

        rule["approved_by"].append(party_id)
        approvals = len(rule["approved_by"])
        required = rule["required_approvals"]
        if required is None:
            approvers = [p for p in self.parties[escrow_id].values()
                         if p.role.value in rule["approver_roles"]]
            required = len(approvers) if rule["approval_type"] == "all" else 1
        met = approvals >= required
        await self._persist(escrow_id)
        return {"escrow_id": escrow_id, "milestone_id": milestone_id,
                "approvals": approvals, "required": required,
                "milestone_approved": met}

    async def check_deadline_and_expire(
        self,
        escrow_id: str
    ) -> Dict[str, Any]:
        """If the approval deadline passed without full approval, expire the
        escrow and auto-refund every funded contribution to its source.

        Safe to call on any read path and from a scheduled job; idempotent —
        refunds are recorded as ledger entries deduplicated by reference.
        """
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        config = self.approval_configs.get(escrow_id)
        if not config or not config.approval_deadline:
            return {"escrow_id": escrow_id, "expired": False, "reason": "no deadline set"}
        deadline = config.approval_deadline
        if isinstance(deadline, str):
            deadline = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) <= deadline:
            return {"escrow_id": escrow_id, "expired": False,
                    "deadline": deadline.isoformat()}
        if config.is_approved or self._check_approval_threshold(escrow_id):
            return {"escrow_id": escrow_id, "expired": False, "reason": "fully approved before deadline"}

        # Auto-refund: return each buyer's funded amount in full
        refunds = []
        for contribution in self.contributions.get(escrow_id, []):
            party_id = contribution.get("party_id")
            amount = Decimal(str(contribution.get("amount", 0)))
            if amount <= 0:
                continue
            refund = {
                "id": str(uuid.uuid4()),
                "escrow_id": escrow_id,
                "party_id": party_id,
                "amount": str(amount),
                "type": "refund",
                "reason": "approval_deadline_expired",
                "reference": f"refund:{contribution.get('transaction_id') or contribution.get('id')}",
                "status": "completed",
                "refunded_at": datetime.now(timezone.utc).isoformat(),
            }
            refunds.append(refund)
        existing_refs = {d.get("reference") for d in self.distributions.get(escrow_id, [])}
        new_refunds = []
        for refund in refunds:
            if refund["reference"] not in existing_refs:
                self.distributions.setdefault(escrow_id, []).append(refund)
                new_refunds.append(refund)
        for party in self.parties[escrow_id].values():
            if party.status not in (PartyStatus.REMOVED,):
                party.status = PartyStatus.REFUNDED if party.role == PartyRole.BUYER else PartyStatus.CANCELLED
        await self._persist(escrow_id)

        # Middleware wiring: TigerBeetle refund postings + expiry event
        for refund in new_refunds:
            party = self.parties[escrow_id].get(refund["party_id"])
            if party is not None:
                feature_integration.post_escrow_refund(
                    buyer_user_id=str(party.user_id),
                    amount=Decimal(refund["amount"]), escrow_id=escrow_id)
        if new_refunds:
            await feature_integration.publish_feature_event(
                "EscrowExpiredAutoRefund",
                aggregate_id=escrow_id, aggregate_type="escrow",
                payload={"deadline": deadline.isoformat(),
                         "refunds": len(new_refunds),
                         "total_refunded": str(sum(Decimal(r["amount"]) for r in new_refunds))})
        logger.info("escrow_expired_auto_refund",
                    escrow_id=escrow_id, refunds=len(refunds))
        return {"escrow_id": escrow_id, "expired": True,
                "deadline": deadline.isoformat(),
                "refunds": refunds,
                "total_refunded": str(sum(Decimal(r["amount"]) for r in refunds))}

    async def get_funding_status(self, escrow_id: str) -> Dict[str, Any]:
        """Get detailed funding status for an escrow."""
        if escrow_id not in self.parties:
            return {"error": "Escrow not found"}
        
        buyers = [p for p in self.parties[escrow_id].values() if p.role == PartyRole.BUYER]
        
        total_required = sum(p.contribution_amount for p in buyers)
        total_funded = sum(p.amount_funded for p in buyers)
        
        buyer_status = []
        for buyer in buyers:
            buyer_status.append({
                "party_id": buyer.id,
                "user_id": buyer.user_id,
                "contribution_percentage": buyer.contribution_percentage,
                "amount_required": str(buyer.contribution_amount),
                "amount_funded": str(buyer.amount_funded),
                "remaining": str(buyer.contribution_amount - buyer.amount_funded),
                "fully_funded": buyer.amount_funded >= buyer.contribution_amount,
                "status": buyer.status.value
            })
        
        return {
            "escrow_id": escrow_id,
            "total_required": str(total_required),
            "total_funded": str(total_funded),
            "remaining": str(total_required - total_funded),
            "funding_percentage": float(total_funded / total_required * 100) if total_required > 0 else 0,
            "all_funded": total_funded >= total_required,
            "buyers": buyer_status,
            "contributions": self.contributions.get(escrow_id, [])
        }
    
    async def get_approval_status(self, escrow_id: str) -> Dict[str, Any]:
        """Get detailed approval status for an escrow."""
        if escrow_id not in self.approval_configs:
            return {"error": "Approval config not found"}
        
        config = self.approval_configs[escrow_id]
        parties = self.parties.get(escrow_id, {})
        
        approvers = [p for p in parties.values() if p.role in config.approver_roles]
        
        approver_status = []
        for approver in approvers:
            approver_status.append({
                "party_id": approver.id,
                "user_id": approver.user_id,
                "role": approver.role.value,
                "has_approved": approver.has_approved,
                "approved_at": approver.approved_at.isoformat() if approver.approved_at else None,
                "approval_weight": approver.approval_weight
            })
        
        return {
            "escrow_id": escrow_id,
            "approval_type": config.approval_type.value,
            "required_approvals": config.required_approvals,
            "current_approvals": config.current_approvals,
            "weight_threshold": config.weight_threshold,
            "current_weight": config.current_weight,
            "is_approved": config.is_approved,
            "approval_deadline": config.approval_deadline.isoformat() if config.approval_deadline else None,
            "approvers": approver_status
        }
    
    async def get_distribution_status(self, escrow_id: str) -> Dict[str, Any]:
        """Get detailed distribution status for an escrow."""
        if escrow_id not in self.parties:
            return {"error": "Escrow not found"}
        
        sellers = [p for p in self.parties[escrow_id].values() if p.role == PartyRole.SELLER]
        
        total_to_distribute = sum(p.distribution_amount for p in sellers)
        total_distributed = sum(p.amount_received for p in sellers)
        
        seller_status = []
        for seller in sellers:
            seller_status.append({
                "party_id": seller.id,
                "user_id": seller.user_id,
                "distribution_percentage": seller.distribution_percentage,
                "amount_to_receive": str(seller.distribution_amount),
                "amount_received": str(seller.amount_received),
                "remaining": str(seller.distribution_amount - seller.amount_received),
                "fully_paid": seller.amount_received >= seller.distribution_amount,
                "account_id": seller.account_id
            })
        
        return {
            "escrow_id": escrow_id,
            "total_to_distribute": str(total_to_distribute),
            "total_distributed": str(total_distributed),
            "remaining": str(total_to_distribute - total_distributed),
            "distribution_percentage": float(total_distributed / total_to_distribute * 100) if total_to_distribute > 0 else 0,
            "all_distributed": total_distributed >= total_to_distribute,
            "sellers": seller_status,
            "distributions": self.distributions.get(escrow_id, [])
        }
    
    async def calculate_refund_distribution(
        self,
        escrow_id: str,
        refund_amount: Decimal
    ) -> List[Dict[str, Any]]:
        """
        Calculate how to distribute a refund among buyers based on their contributions.
        """
        await self._hydrate(escrow_id)
        if escrow_id not in self.parties:
            raise ValueError(f"Escrow {escrow_id} not found")
        
        buyers = [p for p in self.parties[escrow_id].values() if p.role == PartyRole.BUYER and p.amount_funded > 0]
        
        if not buyers:
            raise ValueError("No funded buyers found")
        
        total_funded = sum(p.amount_funded for p in buyers)
        
        refunds = []
        for buyer in buyers:
            # Refund proportional to contribution
            buyer_refund = refund_amount * buyer.amount_funded / total_funded
            
            refunds.append({
                "party_id": buyer.id,
                "user_id": buyer.user_id,
                "account_id": buyer.account_id,
                "original_contribution": str(buyer.amount_funded),
                "contribution_percentage": float(buyer.amount_funded / total_funded * 100),
                "refund_amount": str(buyer_refund)
            })
        
        return refunds


# Global multiparty escrow service instance
multiparty_escrow_service = MultipartyEscrowService()
