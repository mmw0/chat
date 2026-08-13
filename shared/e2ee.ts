export const E2EE_ENVELOPE_PREFIX = "oc1";
export const E2EE_ENVELOPE_PATTERN = /^oc1\.[1-9][0-9]{0,9}\.[A-Za-z0-9_-]{16,128}\.[A-Za-z0-9_-]{16,24000}\.[A-Za-z0-9_-]{64,256}$/;

export function isOrbitEncryptedEnvelope(value: string) {
  return E2EE_ENVELOPE_PATTERN.test(value);
}

export function getCiphertextPlaceholder(value: string) {
  return isOrbitEncryptedEnvelope(value) ? "Encrypted signal" : value;
}
