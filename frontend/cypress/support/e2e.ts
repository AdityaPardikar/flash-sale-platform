/**
 * Cypress E2E Support File
 * Week 5 Day 7: Testing & Quality Assurance
 */

// Import commands
import './commands';

// Global hooks
beforeEach(() => {
  // Clear local storage before each test
  cy.clearLocalStorage();

  // Clear cookies
  cy.clearCookies();
});

// Handle uncaught exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
  // Log the error but don't fail the test
  console.error('Uncaught exception:', err.message);
  return false;
});

// Custom type definitions
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom login command
       */
      login(email: string, password: string): Chainable<void>;

      /**
       * Custom register command
       */
      register(email: string, password: string, name: string): Chainable<void>;

      /**
       * Join flash sale queue
       */
      joinQueue(saleId: string): Chainable<void>;

      /**
       * Add product to cart
       */
      addToCart(productId: string, quantity?: number): Chainable<void>;

      /**
       * Wait for API response
       */
      waitForApi(alias: string): Chainable<void>;
    }
  }
}
