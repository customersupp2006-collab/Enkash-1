/**
 * EnKash adapter boundary.
 * Never invent provider endpoints or webhook signing algorithms.
 * Implement these methods only after obtaining verified EnKash API documentation.
 */
export async function createPayment(_input) {
  throw new Error('EnKash createPayment is not configured. Obtain verified API contract first.');
}

export async function verifyWebhook(_rawBody, _headers) {
  throw new Error('EnKash webhook verification is not configured. Never trust unsigned callbacks.');
}

export async function fetchStatus(_providerId) {
  throw new Error('EnKash transaction status verification is not configured.');
}
