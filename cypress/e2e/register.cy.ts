describe('Registration Form', () => {
    beforeEach(() => {
        // Visit the registration page before each test
        cy.visit('/register');
    });

    it('should load the registration form correctly', () => {
        // Ensure that the form fields are visible and the submit button is present
        cy.get('input[name="email"]').should('be.visible');
        cy.get('input[name="name"]').should('be.visible');
        cy.get('input[name="companyname"]').should('be.visible');
        cy.get('input[name="password"]').should('be.visible');
        cy.get('input[name="confirmPassword"]').should('be.visible');
        cy.get('select[name="selectMenu"]').should('be.visible');
        cy.get('button[type="submit"]').should('be.visible');
    });

    it('should show validation errors when form is submitted with empty fields', () => {
        // Try submitting the form without filling any data
        cy.get('button[type="submit"]').click();

        // Check if validation errors are shown
        cy.contains('Email is required').should('be.visible');
        cy.contains('Password must be at least 6 characters long').should('be.visible');
        cy.contains('Passwords do not match').should('not.exist'); // because no password is entered
    });

    it('should show password mismatch error when passwords do not match', () => {
        // Fill in the form fields with mismatched passwords
        cy.get('input[name="email"]').type('test@example.com');
        cy.get('input[name="name"]').type('John Doe');
        cy.get('input[name="companyname"]').type('My Company');
        cy.get('input[name="password"]').type('password123');
        cy.get('input[name="confirmPassword"]').type('password321');

        // Submit the form
        cy.get('button[type="submit"]').click();

        // Check if the error message for password mismatch is shown
        cy.contains('Passwords do not match').should('be.visible');
    });

    it('should submit the form successfully when valid data is entered', () => {
        // Mock the `authRegister` function to simulate successful registration
        cy.window().then((window) => {
            cy.stub(window, 'authRegister').resolves({ success: true });
        });

        // Fill in the form fields with valid data
        cy.get('input[name="email"]').type('test@example.com');
        cy.get('input[name="name"]').type('John Doe');
        cy.get('input[name="companyname"]').type('My Company');
        cy.get('input[name="password"]').type('password123');
        cy.get('input[name="confirmPassword"]').type('password123');
        cy.get('select[name="selectMenu"]').select('buyer');

        // Submit the form
        cy.get('button[type="submit"]').click();

        // Check if the form submission was successful
        cy.contains('Submitted').should('be.visible');
    });

    it('should show error message when API request fails during form submission', () => {
        // Mock the `authRegister` function to simulate an error response
        cy.window().then((window) => {
            cy.stub(window, 'authRegister').rejects(new Error('API error'));
        });

        // Fill in the form fields with valid data
        cy.get('input[name="email"]').type('test@example.com');
        cy.get('input[name="name"]').type('John Doe');
        cy.get('input[name="companyname"]').type('My Company');
        cy.get('input[name="password"]').type('password123');
        cy.get('input[name="confirmPassword"]').type('password123');
        cy.get('select[name="selectMenu"]').select('buyer');

        // Submit the form
        cy.get('button[type="submit"]').click();

        // Check if the error message is shown
        cy.contains('Something went wrong').should('be.visible');
    });

    it('should display terms of service link correctly', () => {
        // Check if the "Terms of Service" link is visible and works
        cy.contains('Terms of Service').should('be.visible');
        cy.contains('Terms of Service').click();

        // Check if the URL contains the correct route for the terms of service
        cy.url().should('include', '/terms');
    });

    it('should validate email format correctly', () => {
        // Enter an invalid email format
        cy.get('input[name="email"]').type('invalid-email');
        cy.get('button[type="submit"]').click();

        // Check if the email validation error is shown
        cy.contains('Invalid email format').should('be.visible');
    });

    it('should ensure company type selection is required', () => {
        // Fill in the form but leave the company type field empty
        cy.get('input[name="email"]').type('test@example.com');
        cy.get('input[name="name"]').type('John Doe');
        cy.get('input[name="companyname"]').type('My Company');
        cy.get('input[name="password"]').type('password123');
        cy.get('input[name="confirmPassword"]').type('password123');
        
        // Try to submit the form
        cy.get('button[type="submit"]').click();

        // Check if the company type validation error is shown
        cy.contains('Select company type').should('be.visible');
    });
});
