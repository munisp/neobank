"""
Lightweight Web Interface Router for NeoBank

Provides a minimal, text-based web interface optimized for:
- 2G/EDGE connections (< 50KB total page size)
- Old browsers (no JavaScript required)
- Feature phones with basic browsers (Opera Mini, UC Browser)
- Low-memory devices

All pages are server-rendered HTML with minimal CSS.
No JavaScript, no images, no web fonts.
"""

from fastapi import APIRouter, Request, Form, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from typing import Optional
from decimal import Decimal
from datetime import datetime
import secrets
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/lite", tags=["Lite Web Interface"])

# Minimal CSS (inline to reduce requests)
LITE_CSS = """
body{font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:10px;background:#fff;color:#000}
h1{font-size:18px;margin:10px 0}
h2{font-size:16px;margin:8px 0}
p{margin:5px 0;font-size:14px}
a{color:#0066cc}
.btn{display:block;background:#0066cc;color:#fff;text-align:center;padding:10px;margin:5px 0;text-decoration:none;border:none;width:100%;font-size:14px}
.btn-danger{background:#cc0000}
.btn-success{background:#009900}
input,select{width:100%;padding:8px;margin:5px 0;border:1px solid #ccc;font-size:14px;box-sizing:border-box}
.balance{font-size:20px;font-weight:bold;color:#009900;text-align:center;padding:10px;background:#f0f0f0;margin:10px 0}
.error{color:#cc0000;background:#ffeeee;padding:10px;margin:10px 0}
.success{color:#009900;background:#eeffee;padding:10px;margin:10px 0}
.tx{border-bottom:1px solid #eee;padding:5px 0}
.tx-credit{color:#009900}
.tx-debit{color:#cc0000}
nav{background:#f0f0f0;padding:5px;margin-bottom:10px}
nav a{margin-right:10px;font-size:12px}
form{margin:10px 0}
.small{font-size:12px;color:#666}
"""


def render_page(title: str, content: str, show_nav: bool = True) -> str:
    """Render a lightweight HTML page"""
    nav = ""
    if show_nav:
        nav = """
<nav>
<a href="/lite/">Home</a>
<a href="/lite/balance">Balance</a>
<a href="/lite/send">Send</a>
<a href="/lite/airtime">Airtime</a>
<a href="/lite/history">History</a>
<a href="/lite/logout">Logout</a>
</nav>
"""
    
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} - NeoBank Lite</title>
<style>{LITE_CSS}</style>
</head>
<body>
<h1>NeoBank</h1>
{nav}
{content}
<p class="small">NeoBank Lite v1.0 | <a href="/lite/help">Help</a></p>
</body>
</html>"""


def get_session_token(request: Request) -> Optional[str]:
    """Get session token from cookie"""
    return request.cookies.get("lite_session")


# In-memory session store (use Redis in production)
_sessions = {}
_users = {}


@router.get("/", response_class=HTMLResponse)
async def lite_home(request: Request):
    """Lite home page / login"""
    session = get_session_token(request)
    
    if session and session in _sessions:
        # Logged in - show dashboard
        user = _sessions[session]
        balance = Decimal("50000")  # Would fetch from DB
        
        content = f"""
<div class="balance">NGN {balance:,.2f}</div>
<p>Welcome back!</p>

<a href="/lite/send" class="btn">Send Money</a>
<a href="/lite/airtime" class="btn">Buy Airtime</a>
<a href="/lite/bills" class="btn">Pay Bills</a>
<a href="/lite/history" class="btn">Transaction History</a>
<a href="/lite/savings" class="btn">Savings</a>
"""
        return HTMLResponse(render_page("Dashboard", content))
    
    # Not logged in - show login form
    content = """
<h2>Login</h2>
<form method="POST" action="/lite/login">
<label>Phone Number</label>
<input type="tel" name="phone" placeholder="08012345678" required>
<label>PIN</label>
<input type="password" name="pin" maxlength="4" pattern="[0-9]{4}" placeholder="****" required>
<button type="submit" class="btn">Login</button>
</form>
<p class="small">Don't have an account? <a href="/lite/register">Register</a></p>
<p class="small">Forgot PIN? <a href="/lite/reset">Reset</a></p>
"""
    return HTMLResponse(render_page("Login", content, show_nav=False))


@router.post("/login", response_class=HTMLResponse)
async def lite_login(
    request: Request,
    phone: str = Form(...),
    pin: str = Form(...)
):
    """Handle login"""
    # Normalize phone
    phone = phone.strip().replace(" ", "")
    if phone.startswith("0"):
        phone = "234" + phone[1:]
    
    # Validate PIN (in production, verify against database)
    if len(pin) != 4 or not pin.isdigit():
        content = """
