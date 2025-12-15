describe('Loan Application Flow', () => {
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
    // Navigate to loans screen
    await element(by.id('loans-tab')).tap();
    await expect(element(by.id('loans-screen'))).toBeVisible();
    
    // Tap apply for loan button
    await element(by.id('apply-loan-button')).tap();
    await expect(element(by.id('loan-application-screen'))).toBeVisible();
  });

  it('should display step 1 (Loan Details)', async () => {
    await expect(element(by.id('step-1'))).toBeVisible();
    await expect(element(by.id('loan-type-select'))).toBeVisible();
    await expect(element(by.id('amount-input'))).toBeVisible();
    await expect(element(by.id('term-input'))).toBeVisible();
  });

  it('should navigate to step 2', async () => {
    // Fill step 1
    await element(by.id('loan-type-select')).tap();
    await element(by.text('Personal')).tap();
    await element(by.id('amount-input')).typeText('10000');
    await element(by.id('term-input')).typeText('12');
    await element(by.id('purpose-input')).typeText('Home renovation');
    
    // Go to step 2
    await element(by.id('next-button')).tap();
    await expect(element(by.id('step-2'))).toBeVisible();
  });

  it('should navigate to step 3', async () => {
    // Fill step 1
    await element(by.id('loan-type-select')).tap();
    await element(by.text('Personal')).tap();
    await element(by.id('amount-input')).typeText('10000');
    await element(by.id('term-input')).typeText('12');
    await element(by.id('purpose-input')).typeText('Home renovation');
    await element(by.id('next-button')).tap();
    
    // Fill step 2
    await element(by.id('employment-status-select')).tap();
    await element(by.text('Employed')).tap();
    await element(by.id('annual-income-input')).typeText('75000');
    await element(by.id('monthly-expenses-input')).typeText('2000');
    
    // Go to step 3
    await element(by.id('next-button')).tap();
    await expect(element(by.id('step-3'))).toBeVisible();
  });

  it('should go back to previous step', async () => {
    await element(by.id('loan-type-select')).tap();
    await element(by.text('Personal')).tap();
    await element(by.id('next-button')).tap();
    
    await element(by.id('back-button')).tap();
    await expect(element(by.id('step-1'))).toBeVisible();
  });

  it('should validate required fields in step 1', async () => {
    await element(by.id('next-button')).tap();
    
    await expect(element(by.text('Amount is required'))).toBeVisible();
    await expect(element(by.text('Term is required'))).toBeVisible();
  });

  it('should validate required fields in step 2', async () => {
    // Complete step 1
    await element(by.id('loan-type-select')).tap();
    await element(by.text('Personal')).tap();
    await element(by.id('amount-input')).typeText('10000');
    await element(by.id('term-input')).typeText('12');
    await element(by.id('purpose-input')).typeText('Home renovation');
    await element(by.id('next-button')).tap();
    
    // Try to proceed without filling step 2
    await element(by.id('next-button')).tap();
    
    await expect(element(by.text('Annual income is required'))).toBeVisible();
  });

  it('should submit loan application successfully', async () => {
    // Step 1
    await element(by.id('loan-type-select')).tap();
    await element(by.text('Personal')).tap();
    await element(by.id('amount-input')).typeText('10000');
    await element(by.id('term-input')).typeText('12');
    await element(by.id('purpose-input')).typeText('Home renovation');
    await element(by.id('next-button')).tap();
    
    // Step 2
    await element(by.id('employment-status-select')).tap();
    await element(by.text('Employed')).tap();
    await element(by.id('annual-income-input')).typeText('75000');
    await element(by.id('monthly-expenses-input')).typeText('2000');
    await element(by.id('next-button')).tap();
    
    // Step 3 - Review and submit
    await expect(element(by.id('review-summary'))).toBeVisible();
    await element(by.id('terms-checkbox')).tap();
    await element(by.id('submit-button')).tap();
    
    await waitFor(element(by.text('Application submitted successfully')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should display monthly payment calculation', async () => {
    // Complete all steps
    await element(by.id('loan-type-select')).tap();
    await element(by.text('Personal')).tap();
    await element(by.id('amount-input')).typeText('10000');
    await element(by.id('term-input')).typeText('12');
    await element(by.id('purpose-input')).typeText('Home renovation');
    await element(by.id('next-button')).tap();
    
    await element(by.id('employment-status-select')).tap();
    await element(by.text('Employed')).tap();
    await element(by.id('annual-income-input')).typeText('75000');
    await element(by.id('monthly-expenses-input')).typeText('2000');
    await element(by.id('next-button')).tap();
    
    // Check monthly payment is displayed
    await expect(element(by.id('monthly-payment'))).toBeVisible();
  });
});

