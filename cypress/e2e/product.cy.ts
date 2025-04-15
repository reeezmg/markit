describe('E2E Tests for Category Creation', () => {

  beforeEach(() => {
    cy.login(); // Assuming a custom login command to authenticate
    cy.visit('/category/create'); // Replace with actual URL for category creation
  });

  it('should load the page with quick links', () => {
    cy.get('.text-lg').should('have.text', 'Quick Links');
    cy.get('.text-primary').should('be.visible');
    cy.get('.text-gray-500').should('be.visible');
  });

  it('should navigate to the Create section when clicking on Quick Links', () => {
    cy.get('ULink').contains('Create').click();
    cy.get('#Create').should('be.visible');
  });

  it('should fill in category form and submit successfully', () => {
    cy.get('input[name="name"]').type('Test Category');
    cy.get('input[name="hsn"]').type('1234');
    cy.get('textarea[name="description"]').type('Category description');
    
    // Simulate file upload
    cy.fixture('image.png', 'base64').then(fileContent => {
      cy.get('input[type="file"]').upload({ fileContent, fileName: 'image.png', mimeType: 'image/png' });
    });

    cy.get('button[type="submit"]').click();
    cy.get('.toast-message').should('have.text', 'Category added !');
    cy.url().should('include', '/products/categories'); // Assuming it redirects to the categories list
  });

  it('should add subcategory and delete it', () => {
    cy.get('button').contains('Sub Category').click();
    cy.get('input[name="subcategory-name"]').type('Test Subcategory');
    cy.get('input[name="subcategory-hsn"]').type('5678');
    cy.get('textarea[name="subcategory-description"]').type('Subcategory description');

    cy.get('button').contains('Finish').click();
    cy.get('.subcategory-list').should('contain', 'Test Subcategory');

    cy.get('.delete-subcategory-button').click(); // Assuming a delete button is available
    cy.get('.subcategory-list').should('not.contain', 'Test Subcategory');
  });

  it('should show validation errors when submitting with missing required fields', () => {
    cy.get('button[type="submit"]').click();
    cy.get('.error-message').should('be.visible');
  });

  it('should update category value when input is changed', () => {
    cy.get('input[name="name"]').clear().type('Updated Category');
    cy.get('input[name="hsn"]').clear().type('9999');
    cy.get('textarea[name="description"]').clear().type('Updated description');
    
    cy.get('button[type="submit"]').click();
    cy.get('.toast-message').should('have.text', 'Category updated successfully!');
  });

  it('should trigger AWS file upload on file selection and show success message', () => {
    cy.fixture('image.png', 'base64').then(fileContent => {
      cy.get('input[type="file"]').upload({ fileContent, fileName: 'image.png', mimeType: 'image/png' });
    });
    cy.get('.aws-upload-status').should('have.text', 'File uploaded successfully');
  });

  it('should handle subcategory deletion', () => {
    cy.get('button').contains('Sub Category').click();
    cy.get('button').contains('Delete').click();
    cy.get('.subcategory-list').should('not.contain', 'Test Subcategory');
  });

});
