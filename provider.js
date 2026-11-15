/**
 * Provider boundary. Exact EnKash request paths, auth signing, response mapping,
 * and webhook verification are NOT supplied. Fill these only from the verified
 * merchant-specific EnKash API documentation; never guess or accept unsigned webhooks.
 */
export async function createPayment({ reference, amountPaise, currency }) {
  void reference; void amountPaise; void currency;
  throw new Error('ENKASH_CREATE_ORDER_NOT_CONFIGURED');
  // Expected: { providerId, intentUrls: { gpay?, phonepe?, paytm?, other? }, qrPayload? }
}
export async function verifyWebhook(rawBody, headers) {
  void rawBody; void headers;
  throw new Error('ENKASH_WEBHOOK_SIGNATURE_NOT_CONFIGURED');
  // Expected: { reference, providerId } after cryptographic verification
}
export async function fetchStatus(providerId) {
  void providerId;
  throw new Error('ENKASH_STATUS_NOT_CONFIGURED');
  // Expected: { status: 'SUCCESS'|'PENDING'|'FAILED', reference, providerId,
  //             amountPaise, currency: 'INR' }
}
