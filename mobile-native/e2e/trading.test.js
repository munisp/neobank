describe('Trading Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
    // Login first
    await element(by.id('email-input')).typeText('demo@neobank.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    await waitFor(element(by.id('dashboard-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });

  beforeEach(async () => {
    // Navigate to stocks screen
    await element(by.id('stocks-tab')).tap();
    await expect(element(by.id('stocks-screen'))).toBeVisible();
  });

  describe('Stock Trading', () => {
    it('should display stock list', async () => {
      await expect(element(by.id('stock-list'))).toBeVisible();
      await expect(element(by.id('stock-item-0'))).toBeVisible();
    });

    it('should display portfolio', async () => {
      await expect(element(by.id('portfolio-section'))).toBeVisible();
    });

    it('should open trade modal when stock is tapped', async () => {
      await element(by.id('stock-item-0')).tap();
      await expect(element(by.id('trade-modal'))).toBeVisible();
    });

    it('should execute buy trade', async () => {
      await element(by.id('stock-item-0')).tap();
      await element(by.id('buy-button')).tap();
      await element(by.id('shares-input')).typeText('10');
      await element(by.id('execute-trade-button')).tap();

      await waitFor(element(by.text('Successfully bought')))
        .toBeVisible()
        .withTimeout(5000);
    });

    it('should execute sell trade', async () => {
      await element(by.id('stock-item-0')).tap();
      await element(by.id('sell-button')).tap();
      await element(by.id('shares-input')).typeText('5');
      await element(by.id('execute-trade-button')).tap();

      await waitFor(element(by.text('Successfully sold')))
        .toBeVisible()
        .withTimeout(5000);
    });

    it('should validate share amount', async () => {
      await element(by.id('stock-item-0')).tap();
      await element(by.id('shares-input')).typeText('0');
      await element(by.id('execute-trade-button')).tap();

      await expect(element(by.text('Please enter a valid number of shares'))).toBeVisible();
    });

    it('should refresh stock prices', async () => {
      await element(by.id('stock-list')).swipe('down', 'fast');
      await waitFor(element(by.id('loading-indicator')))
        .toBeVisible()
        .withTimeout(2000);
      await waitFor(element(by.id('loading-indicator')))
        .not.toBeVisible()
        .withTimeout(5000);
    });
  });

  describe('Cryptocurrency Trading', () => {
    beforeEach(async () => {
      await element(by.id('crypto-tab')).tap();
      await expect(element(by.id('crypto-screen'))).toBeVisible();
    });

    it('should display cryptocurrency list', async () => {
      await expect(element(by.id('crypto-list'))).toBeVisible();
      await expect(element(by.id('crypto-item-0'))).toBeVisible();
    });

    it('should display portfolio summary', async () => {
      await expect(element(by.id('portfolio-summary'))).toBeVisible();
    });

    it('should execute crypto buy trade', async () => {
      await element(by.id('crypto-item-0')).tap();
      await element(by.id('buy-button')).tap();
      await element(by.id('amount-input')).typeText('0.5');
      await element(by.id('execute-trade-button')).tap();

      await waitFor(element(by.text('Successfully bought')))
        .toBeVisible()
        .withTimeout(5000);
    });

    it('should validate crypto amount', async () => {
      await element(by.id('crypto-item-0')).tap();
      await element(by.id('amount-input')).typeText('-1');
      await element(by.id('execute-trade-button')).tap();

      await expect(element(by.text('Please enter a valid amount'))).toBeVisible();
    });
  });
});

