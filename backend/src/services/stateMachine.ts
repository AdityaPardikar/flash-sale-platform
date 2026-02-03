import pool from '../utils/database';
import { FlashSale } from '../models';
import { saleTimingService } from './saleTimingService';

type SaleStatus = 'upcoming' | 'active' | 'completed' | 'cancelled';

// State transition rules for flash sales
interface StateTransition {
  from: SaleStatus;
  to: SaleStatus;
  condition?: (sale: FlashSale) => boolean;
  beforeTransition?: (sale: FlashSale) => Promise<void>;
  afterTransition?: (sale: FlashSale) => Promise<void>;
}

interface TransitionResult {
  success: boolean;
  previousState: SaleStatus;
  newState: SaleStatus;
  message: string;
  error?: string;
}

// Define valid state transitions
const VALID_TRANSITIONS: StateTransition[] = [
  {
    from: 'upcoming',
    to: 'active',
    condition: (sale: FlashSale) => saleTimingService.shouldActivate(sale),
    beforeTransition: async (sale: FlashSale) => {
      // Could initialize additional resources here
      console.log(`Activating sale (ID: ${sale.id})`);
    },
    afterTransition: async (sale: FlashSale) => {
      // Could trigger notifications or other side effects
      console.log(`Sale activated (ID: ${sale.id})`);
    },
  },
  {
    from: 'active',
    to: 'completed',
    condition: (sale: FlashSale) => saleTimingService.shouldComplete(sale),
    beforeTransition: async (sale: FlashSale) => {
      console.log(`Completing sale (ID: ${sale.id})`);
    },
    afterTransition: async (sale: FlashSale) => {
      // Could cleanup resources or finalize analytics
      console.log(`Sale completed (ID: ${sale.id})`);
    },
  },
  {
    from: 'upcoming',
    to: 'cancelled',
    condition: () => true, // Manual cancellation always allowed
  },
  {
    from: 'active',
    to: 'cancelled',
    condition: () => true, // Manual cancellation always allowed
  },
];

class StateMachine {
  /**
   * Check if a state transition is valid
   */
  canTransition(currentState: SaleStatus, targetState: SaleStatus, sale?: FlashSale): boolean {
    const transition = VALID_TRANSITIONS.find(
      (t) => t.from === currentState && t.to === targetState
    );

    if (!transition) {
      return false;
    }

    // If a condition is defined and sale is provided, check the condition
    if (transition.condition && sale) {
      return transition.condition(sale);
    }

    return true;
  }

  /**
   * Get all valid transitions from the current state
   */
  getValidTransitions(currentState: SaleStatus, sale?: FlashSale): SaleStatus[] {
    return VALID_TRANSITIONS.filter((t) => t.from === currentState)
      .filter((t) => !t.condition || !sale || t.condition(sale))
      .map((t) => t.to);
  }

  /**
   * Transition a sale to a new state
   */
  async transition(
    saleId: string,
    targetState: SaleStatus,
    reason?: string
  ): Promise<TransitionResult> {
    try {
      // Fetch the current sale
      const saleQuery = await pool.query<FlashSale>('SELECT * FROM flash_sales WHERE id = $1', [
        saleId,
      ]);

      if (saleQuery.rows.length === 0) {
        return {
          success: false,
          previousState: 'upcoming',
          newState: 'upcoming',
          message: 'Sale not found',
          error: 'Sale not found',
        };
      }

      const sale = saleQuery.rows[0];
      const currentState = sale.status;

      // Check if transition is valid
      if (!this.canTransition(currentState, targetState, sale)) {
        return {
          success: false,
          previousState: currentState,
          newState: currentState,
          message: `Cannot transition from ${currentState} to ${targetState}`,
          error: 'Invalid state transition',
        };
      }

      // Find the transition rule
      const transition = VALID_TRANSITIONS.find(
        (t) => t.from === currentState && t.to === targetState
      );

      // Execute before transition hook
      if (transition?.beforeTransition) {
        await transition.beforeTransition(sale);
      }

      // Perform the state transition in database
      const updateQuery = `
        UPDATE flash_sales 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await pool.query<FlashSale>(updateQuery, [targetState, saleId]);
      const updatedSale = result.rows[0];

      // Execute after transition hook
      if (transition?.afterTransition) {
        await transition.afterTransition(updatedSale);
      }

      return {
        success: true,
        previousState: currentState,
        newState: targetState,
        message: reason || `Successfully transitioned from ${currentState} to ${targetState}`,
      };
    } catch (error) {
      console.error('State transition error:', error);
      return {
        success: false,
        previousState: 'upcoming',
        newState: 'upcoming',
        message: 'State transition failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Apply automatic transitions based on timing conditions
   */
  async applyAutomaticTransitions(sale: FlashSale): Promise<TransitionResult | null> {
    const currentState = sale.status;

    // Check if sale should be activated
    if (currentState === 'upcoming' && saleTimingService.shouldActivate(sale)) {
      return await this.transition(sale.id, 'active', 'Automatic activation based on start time');
    }

    // Check if sale should be completed
    if (currentState === 'active' && saleTimingService.shouldComplete(sale)) {
      return await this.transition(sale.id, 'completed', 'Automatic completion based on end time');
    }

    return null;
  }

  /**
   * Batch process state transitions for multiple sales
   */
  async batchTransition(sales: FlashSale[]): Promise<{
    successful: TransitionResult[];
    failed: TransitionResult[];
  }> {
    const results = await Promise.all(sales.map((sale) => this.applyAutomaticTransitions(sale)));

    const successful: TransitionResult[] = [];
    const failed: TransitionResult[] = [];

    results.forEach((result) => {
      if (result) {
        if (result.success) {
          successful.push(result);
        } else {
          failed.push(result);
        }
      }
    });

    return { successful, failed };
  }

  /**
   * Get the state machine diagram as a string
   */
  getStateDiagram(): string {
    return `
Flash Sale State Machine:

  upcoming ──────────> active ──────────> completed
      │                   │
      │                   │
      └───────────────────┴──────────> cancelled

Valid Transitions:
  - upcoming → active (when start_time is reached)
  - active → completed (when end_time is reached)
  - upcoming → cancelled (manual cancellation)
  - active → cancelled (manual cancellation)
    `;
  }

  /**
   * Validate state consistency across all sales
   */
  async validateAllStates(): Promise<{
    valid: number;
    needsUpdate: FlashSale[];
  }> {
    try {
      const query = `
        SELECT * FROM flash_sales 
        WHERE status IN ('upcoming', 'active')
        ORDER BY start_time ASC
      `;

      const result = await pool.query<FlashSale>(query);
      const sales = result.rows;

      const needsUpdate: FlashSale[] = [];

      for (const sale of sales) {
        const shouldBeActive = sale.status === 'upcoming' && saleTimingService.shouldActivate(sale);
        const shouldBeCompleted =
          sale.status === 'active' && saleTimingService.shouldComplete(sale);

        if (shouldBeActive || shouldBeCompleted) {
          needsUpdate.push(sale);
        }
      }

      return {
        valid: sales.length - needsUpdate.length,
        needsUpdate,
      };
    } catch (error) {
      console.error('State validation error:', error);
      return {
        valid: 0,
        needsUpdate: [],
      };
    }
  }
}

// Export singleton instance
export const stateMachine = new StateMachine();
export { StateMachine };
export type { StateTransition, TransitionResult };