<div class="error">Invalid PIN format. PIN must be 4 digits.</div>
<a href="/lite/" class="btn">Try Again</a>
"""
        return HTMLResponse(render_page("Login Failed", content, show_nav=False))
    
    # Create session
    session_token = secrets.token_hex(16)
    _sessions[session_token] = {"phone": phone, "user_id": f"user_{phone}"}
    
    response = RedirectResponse(url="/lite/", status_code=303)
    response.set_cookie(
        key="lite_session",
        value=session_token,
        max_age=1800,  # 30 minutes
        httponly=True,
        samesite="strict"
    )
    
    logger.info("Lite login", phone=phone[-4:])
    return response


@router.get("/logout")
async def lite_logout(request: Request):
    """Handle logout"""
    session = get_session_token(request)
    if session:
        _sessions.pop(session, None)
    
    response = RedirectResponse(url="/lite/", status_code=303)
    response.delete_cookie("lite_session")
    return response


@router.get("/balance", response_class=HTMLResponse)
async def lite_balance(request: Request):
    """Show balance"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    balance = Decimal("50000")
    available = Decimal("48500")
    
    content = f"""
<h2>Account Balance</h2>
<div class="balance">NGN {balance:,.2f}</div>
<p>Available: NGN {available:,.2f}</p>
<p>Pending: NGN {balance - available:,.2f}</p>
<p class="small">Last updated: {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
<a href="/lite/" class="btn">Back to Menu</a>
"""
    return HTMLResponse(render_page("Balance", content))


@router.get("/send", response_class=HTMLResponse)
async def lite_send_form(request: Request):
    """Show send money form"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    content = """
<h2>Send Money</h2>
<form method="POST" action="/lite/send">
<label>Recipient Phone</label>
<input type="tel" name="recipient" placeholder="08012345678" required>

<label>Amount (NGN)</label>
<input type="number" name="amount" min="100" max="50000" placeholder="1000" required>

<label>Your PIN</label>
<input type="password" name="pin" maxlength="4" pattern="[0-9]{4}" placeholder="****" required>

<button type="submit" class="btn btn-success">Send Money</button>
</form>
<p class="small">Transfer fee: NGN 10-50 depending on amount</p>
<a href="/lite/">Cancel</a>
"""
    return HTMLResponse(render_page("Send Money", content))


@router.post("/send", response_class=HTMLResponse)
async def lite_send_process(
    request: Request,
    recipient: str = Form(...),
    amount: str = Form(...),
    pin: str = Form(...)
):
    """Process send money"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    try:
        amount_decimal = Decimal(amount)
        if amount_decimal < 100:
            raise ValueError("Minimum is NGN 100")
        if amount_decimal > 50000:
            raise ValueError("Maximum is NGN 50,000 via Lite")
    except (ValueError, TypeError) as e:
        content = f"""
<div class="error">Invalid amount: {str(e)}</div>
<a href="/lite/send" class="btn">Try Again</a>
"""
        return HTMLResponse(render_page("Send Failed", content))
    
    # Verify PIN (in production, check against database)
    if len(pin) != 4 or not pin.isdigit():
        content = """
<div class="error">Invalid PIN</div>
<a href="/lite/send" class="btn">Try Again</a>
"""
        return HTMLResponse(render_page("Send Failed", content))
    
    # Process transfer (in production, call transfer service)
    reference = f"LT{secrets.token_hex(4).upper()}"
    fee = Decimal("25") if amount_decimal > 5000 else Decimal("10")
    new_balance = Decimal("50000") - amount_decimal - fee
    
    content = f"""
<div class="success">Transfer Successful!</div>
<p><strong>Amount:</strong> NGN {amount_decimal:,.2f}</p>
<p><strong>To:</strong> {recipient[-4:]}</p>
<p><strong>Fee:</strong> NGN {fee:,.2f}</p>
<p><strong>Reference:</strong> {reference}</p>
<p><strong>New Balance:</strong> NGN {new_balance:,.2f}</p>
<a href="/lite/" class="btn">Back to Menu</a>
"""
    return HTMLResponse(render_page("Transfer Complete", content))


@router.get("/airtime", response_class=HTMLResponse)
async def lite_airtime_form(request: Request):
    """Show airtime purchase form"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    user = _sessions[session]
    
    content = f"""
<h2>Buy Airtime</h2>
<form method="POST" action="/lite/airtime">
<label>Phone Number</label>
<input type="tel" name="phone" value="{user.get('phone', '')}" placeholder="08012345678" required>

<label>Network</label>
<select name="network" required>
<option value="mtn">MTN</option>
<option value="airtel">Airtel</option>
<option value="glo">Glo</option>
<option value="9mobile">9mobile</option>
</select>

