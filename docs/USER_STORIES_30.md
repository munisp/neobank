# NeoBank Platform - 30 Comprehensive User Stories/Journeys

This document covers all major user journeys across the NeoBank platform, including core banking, investments, offline capabilities, and African-focused features.

## Core Banking (Stories 1-6)

### US-001: New User Registration and KYC
**As a** new user in Nigeria
**I want to** register for a NeoBank account and complete KYC verification
**So that** I can access banking services

**Acceptance Criteria:**
- User can register with phone number and email
- BVN verification completes within 30 seconds
- NIN verification as secondary ID
- Selfie verification with liveness detection
- Account created with Tier 1 limits upon basic KYC
- Tier 2/3 unlocked with additional documents
- Multi-country support (NG, KE, ZA, GH, UG, TZ)

**Test Scenarios:**
- Happy path: Complete registration with valid BVN
- Invalid BVN rejection
- Duplicate phone number detection
- KYC document upload and verification
- Tier upgrade flow

---

### US-002: Fund Account via Bank Transfer
**As a** registered user
**I want to** fund my NeoBank account via bank transfer
**So that** I can have funds available for transactions

**Acceptance Criteria:**
- Generate unique virtual account number
- Receive instant notification on credit
- Support for NGN, KES, ZAR, GHS currencies
- Transaction appears in history immediately
- TigerBeetle ledger entry created

**Test Scenarios:**
- Successful funding via virtual account
- Funding from different banks
- Currency conversion for cross-border funding
- Notification delivery verification

---

### US-003: Peer-to-Peer Transfer
**As a** user with funds
**I want to** send money to another NeoBank user
**So that** I can pay friends and family instantly

**Acceptance Criteria:**
- Transfer by phone number or username
- Instant transfer (< 2 seconds)
- Transaction PIN verification
- Real-time balance update
- Push notification to recipient
- Transaction reference generated

**Test Scenarios:**
- Successful P2P transfer
- Insufficient balance handling
- Invalid recipient handling
- Transfer limits enforcement
- Offline transfer queuing (72-hour expiry)

---

### US-004: Bank Transfer to External Account
**As a** user
**I want to** transfer money to an external bank account
**So that** I can pay bills and send money to non-NeoBank users

**Acceptance Criteria:**
- Support for all Nigerian banks via NIBSS
- Account name verification before transfer
- Transfer within 5 minutes for NIBSS Instant
- Fee display before confirmation
- Mojaloop integration for interoperability

**Test Scenarios:**
- Successful external transfer
- Account verification failure handling
- Transfer timeout handling
- Fee calculation accuracy

---

### US-005: Bill Payment
**As a** user
**I want to** pay utility bills and subscriptions
**So that** I can manage all payments from one app

**Acceptance Criteria:**
- Support for electricity (EKEDC, IKEDC, etc.)
- Support for cable TV (DSTV, GOtv, Startimes)
- Support for internet providers
- Token/reference number delivery
- Scheduled recurring payments
- Payment history and receipts

**Test Scenarios:**
- Successful electricity bill payment
- Invalid meter number handling
- Subscription renewal
- Scheduled payment execution

---

### US-006: Airtime and Data Purchase
**As a** user
**I want to** buy airtime and data bundles
**So that** I can top up my phone or others' phones

**Acceptance Criteria:**
- Support for MTN, Airtel, Glo, 9mobile
- Self and third-party recharge
- Data bundle selection
- Instant delivery
- Transaction history

**Test Scenarios:**
- Successful airtime purchase
- Data bundle purchase
- Invalid phone number handling
- Network provider detection

---

## Savings and Investments (Stories 7-12)

### US-007: Create Savings Vault
**As a** user
**I want to** create a savings vault with a target
**So that** I can save towards specific goals

**Acceptance Criteria:**
- Set savings target and deadline
- Choose interest rate tier
- Auto-debit from main account
- Lock/unlock options
- Progress tracking
- Early withdrawal penalties

**Test Scenarios:**
- Create vault with target
- Auto-debit execution
- Early withdrawal with penalty
- Target achievement notification

---

### US-008: Group Savings (Ajo/Esusu/Stokvel)
**As a** user
**I want to** participate in group savings
**So that** I can save with friends and family in traditional rotating format

