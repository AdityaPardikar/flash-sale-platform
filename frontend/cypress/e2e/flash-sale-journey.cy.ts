/**
 * Flash Sale User Journey E2E Tests
 * Week 5 Day 7: Testing & Quality Assurance
 */

describe('Flash Sale User Journey', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'Test123!',
    name: 'Test User',
  };

  beforeEach(() => {
    cy.visit('/');
  });

  describe('Authentication', () => {
    it('should display login page', () => {
      cy.visit('/login');
      cy.contains('Login').should('be.visible');
      cy.get('input[type="email"]').should('be.visible');
      cy.get('input[type="password"]').should('be.visible');
    });

    it('should register a new user', () => {
      cy.visit('/register');
      cy.get('input[name="name"]').type(testUser.name);
      cy.get('input[type="email"]').type(testUser.email);
      cy.get('input[type="password"]').type(testUser.password);
      cy.get('button[type="submit"]').click();

      // Should redirect after registration
      cy.url().should('not.include', '/register');
    });

    it('should login with valid credentials', () => {
      cy.login(Cypress.env('testUser').email, Cypress.env('testUser').password);
      cy.visit('/');

      // Should show user is logged in
      cy.window().its('localStorage.token').should('exist');
    });

    it('should logout successfully', () => {
      cy.login(Cypress.env('testUser').email, Cypress.env('testUser').password);
      cy.visit('/');

      // Find and click logout
      cy.get('[data-testid="user-menu"]').click();
      cy.get('[data-testid="logout-btn"]').click();

      // Should clear auth
      cy.window().its('localStorage.token').should('not.exist');
    });
  });

  describe('Product Browsing', () => {
    it('should display product list', () => {
      cy.intercept('GET', '**/api/products*').as('getProducts');
      cy.visit('/');
      cy.waitForApi('getProducts');

      cy.get('[data-testid="product-card"]').should('have.length.greaterThan', 0);
    });

    it('should search for products', () => {
      cy.visit('/');
      cy.get('[data-testid="search-input"]').type('test product');
      cy.get('[data-testid="search-btn"]').click();

      // Results should update
      cy.url().should('include', 'search=');
    });

    it('should view product details', () => {
      cy.visit('/');
      cy.get('[data-testid="product-card"]').first().click();

      cy.url().should('include', '/product/');
      cy.get('[data-testid="product-name"]').should('be.visible');
      cy.get('[data-testid="product-price"]').should('be.visible');
    });
  });

  describe('Flash Sale Flow', () => {
    beforeEach(() => {
      cy.login(Cypress.env('testUser').email, Cypress.env('testUser').password);
    });

    it('should display active flash sales', () => {
      cy.intercept('GET', '**/api/flash-sales/active*').as('getActiveSales');
      cy.visit('/sales');
      cy.waitForApi('getActiveSales');

      // Should show sales or empty state
      cy.get('[data-testid="flash-sale-card"], [data-testid="no-sales"]').should('exist');
    });

    it('should show countdown timer for upcoming sales', () => {
      cy.visit('/sales');

      cy.get('[data-testid="flash-sale-card"]')
        .first()
        .within(() => {
          cy.get('[data-testid="countdown-timer"]').should('be.visible');
        });
    });

    it('should join queue for flash sale', () => {
      cy.intercept('POST', '**/api/queue/**/join').as('joinQueue');
      cy.visit('/sales');

      cy.get('[data-testid="flash-sale-card"]')
        .first()
        .within(() => {
          cy.get('[data-testid="join-queue-btn"]').click();
        });

      cy.waitForApi('joinQueue');
      cy.contains('You are in queue').should('be.visible');
    });

    it('should display queue position', () => {
      cy.visit('/queue');

      cy.get('[data-testid="queue-position"]').should('be.visible');
      cy.get('[data-testid="estimated-wait"]').should('be.visible');
    });
  });

  describe('Cart & Checkout', () => {
    beforeEach(() => {
      cy.login(Cypress.env('testUser').email, Cypress.env('testUser').password);
    });

    it('should add product to cart', () => {
      cy.intercept('POST', '**/api/cart').as('addToCart');
      cy.visit('/');

      cy.get('[data-testid="product-card"]')
        .first()
        .within(() => {
          cy.get('[data-testid="add-to-cart-btn"]').click();
        });

      cy.waitForApi('addToCart');
      cy.get('[data-testid="cart-count"]').should('contain', '1');
    });

    it('should update cart quantity', () => {
      cy.addToCart('product-1', 1);
      cy.visit('/cart');

      cy.get('[data-testid="quantity-input"]').clear().type('3');
      cy.get('[data-testid="update-quantity-btn"]').click();

      cy.get('[data-testid="cart-total"]').should('be.visible');
    });

    it('should remove item from cart', () => {
      cy.addToCart('product-1', 1);
      cy.visit('/cart');

      cy.get('[data-testid="remove-item-btn"]').click();
      cy.contains('Your cart is empty').should('be.visible');
    });

    it('should proceed to checkout', () => {
      cy.addToCart('product-1', 1);
      cy.visit('/cart');

      cy.get('[data-testid="checkout-btn"]').click();
      cy.url().should('include', '/checkout');
    });
  });

  describe('Mobile Responsiveness', () => {
    beforeEach(() => {
      cy.viewport('iphone-x');
    });

    it('should display mobile navigation', () => {
      cy.visit('/');
      cy.get('[data-testid="mobile-menu-btn"]').should('be.visible');
    });

    it('should open mobile menu', () => {
      cy.visit('/');
      cy.get('[data-testid="mobile-menu-btn"]').click();
      cy.get('[data-testid="mobile-nav"]').should('be.visible');
    });

    it('should display products in single column', () => {
      cy.visit('/');
      cy.get('[data-testid="product-grid"]')
        .should('have.css', 'grid-template-columns')
        .and('match', /1fr/);
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      cy.visit('/');
      cy.get('h1').should('have.length', 1);
    });

    it('should have alt text for images', () => {
      cy.visit('/');
      cy.get('img').each(($img) => {
        expect($img).to.have.attr('alt');
      });
    });

    it('should be keyboard navigable', () => {
      cy.visit('/');
      cy.get('body').tab();
      cy.focused().should('be.visible');
    });

    it('should have proper form labels', () => {
      cy.visit('/login');
      cy.get('input').each(($input) => {
        const id = $input.attr('id');
        if (id) {
          cy.get(`label[for="${id}"]`).should('exist');
        }
      });
    });
  });
});
