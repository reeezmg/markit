describe('Quote create select actions', () => {
  it('renders create actions for no-match customer, salesperson, and project searches', () => {
    cy.visit('/quotes/add')

    cy.contains('New Quote', { timeout: 20000 }).should('be.visible')

    cy.contains('button', 'Select or add a customer').click()
    cy.get('input[role="combobox"]').last().type('No Match Customer 987')
    cy.contains('button', "Create customer 'No Match Customer 987'").should('be.visible')
    cy.get('body').type('{esc}')

    cy.contains('button', 'Select or add salesperson').click()
    cy.get('input[role="combobox"]').last().type('No Match Salesperson 987')
    cy.contains('button', "Create salesperson 'No Match Salesperson 987'").should('be.visible')
    cy.get('body').type('{esc}')

    cy.contains('button', 'Select a project').click()
    cy.get('input[role="combobox"]').last().type('No Match Project 987')
    cy.contains('button', "Create project 'No Match Project 987'").should('be.visible')
  })
})