<label>Amount (NGN)</label>
<select name="amount" required>
<option value="50">NGN 50</option>
<option value="100">NGN 100</option>
<option value="200">NGN 200</option>
<option value="500">NGN 500</option>
<option value="1000">NGN 1,000</option>
<option value="2000">NGN 2,000</option>
<option value="5000">NGN 5,000</option>
</select>

<label>Your PIN</label>
<input type="password" name="pin" maxlength="4" pattern="[0-9]{4}" placeholder="****" required>

<button type="submit" class="btn btn-success">Buy Airtime</button>
</form>
<a href="/lite/">Cancel</a>
"""
    return HTMLResponse(render_page("Buy Airtime", content))


@router.post("/airtime", response_class=HTMLResponse)
async def lite_airtime_process(
    request: Request,
    phone: str = Form(...),
    network: str = Form(...),
    amount: str = Form(...),
    pin: str = Form(...)
):
    """Process airtime purchase"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    amount_decimal = Decimal(amount)
    reference = f"AIR{secrets.token_hex(4).upper()}"
    
    content = f"""
<div class="success">Airtime Sent!</div>
<p><strong>Phone:</strong> {phone[-4:]}</p>
<p><strong>Network:</strong> {network.upper()}</p>
<p><strong>Amount:</strong> NGN {amount_decimal:,.2f}</p>
<p><strong>Reference:</strong> {reference}</p>
<a href="/lite/" class="btn">Back to Menu</a>
"""
    return HTMLResponse(render_page("Airtime Sent", content))


@router.get("/history", response_class=HTMLResponse)
async def lite_history(request: Request):
    """Show transaction history"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    # Mock transactions (in production, fetch from database)
    transactions = [
        {"date": "13/12", "desc": "Transfer to 0801***5678", "amount": -5000, "type": "debit"},
        {"date": "12/12", "desc": "Airtime MTN", "amount": -500, "type": "debit"},
        {"date": "12/12", "desc": "Received from 0803***1234", "amount": 10000, "type": "credit"},
        {"date": "11/12", "desc": "Electricity IKEDC", "amount": -5000, "type": "debit"},
        {"date": "10/12", "desc": "Salary Credit", "amount": 150000, "type": "credit"},
    ]
    
    tx_html = ""
    for tx in transactions:
        css_class = "tx-credit" if tx["type"] == "credit" else "tx-debit"
        sign = "+" if tx["type"] == "credit" else "-"
        tx_html += f"""
<div class="tx">
<span>{tx['date']}</span>
<span class="{css_class}">{sign}NGN {abs(tx['amount']):,}</span>
<br><span class="small">{tx['desc']}</span>
</div>
"""
    
    content = f"""
<h2>Recent Transactions</h2>
{tx_html}
<p class="small">Showing last 5 transactions</p>
<a href="/lite/" class="btn">Back to Menu</a>
"""
    return HTMLResponse(render_page("History", content))


@router.get("/bills", response_class=HTMLResponse)
async def lite_bills_form(request: Request):
    """Show bill payment form"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    content = """
<h2>Pay Bills</h2>
<form method="POST" action="/lite/bills">
<label>Bill Type</label>
<select name="bill_type" required>
<option value="">Select...</option>
<option value="electricity">Electricity</option>
<option value="cable">Cable TV (DSTV/GOtv)</option>
<option value="internet">Internet</option>
<option value="water">Water</option>
</select>

<label>Provider</label>
<select name="provider" required>
<option value="ikedc">IKEDC</option>
<option value="ekedc">EKEDC</option>
<option value="dstv">DSTV</option>
<option value="gotv">GOtv</option>
</select>

<label>Meter/Decoder Number</label>
<input type="text" name="account" placeholder="Enter number" required>

<label>Amount (NGN)</label>
<input type="number" name="amount" min="500" placeholder="5000" required>

<label>Your PIN</label>
<input type="password" name="pin" maxlength="4" pattern="[0-9]{4}" placeholder="****" required>

<button type="submit" class="btn btn-success">Pay Bill</button>
</form>
<a href="/lite/">Cancel</a>
"""
    return HTMLResponse(render_page("Pay Bills", content))


@router.post("/bills", response_class=HTMLResponse)
async def lite_bills_process(
    request: Request,
    bill_type: str = Form(...),
    provider: str = Form(...),
    account: str = Form(...),
    amount: str = Form(...),
    pin: str = Form(...)
):
    """Process bill payment"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    amount_decimal = Decimal(amount)
    reference = f"BIL{secrets.token_hex(4).upper()}"
    token = secrets.token_hex(8).upper() if bill_type == "electricity" else None
    
    token_html = f"<p><strong>Token:</strong> {token}</p>" if token else ""
    
    content = f"""
<div class="success">Payment Successful!</div>
<p><strong>Provider:</strong> {provider.upper()}</p>
<p><strong>Account:</strong> {account}</p>
<p><strong>Amount:</strong> NGN {amount_decimal:,.2f}</p>
{token_html}
<p><strong>Reference:</strong> {reference}</p>
<a href="/lite/" class="btn">Back to Menu</a>
"""
    return HTMLResponse(render_page("Bill Paid", content))


