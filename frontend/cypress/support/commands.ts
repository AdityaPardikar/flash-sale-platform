/**
 * Cypress Custom Commands
 * Week 5 Day 7: Testing & Quality Assurance
 */

// Login command
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/auth/login`,
    body: { email, password },
  }).then((response) => {
    expect(response.status).to.eq(200);
    window.localStorage.setItem('token', response.body.token);
    window.localStorage.setItem('user', JSON.stringify(response.body.user));
  });
});

// Register command
Cypress.Commands.add('register', (email: string, password: string, name: string) => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/auth/register`,
    body: { email, password, name },
    failOnStatusCode: false,
  }).then((response) => {
    if (response.status === 201) {
      window.localStorage.setItem('token', response.body.token);
      window.localStorage.setItem('user', JSON.stringify(response.body.user));
    }
  });
});

// Join queue command
Cypress.Commands.add('joinQueue', (saleId: string) => {
  const token = window.localStorage.getItem('token');

  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/queue/${saleId}/join`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).then((response) => {
    expect(response.status).to.eq(200);
  });
});

// Add to cart command
Cypress.Commands.add('addToCart', (productId: string, quantity: number = 1) => {
  const token = window.localStorage.getItem('token');

  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/cart`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: { productId, quantity },
  }).then((response) => {
    expect(response.status).to.eq(200);
  });
});

// Wait for API command
Cypress.Commands.add('waitForApi', (alias: string) => {
  cy.wait(`@${alias}`).its('response.statusCode').should('be.oneOf', [200, 201]);
});

export {};