**Acceptance Criteria:**
- Create or join savings group
- Set contribution amount and frequency
- Automated rotation schedule
- Member management
- Payout notifications
- Default handling

**Test Scenarios:**
- Create new group
- Join existing group
- Contribution collection
- Payout distribution
- Member default handling

---

### US-009: Fixed Deposit
**As a** user with surplus funds
**I want to** lock funds in a fixed deposit
**So that** I can earn higher interest rates

**Acceptance Criteria:**
- Choose tenure (30, 60, 90, 180, 365 days)
- View interest rate before locking
- Maturity notification
- Auto-rollover option
- Early liquidation with penalty

**Test Scenarios:**
- Create fixed deposit
- Maturity processing
- Auto-rollover execution
- Early liquidation

---

### US-010: Stock Trading on African Exchanges
**As an** investor
**I want to** buy and sell stocks on African exchanges
**So that** I can build a diversified portfolio

**Acceptance Criteria:**
- Access to NGX, JSE, NSE Kenya, GSE, USE, DSE
- Real-time price quotes
- Market and limit orders
- Portfolio tracking
- Dividend notifications
- Currency conversion for cross-border trades

**Test Scenarios:**
- Buy stock on NGX
- Sell stock with profit
- Limit order execution
- Cross-border trade with currency conversion
- Stablecoin payment for stocks

---

### US-011: Cryptocurrency Trading
**As a** user
**I want to** buy and sell cryptocurrencies
**So that** I can diversify into digital assets

**Acceptance Criteria:**
- Support for BTC, ETH, USDT, USDC
- Real-time prices
- Buy/sell with NGN
- Wallet management
- Price alerts
- Transaction history

**Test Scenarios:**
- Buy BTC with NGN
- Sell ETH to NGN
- Stablecoin transfer
- Price alert trigger

---

### US-012: Buy Now Pay Later (BNPL)
**As a** user
**I want to** split purchases into installments
**So that** I can afford larger purchases

**Acceptance Criteria:**
- Credit limit based on transaction history
- 3, 6, 12 month payment plans
- Partner merchant integration
- Auto-debit for repayments
- Late payment penalties
- Credit score impact

**Test Scenarios:**
- BNPL application approval
- Installment payment processing
- Late payment handling
- Credit limit increase

---

## Cards and Payments (Stories 13-16)

### US-013: Virtual Card Creation
**As a** user
**I want to** create a virtual card for online payments
**So that** I can shop online securely

**Acceptance Criteria:**
- Instant card generation
- USD and NGN cards
- Set spending limits
- Freeze/unfreeze card
- Transaction notifications
- Card details display

**Test Scenarios:**
- Create virtual card
- Online payment with card
- Card freeze and unfreeze
- Spending limit enforcement

---

### US-014: Physical Card Request
**As a** user
**I want to** request a physical debit card
**So that** I can make POS and ATM transactions

**Acceptance Criteria:**
- Card request with delivery address
- Track delivery status
- Card activation via app
- PIN management
- Card controls (ATM, POS, online)

**Test Scenarios:**
- Request physical card
- Card activation
- PIN change
- Transaction controls

---

### US-015: QR Code Payments
**As a** user
**I want to** pay merchants via QR code
**So that** I can make contactless payments

**Acceptance Criteria:**
- Scan merchant QR code
- Generate personal QR for receiving
- Dynamic QR with amount
- Transaction confirmation
- Receipt generation

**Test Scenarios:**
- Scan and pay merchant
- Generate receive QR
- Dynamic QR payment

---

### US-016: NFC/Tap to Pay
**As a** user with NFC-enabled phone
**I want to** tap to pay at POS terminals
**So that** I can make quick contactless payments

**Acceptance Criteria:**
- Add card to phone wallet
- Tap to pay at NFC terminals
- Transaction authentication
- Spending limits
- Transaction history

**Test Scenarios:**
- NFC payment at POS
- Authentication flow
- Offline NFC payment

---

## Insurance and Loans (Stories 17-20)

### US-017: Micro-Insurance Purchase
**As a** user
**I want to** buy micro-insurance products
**So that** I can protect myself and my assets

**Acceptance Criteria:**
- Device insurance
- Travel insurance
- Health insurance
- Life insurance
- Premium payment
- Claims submission

**Test Scenarios:**
- Purchase device insurance
- Submit insurance claim
- Premium auto-renewal

