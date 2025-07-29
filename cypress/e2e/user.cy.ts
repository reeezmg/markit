// cypress/e2e/user-management.cy.ts

describe('User Management Dashboard', () => {
  beforeEach(() => {
    cy.login(); // custom command to login
    cy.visit('/users'); // adjust to correct route
  });

  it('displays the user table', () => {
    cy.get('table').should('exist');
    cy.get('th').contains('name');
    cy.get('th').contains('email');
    cy.get('th').contains('role');
  });

  it('searches for a user by name', () => {
    cy.get('input[placeholder="Search..."]').type('John');
    cy.get('table').should('contain', 'John');
  });

  it('filters users by status', () => {
    cy.get('button').contains('Status').click();
    cy.get('li').contains('Active').click();
    cy.get('table').should('contain', 'Active');
  });

  it('opens add user modal and creates a new user', () => {
    cy.get('button').contains('Add user').click();
    cy.get('input[type="email"]').type('testuser@example.com');
    cy.get('input[type="text"]').type('Test User');
    cy.get('button').contains('Role').click();
    cy.get('li').contains('User').click();
    cy.get('button').contains('Submit').click();
    cy.get('table').should('contain', 'testuser@example.com');
  });

  it('paginates through user list', () => {
    cy.get('select').select('3');
    cy.get('table tbody tr').should('have.length.lte', 3);
    cy.get('button').contains('Next').click();
    cy.get('table tbody tr').should('exist');
  });

  it('edits a user', () => {
    cy.get('button').contains('Actions').first().click();
    cy.get('li').contains('Edit').click();
    cy.url().should('include', '/products/edit/');
  });

  it('toggles user status', () => {
    cy.get('button').contains('Actions').first().click();
    cy.get('li').contains('Edit').click();
    cy.get('input[type="checkbox"]').first().click(); // Assuming Switch
    cy.get('button').contains('Save').click();
  });

  it('performs bulk activate action', () => {
    cy.get('table tbody input[type="checkbox"]').first().check();
    cy.get('table tbody input[type="checkbox"]').eq(1).check();
    cy.get('button').contains('Mark as').click();
    cy.get('li').contains('Active').click();
    cy.get('table').should('contain', 'Active');
  });

  it('allows column visibility toggling', () => {
    cy.get('button').contains('Columns').click();
    cy.get('li').contains('Email').click();
    cy.get('th').contains('email').should('not.exist');
  });

  it('resets filters', () => {
    cy.get('input[placeholder="Search..."]').type('random');
    cy.get('button').contains('Status').click();
    cy.get('li').contains('Inactive').click();
    cy.get('button').contains('Reset').click();
    cy.get('input[placeholder="Search..."]').should('have.value', '');
  });
});
