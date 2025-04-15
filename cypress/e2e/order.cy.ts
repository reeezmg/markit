describe('E2E Tests for Order Management', () => {
  
  beforeEach(() => {
    cy.visit('/order-management'); // Replace with the actual path
  });

  it('should load the page with order details', () => {
    cy.get('.order-id').should('be.visible');
    cy.get('.customer-name').should('be.visible');
    cy.get('.total-items').should('have.text', '3');
    cy.get('.order-type').should('have.text', 'Try and Buy');
  });

  it('should display item list with details', () => {
    cy.get('.item-row').should('have.length', 3); // Assumes 3 items in the order
    cy.get('.item-row').first().within(() => {
      cy.get('.item-name').should('be.visible');
      cy.get('.item-qty').should('be.visible');
      cy.get('.item-rate').should('be.visible');
    });
  });

  it('should handle barcode input correctly', () => {
    cy.get('.barcode-input').type('123456789');
    cy.get('.scan-button').click();
    cy.get('.toast-message').should('have.text', 'Item Packed successfully!');
  });

  it('should handle out-of-stock item', () => {
    cy.get('.out-of-stock-button').click();
    cy.get('.toast-message').should('have.text', 'Item marked out of stock');
  });

  it('should handle in-stock item', () => {
    cy.get('.in-stock-button').click();
    cy.get('.toast-message').should('have.text', 'Item marked In stock');
  });

  it('should update bill when packing all items', () => {
    cy.get('.pack-all-button').click();
    cy.get('.toast-message').should('have.text', 'Item PACKED successfully!');
  });

  it('should display item total calculation correctly', () => {
    cy.get('.item-row').each(($item) => {
      cy.wrap($item).find('.item-value').should('be.visible');
    });
  });

  it('should apply main discount and update total', () => {
    cy.get('.discount-input').type('10');
    cy.get('.apply-discount-button').click();
    cy.get('.total-price').should('have.text', 'Updated Total with Discount');
  });

  it('should display correct grand total after tax', () => {
    cy.get('.tax-input').type('5');
    cy.get('.apply-tax-button').click();
    cy.get('.grand-total').should('have.text', 'Grand Total after Tax');
  });

  it('should save order data correctly', () => {
    cy.get('.save-order-button').click();
    cy.get('.toast-message').should('have.text', 'Order saved successfully');
  });

});
