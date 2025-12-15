describe('Login Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should show login screen on launch', async () => {
    await expect(element(by.id('login-screen'))).toBeVisible();
    await expect(element(by.id('email-input'))).toBeVisible();
    await expect(element(by.id('password-input'))).toBeVisible();
    await expect(element(by.id('login-button'))).toBeVisible();
  });

  it('should show error for invalid credentials', async () => {
    await element(by.id('email-input')).typeText('invalid@email.com');
    await element(by.id('password-input')).typeText('wrongpassword');
    await element(by.id('login-button')).tap();

    await waitFor(element(by.text('Invalid credentials')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should login successfully with valid credentials', async () => {
    await element(by.id('email-input')).typeText('demo@neobank.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();

    await waitFor(element(by.id('dashboard-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should navigate to registration screen', async () => {
    await element(by.id('register-link')).tap();
    await expect(element(by.id('register-screen'))).toBeVisible();
  });

  it('should navigate to forgot password screen', async () => {
    await element(by.id('forgot-password-link')).tap();
    await expect(element(by.id('forgot-password-screen'))).toBeVisible();
  });

  it('should validate email format', async () => {
    await element(by.id('email-input')).typeText('invalidemail');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();

    await expect(element(by.text('Email is invalid'))).toBeVisible();
  });

  it('should require password', async () => {
    await element(by.id('email-input')).typeText('test@email.com');
    await element(by.id('login-button')).tap();

    await expect(element(by.text('Password is required'))).toBeVisible();
  });
});