---

### US-018: Personal Loan Application
**As a** user
**I want to** apply for a personal loan
**So that** I can access credit when needed

**Acceptance Criteria:**
- Instant credit scoring
- Loan offers based on history
- Choose amount and tenure
- E-signature for agreement
- Instant disbursement
- Repayment schedule

**Test Scenarios:**
- Loan application approval
- Loan disbursement
- Repayment processing
- Late payment handling

---

### US-019: Business Loan Application
**As a** business owner
**I want to** apply for a business loan
**So that** I can grow my business

**Acceptance Criteria:**
- KYB verification
- Business document upload
- Cash flow analysis
- Collateral assessment
- Loan approval workflow
- Disbursement to business account

**Test Scenarios:**
- Business loan application
- Document verification
- Approval workflow
- Disbursement

---

### US-020: Escrow Transaction
**As a** buyer/seller
**I want to** use escrow for secure transactions
**So that** both parties are protected

**Acceptance Criteria:**
- Create escrow for P2P, marketplace, real estate
- Multi-party support (up to 10 parties)
- Milestone-based releases
- Dispute resolution
- Arbitrator assignment
- Split payments

**Test Scenarios:**
- Create P2P escrow
- Milestone release
- Dispute filing
- Arbitration resolution
- Multi-party escrow

---

## Offline and Low-Connectivity (Stories 21-24)

### US-021: USSD Banking
**As a** feature phone user
**I want to** access banking via USSD
**So that** I can bank without internet

**Acceptance Criteria:**
- Dial *347*123# for menu
- Check balance
- Transfer money
- Buy airtime
- Pay bills
- Mini statement
- 3-minute session timeout

**Test Scenarios:**
- USSD balance check
- USSD transfer
- USSD airtime purchase
- Session timeout handling

---

### US-022: SMS Banking
**As a** user without data
**I want to** bank via SMS commands
**So that** I can transact without internet

**Acceptance Criteria:**
- BAL command for balance
- SEND command for transfers
- AIR command for airtime
- STMT command for statement
- 160-character response limit
- Rate limiting (20 SMS/hour)

**Test Scenarios:**
- SMS balance inquiry
- SMS transfer
- Invalid command handling
- Rate limit enforcement

---

### US-023: Offline Transaction Queue
**As a** user in a remote area
**I want to** queue transactions while offline
**So that** they execute when I'm back online

**Acceptance Criteria:**
- Queue up to 100 transactions
- 72-hour expiry window
- Cryptographic signing
- Conflict resolution on sync
- Sequence number ordering
- Maximum 500,000 NGN per transaction

**Test Scenarios:**
- Queue offline transfer
- Sync on reconnection
- Expired transaction handling
- Conflict resolution

---

### US-024: Data Saver Mode
**As a** user with limited data
**I want to** enable data saver mode
**So that** I can use the app with minimal data

**Acceptance Criteria:**
- Text-only mode
- Image compression (20% quality)
- Disabled animations
- Disabled auto-refresh
- Disabled analytics
- Extreme saver mode

**Test Scenarios:**
- Enable data saver
- Verify reduced data usage
- Enable extreme saver
- Feature restrictions

---

## Account Management (Stories 25-28)

### US-025: Kids Account
**As a** parent
**I want to** create a kids account
**So that** I can teach my children financial literacy

**Acceptance Criteria:**
- Create sub-account for child
- Set spending limits
- Approve transactions
- Allowance scheduling
- Savings goals for kids
- Activity monitoring

**Test Scenarios:**
- Create kids account
- Set spending limit
- Approve transaction
- Schedule allowance

---

### US-026: Joint Account
**As a** couple
**I want to** create a joint account
**So that** we can manage shared finances

**Acceptance Criteria:**
- Invite co-owner
- Dual authorization option
- Shared transaction history
- Individual spending limits
- Remove co-owner

**Test Scenarios:**
- Create joint account
- Add co-owner
- Dual authorization transfer
- Remove co-owner

---

### US-027: Business Account
**As a** business owner
**I want to** open a business account
**So that** I can separate personal and business finances

**Acceptance Criteria:**
- KYB verification
- CAC document upload
- Multiple signatories
- Sub-accounts for departments
- Bulk payments
- Payroll integration

