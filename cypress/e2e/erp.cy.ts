// cypress/e2e/billing.cy.ts

describe('Billing Dashboard E2E Tests', () => {
  // Before each test, visit the page where the billing dashboard is rendered.
  beforeEach(() => {
    // Adjust the URL path as needed.
    cy.visit('/billing');
  });

  it('should render the billing table and main input fields', () => {
    // Check that the billing card loads.
    cy.get('UCard').should('exist');
    // Check that the date and token inputs are visible.
    cy.get('input[type="date"]').should('be.visible');
    cy.get('input[placeholder="Token No"]').should('be.visible');
    // Check that table headers exist.
    cy.get('table').within(() => {
      cy.contains('S.N').should('exist');
      cy.contains('BAR CODE').should('exist');
      cy.contains('CATEGORY').should('exist');
      cy.contains('NAME').should('exist');
      // ... add other header checks as needed.
    });
  });

  it('should add a new row when pressing Enter in the name input', () => {
    // Get initial number of rows in the table (assumed selector for table row; adjust if needed)
    cy.get('table tbody tr').then((rows) => {
      const initialRowCount = rows.length;

      // Type something into the name input of the first row and press Enter.
      // We assume that the UInput for the "name" field is rendered as an input element.
      cy.get('table tbody tr')
        .first()
        .within(() => {
          cy.get('input').eq(0) // Assumed "barcode" input comes first; adjust index for "name" if needed.
            .then(($el) => {
              // If name input is not the first input you may need to use a different query.
              // Here, we find the input that holds the name.
              // For example, if it has a placeholder "Enter name":
              // cy.get('input[placeholder="Enter name"]').type('Test Item{enter}');
              // In absence of a unique attribute, we force the key event.
              cy.wrap($el).focus().type('Test Name{enter}');
            });
        });
      // Assert that a new row got added.
      cy.get('table tbody tr').should('have.length.greaterThan', initialRowCount);
    });
  });

  it('should update row values after entering a barcode and blurring the input', () => {
    // Stub the API call for fetching item data.
    // Adjust the intercept URL and method according to your implementation.
    cy.intercept('GET', '/api/item*', {
      statusCode: 200,
      body: {
        id: 'item123',
        size: 'M',
        variant: {
          id: 'variant123',
          sprice: 50,
          name: 'Variant Name',
          qty: 100,
          sizes: ['S', 'M', 'L'],
          product: {
            name: 'Product Name',
            categoryId: 'cat123'
          }
        }
      },
    }).as('fetchItem');

    // Enter a barcode in the first row's barcode input and trigger blur.
    cy.get('table tbody tr')
      .first()
      .within(() => {
        // Assuming the barcode input is in the second column.
        cy.get('input').eq(1) // adjust the index if needed
          .clear()
          .type('BARCODE123')
          .blur();
      });

    // Wait for the intercept to be called.
    cy.wait('@fetchItem');

    // Verify that the row updates based on the intercepted item data.
    cy.get('table tbody tr')
      .first()
      .within(() => {
        // For example, check that the "name" field in the row now includes the product name.
        cy.contains('Variant Name-Product Name').should('exist');
      });
  });

  it('should update grand total when discount is changed', () => {
    // This test assumes that the subtotal is computed from table rows and that updating
    // the discount input triggers a recalculation of the grand total.
    // Locate the discount input (using ref "discountref" – in rendered output it should be an input)
    cy.get('input[type="number"]').filter('[placeholder="Enter discount"]')
      .as('discountInput');

    // You may need to adjust the query: if the discount input does not have a placeholder,
    // consider adding a data attribute to easily locate it.
    // For example, if you add data-cy="discount-input" to the discount input, then use:
    // cy.get('[data-cy="discount-input"]').as('discountInput');

    // Let’s assume the initial subtotal is not 0, and the grandTotal is updated in a disabled input.
    // First, get the initial grand total value.
    cy.get('input[disabled]').filter('[value]').first().invoke('val').then((initialGrandTotal) => {
      // Type a discount value, for example 10%.
      cy.get('@discountInput').clear().type('10{enter}');
      // Wait a moment for computed recalculation.
      cy.wait(500);
      // The grand total field should now show a value different from the initial one.
      cy.get('input[disabled]').filter('[value]').first().invoke('val').should((newGrandTotal) => {
        expect(newGrandTotal).not.to.equal(initialGrandTotal);
      });
    });
  });

  it('should open Add Account modal, fill in the form, and submit successfully', () => {
    // Intercept the CreateAccount API request.
    cy.intercept('POST', '/api/CreateAccount', {
      statusCode: 200,
      body: { id: 'account123' },
    }).as('createAccount');

    // Click the button to add account. Adjust the selector if needed.
    cy.contains('Add Account').click();

    // The modal should become visible.
    cy.get('UModal').should('be.visible');

    // Fill in the account details.
    // Adjust the selectors if you decide to add data attributes such as [data-cy="account-name"].
    cy.get('UModal').within(() => {
      cy.get('input[placeholder="Enter full name"]')
        .first().type('Test Account');
      cy.get('input[placeholder="Enter full name"]').eq(1).type('1234567890'); // Phone number
      cy.get('input[placeholder="Enter street name"]').type('Test Street');
      cy.get('input[placeholder="Enter locality"]').type('Test Locality');
      cy.get('input[placeholder="Enter city name"]').type('Test City');
      cy.get('input[placeholder="Enter state name"]').type('Test State');
      cy.get('input[placeholder="Enter pincode"]').type('123456');
      // Submit the form.
      cy.contains('Submit').click();
    });

    // Wait for the API request to finish.
    cy.wait('@createAccount');

    // A toast message should appear.
    cy.contains('Account added !').should('exist');
    // Optionally, check that the modal closed.
    cy.get('UModal').should('not.exist');
  });

  it('should open token modal, add token entries, and submit token entries', () => {
    // Intercept the token entry creation API call.
    cy.intercept('POST', '/api/CreateTokenEntry', {
      statusCode: 200,
      body: { success: true },
    }).as('createTokenEntry');

    // Open the token entries modal by clicking its button.
    cy.contains('Token Entries').click();

    // Verify the modal is visible.
    cy.get('UModal').should('be.visible');

    // Within the token modal, type a token number.
    cy.get('UModal').within(() => {
      // Assuming token input is the first input within the modal.
      cy.get('input[type="text"]').first().type('TOKEN123{enter}');
      // Simulate adding another token entry.
      cy.contains('Add').click();
      // Now fill the newly added token.
      // Here, we assume that the token inputs are rendered in a list.
      cy.get('input[type="text"]').last().type('TOKEN456{enter}');
      // Submit the token form.
      cy.contains('Submit').click();
    });

    // Wait for token API calls (if multiple calls, we can wait on the alias).
    cy.wait('@createTokenEntry');

    // Optionally, verify that the modal is closed or that the billing table got updated.
    cy.get('UModal').should('not.exist');
  });

  it('should allow resizing a column via draggable divider', () => {
    // Locate the first draggable divider element inside a table header.
    // Adjust the selector as needed based on your implementation.
    cy.get('table thead th')
      .first()
      .within(() => {
        cy.get('div.cursor-col-resize')
          .as('draggableDivider');
      });

    // Get the initial width of the first header cell.
    cy.get('table thead th').first().invoke('width').then((initialWidth) => {
      // Simulate mousedown, mousemove, and mouseup events to resize the column.
      cy.get('@draggableDivider').trigger('mousedown', { which: 1, pageX: 100 });
      cy.document().trigger('mousemove', { pageX: 150 });
      cy.document().trigger('mouseup');

      // Wait for a brief moment and verify that the header width has increased.
      cy.get('table thead th').first().invoke('width').should((newWidth) => {
        expect(newWidth).to.be.greaterThan(initialWidth);
      });
    });
  });
});
