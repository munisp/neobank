# NeoBank Policy-Based Access Control (PBAC) Policies
# Comprehensive Rego policies for fine-grained authorization

package neobank.authz

import future.keywords.if
import future.keywords.in
import future.keywords.contains

# Default deny
default allow := false

# Role hierarchy
role_hierarchy := {
    "super_admin": ["admin", "compliance_officer", "support_agent", "user"],
    "admin": ["compliance_officer", "support_agent", "user"],
    "compliance_officer": ["support_agent", "user"],
    "support_agent": ["user"],
    "user": []
}

# Get all roles including inherited ones
effective_roles[role] {
    role := input.user.role
}

effective_roles[inherited] {
    role := input.user.role
    inherited := role_hierarchy[role][_]
}

# KYC tier levels
kyc_tiers := {
    "tier_0": 0,
    "tier_1": 1,
    "tier_2": 2,
    "tier_3": 3
}

# Transaction limits by KYC tier (in NGN)
transaction_limits := {
    "tier_0": {"daily": 50000, "single": 10000},
    "tier_1": {"daily": 200000, "single": 50000},
    "tier_2": {"daily": 5000000, "single": 1000000},
    "tier_3": {"daily": 50000000, "single": 10000000}
}

# ============================================
# ACCOUNT ACCESS POLICIES
# ============================================

# Users can access their own accounts
allow if {
    input.action == "read"
    input.resource.type == "account"
    input.resource.owner_id == input.user.id
}

# Users can access joint accounts they're a member of
allow if {
    input.action == "read"
    input.resource.type == "account"
    input.resource.joint_members[_] == input.user.id
}

# Users can transfer from their own accounts
allow if {
    input.action == "transfer"
    input.resource.type == "account"
    input.resource.owner_id == input.user.id
    within_transaction_limit
}

# Admins can read any account
allow if {
    input.action == "read"
    input.resource.type == "account"
    "admin" in effective_roles
}

# Support agents can read accounts for support purposes
allow if {
    input.action == "read"
    input.resource.type == "account"
    "support_agent" in effective_roles
    input.context.purpose == "support_ticket"
}

# ============================================
# TRANSACTION POLICIES
# ============================================

# Users can view their own transactions
allow if {
    input.action == "read"
    input.resource.type == "transaction"
    input.resource.user_id == input.user.id
}

# Users can create transactions within limits
allow if {
    input.action == "create"
    input.resource.type == "transaction"
    input.resource.user_id == input.user.id
    within_transaction_limit
    not is_blocked_user
}

# Check if transaction is within KYC tier limits
within_transaction_limit if {
    tier := input.user.kyc_tier
    limits := transaction_limits[tier]
    input.resource.amount <= limits.single
    input.context.daily_total + input.resource.amount <= limits.daily
}

# Default to true if no amount specified (for read operations)
within_transaction_limit if {
    not input.resource.amount
}

# Check if user is blocked
is_blocked_user if {
    input.user.status == "blocked"
}

is_blocked_user if {
    input.user.status == "suspended"
}

# ============================================
# KYC/KYB POLICIES
# ============================================

# Users can view their own KYC status
allow if {
    input.action == "read"
    input.resource.type == "kyc"
    input.resource.user_id == input.user.id
}

# Users can submit KYC documents
allow if {
    input.action == "submit"
    input.resource.type == "kyc"
    input.resource.user_id == input.user.id
}

# Compliance officers can review KYC applications
allow if {
    input.action in ["read", "review", "approve", "reject"]
    input.resource.type == "kyc"
    "compliance_officer" in effective_roles
}

# Compliance officers can manage KYB applications
allow if {
    input.action in ["read", "review", "approve", "reject"]
    input.resource.type == "kyb"
    "compliance_officer" in effective_roles
}

# ============================================
# LOAN POLICIES
# ============================================

# Users can view their own loans
allow if {
    input.action == "read"
    input.resource.type == "loan"
    input.resource.user_id == input.user.id
}

# Users can apply for loans if KYC tier >= 1
allow if {
    input.action == "apply"
    input.resource.type == "loan"
    input.resource.user_id == input.user.id
    kyc_tiers[input.user.kyc_tier] >= 1
}

# Users can make loan payments
allow if {
    input.action == "pay"
    input.resource.type == "loan"
    input.resource.user_id == input.user.id
}

# Credit officers can approve/reject loans
allow if {
    input.action in ["approve", "reject", "review"]
    input.resource.type == "loan"
    "compliance_officer" in effective_roles
}

# ============================================
# INVESTMENT POLICIES
# ============================================