@router.get("/savings", response_class=HTMLResponse)
async def lite_savings(request: Request):
    """Show savings"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    savings_balance = Decimal("25000")
    interest_rate = 10
    
    content = f"""
<h2>Savings</h2>
<div class="balance">NGN {savings_balance:,.2f}</div>
<p>Interest Rate: {interest_rate}% per annum</p>

<form method="POST" action="/lite/savings/deposit">
<label>Deposit Amount</label>
<input type="number" name="amount" min="100" placeholder="1000">
<label>PIN</label>
<input type="password" name="pin" maxlength="4" pattern="[0-9]{4}" placeholder="****">
<button type="submit" class="btn btn-success">Deposit</button>
</form>

<form method="POST" action="/lite/savings/withdraw">
<label>Withdraw Amount</label>
<input type="number" name="amount" min="100" placeholder="1000">
<label>PIN</label>
<input type="password" name="pin" maxlength="4" pattern="[0-9]{4}" placeholder="****">
<button type="submit" class="btn">Withdraw</button>
</form>

<a href="/lite/">Back to Menu</a>
"""
    return HTMLResponse(render_page("Savings", content))


@router.post("/savings/deposit", response_class=HTMLResponse)
async def lite_savings_deposit(
    request: Request,
    amount: str = Form(...),
    pin: str = Form(...)
):
    """Process savings deposit"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    amount_decimal = Decimal(amount)
    new_savings = Decimal("25000") + amount_decimal
    
    content = f"""
<div class="success">Deposit Successful!</div>
<p><strong>Amount:</strong> NGN {amount_decimal:,.2f}</p>
<p><strong>New Savings Balance:</strong> NGN {new_savings:,.2f}</p>
<a href="/lite/savings" class="btn">Back to Savings</a>
"""
    return HTMLResponse(render_page("Deposit Complete", content))


@router.post("/savings/withdraw", response_class=HTMLResponse)
async def lite_savings_withdraw(
    request: Request,
    amount: str = Form(...),
    pin: str = Form(...)
):
    """Process savings withdrawal"""
    session = get_session_token(request)
    if not session or session not in _sessions:
        return RedirectResponse(url="/lite/", status_code=303)
    
    amount_decimal = Decimal(amount)
    new_savings = Decimal("25000") - amount_decimal
    
    content = f"""
<div class="success">Withdrawal Successful!</div>
<p><strong>Amount:</strong> NGN {amount_decimal:,.2f}</p>
<p><strong>Credited to main account</strong></p>
<p><strong>New Savings Balance:</strong> NGN {new_savings:,.2f}</p>
<a href="/lite/savings" class="btn">Back to Savings</a>
"""
    return HTMLResponse(render_page("Withdrawal Complete", content))


@router.get("/help", response_class=HTMLResponse)
async def lite_help(request: Request):
    """Show help page"""
    content = """
<h2>Help</h2>
<p><strong>NeoBank Lite</strong> is designed for slow connections and basic phones.</p>

<h3>Features</h3>
<p>- Check balance</p>
<p>- Send money (max NGN 50,000)</p>
<p>- Buy airtime</p>
<p>- Pay bills</p>
<p>- View transaction history</p>
<p>- Savings deposits/withdrawals</p>

<h3>Other Access Methods</h3>
<p><strong>USSD:</strong> Dial *347*123#</p>
<p><strong>SMS:</strong> Send BAL 1234 to 32123</p>
<p><strong>App:</strong> Download from neobank.com</p>

<h3>Support</h3>
<p>Call: 0800-NEOBANK</p>
<p>WhatsApp: +234 800 123 4567</p>

<a href="/lite/" class="btn">Back to Menu</a>
"""
    return HTMLResponse(render_page("Help", content, show_nav=False))


@router.get("/register", response_class=HTMLResponse)
async def lite_register(request: Request):
    """Show registration info"""
    content = """
<h2>Register</h2>
<p>To register for NeoBank:</p>

<p><strong>Option 1: USSD</strong></p>
<p>Dial *347*123# and select Register</p>

<p><strong>Option 2: App</strong></p>
<p>Download from neobank.com</p>

<p><strong>Option 3: Visit Branch</strong></p>
<p>Find nearest branch at neobank.com/branches</p>

<a href="/lite/" class="btn">Back to Login</a>
"""
    return HTMLResponse(render_page("Register", content, show_nav=False))
