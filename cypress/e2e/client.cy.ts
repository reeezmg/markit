describe('Client Management - E2E Tests', () => {
  beforeEach(() => {
    cy.login(); // Assuming a custom login function for authentication
    cy.visit('/clients'); // Navigate to the client management page
  });

  it('should display clients table with correct columns', () => {
    cy.get('table').should('exist');
    cy.get('table th').should('have.length', 4); // Checking for 4 columns (Name, Status, Pipeline, Actions)
    cy.get('table th').eq(0).should('have.text', 'name');
    cy.get('table th').eq(1).should('have.text', 'Status');
    cy.get('table th').eq(2).should('have.text', 'Pipeline');
    cy.get('table th').eq(3).should('have.text', 'Actions');
  });

  it('should allow filtering by client status', () => {
    cy.get('input[placeholder="Search..."]').type('Client Name'); // Type search keyword
    cy.get('select').eq(0).select('Active'); // Select 'Active' status filter
    cy.get('table tr').should('have.length.greaterThan', 0); // Ensure filtered results appear
    cy.get('table tr td').first().should('contain.text', 'Client Name'); // Check the client is in the result
  });

  it('should allow pagination', () => {
    cy.get('select.w-20').select('5'); // Select 5 rows per page
    cy.get('table tr').should('have.length', 5); // Verify only 5 rows are displayed per page
    cy.get('button[aria-label="Next"]').click(); // Click Next for pagination
    cy.url().should('include', 'page=2'); // Ensure URL reflects the next page
  });

  it('should toggle client status correctly', () => {
    const clientId = 'some-client-id'; // Use a valid client ID from the fixture or setup
    cy.get(`tr[data-id="${clientId}"]`).find('button').click(); // Open actions dropdown
    cy.get('button[aria-label="Toggle status"]').click(); // Click to toggle status
    cy.get(`tr[data-id="${clientId}"]`).should('contain', 'Active'); // Verify the status changed
  });

  it('should update pipeline status for a client', () => {
    const clientId = 'some-client-id';
    cy.get(`tr[data-id="${clientId}"]`).find('button').click(); // Open actions dropdown
    cy.get('button[aria-label="Change pipeline"]').click(); // Click pipeline change option
    cy.get('button[aria-label="New"]').click(); // Select 'New' pipeline option
    cy.get(`tr[data-id="${clientId}"]`).should('contain', 'New'); // Verify the pipeline status updated
  });

  it('should allow client addition', () => {
    cy.get('button[label="Add Client"]').click(); // Click on 'Add Client' button
    cy.url().should('include', '/clients/add'); // Ensure it navigates to the Add Client page
    cy.get('input[name="name"]').type('New Client'); // Fill out client name
    cy.get('input[name="email"]').type('newclient@example.com'); // Fill out client email
    cy.get('button[type="submit"]').click(); // Submit form
    cy.get('table').should('contain', 'New Client'); // Verify the new client appears in the table
  });

  it('should allow client deletion', () => {
    const clientId = 'some-client-id'; // Use valid client ID
    cy.get(`tr[data-id="${clientId}"]`).find('button').click(); // Open actions dropdown
    cy.get('button[aria-label="Delete"]').click(); // Click delete button
    cy.get('button[aria-label="Confirm Delete"]').click(); // Confirm delete
    cy.get('table').should('not.contain', clientId); // Verify client was deleted
  });

  it('should handle multi-toggle actions', () => {
    const clientIds = ['client1-id', 'client2-id']; // Use valid client IDs
    cy.get('input[type="checkbox"]').check(); // Select multiple clients
    cy.get('button[aria-label="Mark as Active"]').click(); // Click 'Mark as Active'
    cy.get('table').should('contain', 'Active'); // Ensure the clients' status is now active
  });

  it('should reset filters', () => {
    cy.get('input[placeholder="Search..."]').type('Client');
    cy.get('select').eq(0).select('Inactive');
    cy.get('button[aria-label="Reset"]').click(); // Click reset button
    cy.get('input[placeholder="Search..."]').should('have.value', ''); // Verify search input is cleared
    cy.get('select').eq(0).should('have.value', ''); // Verify status is reset
  });
});