# Users can view their investments
allow if {
    input.action == "read"
    input.resource.type == "investment"
    input.resource.user_id == input.user.id
}

# Users can trade if KYC tier >= 2
allow if {
    input.action in ["buy", "sell"]
    input.resource.type == "investment"
    input.resource.user_id == input.user.id
    kyc_tiers[input.user.kyc_tier] >= 2
    not is_blocked_user
}

# ============================================
# INSURANCE POLICIES
# ============================================

# Users can view their insurance policies
allow if {
    input.action == "read"
    input.resource.type == "insurance"
    input.resource.user_id == input.user.id
}

# Users can purchase insurance
allow if {
    input.action == "purchase"
    input.resource.type == "insurance"
    input.resource.user_id == input.user.id
    kyc_tiers[input.user.kyc_tier] >= 1
}

# Users can file claims on their policies
allow if {
    input.action == "claim"
    input.resource.type == "insurance"
    input.resource.user_id == input.user.id
}

# ============================================
# ESCROW POLICIES
# ============================================

# Users can view escrows they're party to
allow if {
    input.action == "read"
    input.resource.type == "escrow"
    is_escrow_party
}

# Users can create escrows
allow if {
    input.action == "create"
    input.resource.type == "escrow"
    kyc_tiers[input.user.kyc_tier] >= 1
}

# Escrow parties can perform actions based on their role
allow if {
    input.action in ["fund", "approve", "dispute"]
    input.resource.type == "escrow"
    is_escrow_party
    can_perform_escrow_action
}

# Check if user is party to escrow
is_escrow_party if {
    input.resource.buyer_id == input.user.id
}

is_escrow_party if {
    input.resource.seller_id == input.user.id
}

is_escrow_party if {
    input.resource.parties[_].user_id == input.user.id
}

# Check if user can perform escrow action based on role
can_perform_escrow_action if {
    input.action == "fund"
    input.resource.buyer_id == input.user.id
}

can_perform_escrow_action if {
    input.action == "approve"
    input.resource.buyer_id == input.user.id
}

can_perform_escrow_action if {
    input.action == "dispute"
    is_escrow_party
}

# Arbitrators can resolve disputes
allow if {
    input.action == "resolve"
    input.resource.type == "escrow"
    input.resource.arbitrator_id == input.user.id
}

# ============================================
# CARD POLICIES
# ============================================

# Users can view their cards
allow if {
    input.action == "read"
    input.resource.type == "card"
    input.resource.user_id == input.user.id
}

# Users can manage their cards
allow if {
    input.action in ["freeze", "unfreeze", "set_limit", "set_pin"]
    input.resource.type == "card"
    input.resource.user_id == input.user.id
}

# Users can request new cards if KYC tier >= 1
allow if {
    input.action == "request"
    input.resource.type == "card"
    input.resource.user_id == input.user.id
    kyc_tiers[input.user.kyc_tier] >= 1
}

# ============================================
# REWARDS POLICIES
# ============================================

# Users can view and redeem their rewards
allow if {
    input.action in ["read", "redeem"]
    input.resource.type == "reward"
    input.resource.user_id == input.user.id
}

# ============================================
# ADMIN POLICIES
# ============================================

# Super admins can do anything
allow if {
    "super_admin" in effective_roles
}

# Admins can manage users
allow if {
    input.action in ["read", "update", "suspend", "unsuspend"]
    input.resource.type == "user"
    "admin" in effective_roles
    input.resource.id != input.user.id  # Can't modify self
}

# Admins can view system analytics
allow if {
    input.action == "read"
    input.resource.type == "analytics"
    "admin" in effective_roles
}

# ============================================
# AUDIT POLICIES
# ============================================

# All actions are logged for audit
audit_log := {
    "user_id": input.user.id,
    "action": input.action,
    "resource_type": input.resource.type,
    "resource_id": input.resource.id,
    "allowed": allow,
    "timestamp": input.timestamp,
    "ip_address": input.context.ip_address,
    "user_agent": input.context.user_agent
}

# ============================================
# HELPER FUNCTIONS
# ============================================

# Get denial reason
denial_reason := reason if {
    not allow
    is_blocked_user
    reason := "User account is blocked or suspended"
}

denial_reason := reason if {
    not allow
    not within_transaction_limit
    reason := "Transaction exceeds KYC tier limits"
}

denial_reason := reason if {
    not allow
    input.action in ["buy", "sell"]
    input.resource.type == "investment"
    kyc_tiers[input.user.kyc_tier] < 2
    reason := "Investment trading requires KYC tier 2 or higher"
}

denial_reason := reason if {
    not allow
    reason := "Access denied by policy"
}
