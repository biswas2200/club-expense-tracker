/** UPI refs are compared and stored without spaces and in upper case. */
export const normaliseTxnId = (id: string) => id.replace(/\s+/g, '').toUpperCase();
