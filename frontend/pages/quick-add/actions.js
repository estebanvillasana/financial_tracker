/**
 * Quick Add — Actions (save, loop control).
 *
 * Handles the movement creation via POST /movements and the
 * add-another loop logic.
 */

import { movements } from '../../services/api.js';
import { FeedbackBanner } from '../../components/dumb/feedbackBanner/feedbackBanner.js';

/**
 * Saves the current flow values as a new movement.
 *
 * @param {object} flow         - Flow instance
 * @param {object} state        - Page state
 * @param {HTMLElement} feedbackEl
 * @returns {Promise<object|null>} The created movement or null on failure
 */
async function saveMovement(flow, state, feedbackEl) {
  const payload = flow.buildPayload(state.selectedAccountId);

  try {
    const result = await movements.create(payload);
    return result;
  } catch (error) {
    FeedbackBanner.render(feedbackEl, error?.message || 'Failed to save movement.');
    return null;
  }
}

export { saveMovement };
