"""
Pytest Configuration and Shared Fixtures for E2E Tests
"""
import pytest
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page
from playwright_config import BROWSER_CONFIG, PLAYWRIGHT_CONFIG
import os


@pytest.fixture(scope="session")
def browser():
    """
    Create a browser instance for the entire test session
    """
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**BROWSER_CONFIG)
        yield browser
        browser.close()


@pytest.fixture(scope="function")
def context(browser: Browser):
    """
    Create a new browser context for each test
    """
    context = browser.new_context(
        viewport=BROWSER_CONFIG["viewport"],
        user_agent=BROWSER_CONFIG["user_agent"]
    )
    yield context
    context.close()


@pytest.fixture(scope="function")
def page(context: BrowserContext):
    """
    Create a new page for each test
    """
    page = context.new_page()
    
    # Set default timeout
    page.set_default_timeout(PLAYWRIGHT_CONFIG["timeout"])
    
    yield page
    
    # Take screenshot on failure
    if hasattr(page, "_test_failed"):
        screenshot_dir = "/home/ubuntu/e2e-tests/screenshots"
        os.makedirs(screenshot_dir, exist_ok=True)
        page.screenshot(path=f"{screenshot_dir}/failure_{page._test_name}.png")
    
    page.close()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """
    Hook to capture test failures for screenshot
    """
    outcome = yield
    rep = outcome.get_result()
    
    if rep.when == "call" and rep.failed:
        if "page" in item.funcargs:
            page = item.funcargs["page"]
            page._test_failed = True
            page._test_name = item.name


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """
    Set up test environment before running tests
    """
    # Create necessary directories
    os.makedirs("/home/ubuntu/e2e-tests/screenshots", exist_ok=True)
    os.makedirs("/home/ubuntu/e2e-tests/videos", exist_ok=True)
    os.makedirs("/home/ubuntu/e2e-tests/traces", exist_ok=True)
    os.makedirs("/home/ubuntu/e2e-tests/reports", exist_ok=True)
    
    yield
    
    # Cleanup after all tests
    pass


@pytest.fixture(scope="function")
def authenticated_page(page: Page):
    """
    Provide a page with authenticated user session
    """
    from test_utils import login_as_user
    login_as_user(page)
    yield page


@pytest.fixture(scope="function")
def admin_page(page: Page):
    """
    Provide a page with authenticated admin session
    """
    from test_utils import login_as_admin
    login_as_admin(page)
    yield page