**Test Scenarios:**
- Business account creation
- KYB verification
- Add signatory
- Bulk payment processing

---

### US-028: Multi-Currency Account
**As a** user with international needs
**I want to** hold multiple currencies
**So that** I can transact globally

**Acceptance Criteria:**
- NGN, USD, GBP, EUR, KES, ZAR wallets
- Real-time FX rates
- Currency conversion
- International transfers
- Rate alerts

**Test Scenarios:**
- Create USD wallet
- Convert NGN to USD
- International transfer
- Rate alert trigger

---

## Security and Support (Stories 29-30)

### US-029: Biometric Authentication
**As a** security-conscious user
**I want to** use biometrics for authentication
**So that** my account is secure

**Acceptance Criteria:**
- Fingerprint login
- Face ID login
- Transaction authentication
- Biometric for sensitive actions
- Fallback to PIN

**Test Scenarios:**
- Enable fingerprint
- Login with Face ID
- Transaction with biometric
- Fallback to PIN

---

### US-030: Fraud Detection and Blocking
**As a** user
**I want to** be protected from fraud
**So that** my money is safe

**Acceptance Criteria:**
- Real-time fraud detection
- Suspicious transaction alerts
- One-tap card blocking
- Account freeze option
- Fraud report submission
- 24/7 support access

**Test Scenarios:**
- Detect suspicious transaction
- Block card via app
- Freeze account
- Submit fraud report
- Emergency blocking via SMS (BLOCK command)

---

## Test Coverage Matrix

| User Story | Unit Tests | Integration Tests | E2E Tests | Performance Tests | Security Tests |
|------------|------------|-------------------|-----------|-------------------|----------------|
| US-001 | 15 | 8 | 3 | 2 | 5 |
| US-002 | 10 | 6 | 2 | 2 | 3 |
| US-003 | 12 | 7 | 3 | 3 | 4 |
| US-004 | 10 | 8 | 2 | 2 | 4 |
| US-005 | 8 | 5 | 2 | 1 | 2 |
| US-006 | 8 | 5 | 2 | 1 | 2 |
| US-007 | 10 | 6 | 2 | 1 | 3 |
| US-008 | 12 | 8 | 3 | 2 | 3 |
| US-009 | 8 | 5 | 2 | 1 | 2 |
| US-010 | 15 | 10 | 4 | 3 | 5 |
| US-011 | 12 | 8 | 3 | 2 | 5 |
| US-012 | 10 | 7 | 3 | 2 | 4 |
| US-013 | 10 | 6 | 2 | 1 | 4 |
| US-014 | 8 | 5 | 2 | 1 | 3 |
| US-015 | 8 | 5 | 2 | 1 | 3 |
| US-016 | 8 | 5 | 2 | 1 | 3 |
| US-017 | 10 | 6 | 2 | 1 | 3 |
| US-018 | 12 | 8 | 3 | 2 | 4 |
| US-019 | 12 | 8 | 3 | 2 | 4 |
| US-020 | 15 | 10 | 4 | 2 | 5 |
| US-021 | 10 | 6 | 3 | 2 | 3 |
| US-022 | 10 | 6 | 3 | 2 | 3 |
| US-023 | 12 | 8 | 3 | 3 | 4 |
| US-024 | 8 | 5 | 2 | 2 | 2 |
| US-025 | 10 | 6 | 2 | 1 | 3 |
| US-026 | 10 | 6 | 2 | 1 | 3 |
| US-027 | 12 | 8 | 3 | 2 | 4 |
| US-028 | 10 | 7 | 3 | 2 | 4 |
| US-029 | 10 | 6 | 3 | 1 | 5 |
| US-030 | 12 | 8 | 3 | 2 | 6 |
| **Total** | **316** | **198** | **78** | **50** | **109** |

## Automation Coverage

All 30 user stories have automated tests covering:
- **Unit Tests**: Individual function/method testing
- **Integration Tests**: Service-to-service communication
- **E2E Tests**: Full user journey simulation
- **Performance Tests**: Load and stress testing
- **Security Tests**: Vulnerability and penetration testing

Tests are integrated into CI/CD via GitHub Actions with:
- Pre-commit hooks for unit tests
- PR checks for integration tests
- Nightly E2E test runs
- Weekly performance tests
- Monthly security scans
