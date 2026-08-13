# Orbit Chat Security Model

## Direct-message confidentiality

New direct messages sent after both approved contacts complete secure-device setup are encrypted in the browser before transmission. Orbit stores a versioned ciphertext envelope, not the message plaintext. The envelope uses a browser-held P-256 ECDH device key to derive an AES-256-GCM conversation key and an Ed25519 device key to authenticate the envelope. The service stores only public keys, ciphertext, routing metadata, and necessary account data.

## Important boundaries

Orbit supports **explicit multi-device registration**. The browser retains each device’s private keys as non-extractable Web Crypto keys in IndexedDB. Clearing browser/site data or changing browsers can make history encrypted for a lost key unreadable. Orbit intentionally refuses to silently replace a published device key because doing so could hide a key-substitution attack.

When a user has lost access to the local key, Orbit offers an explicit **Secure device recovery** dialog rather than an interrupting mismatch alert. Recovery requires the current account password and a deliberate confirmation. It replaces the public keys for that account only; it does not recover messages encrypted to the missing private key. Browser device records are scoped per Orbit account, avoiding accidental key reuse when multiple people sign into the same browser.

## Multi-device pairing and auditability

An already authenticated browser creates a cryptographically random, opaque pairing token that expires after ten minutes. A joining browser must first sign in to the **same Orbit account**, submit its own P-256/Ed25519 public keys and device fingerprint with that token, and remain pending until an existing signed-in device explicitly approves or rejects the request. The service rejects attempts from a different authenticated account without exposing whether a token exists.

Approval creates an active secure-device record and an append-only `paired` public-key history event. Revocation leaves the device record and public-key history intact, marks that device revoked, and appends a `revoked` event. Orbit protects the final active device from revocation, preventing an account from accidentally removing every active secure session. The Settings screen shows current/revoked device records, pending approvals, and recent key-history events.

Pairing **does not export, copy, or escrow a browser private key**. It also does not retroactively decrypt messages that were encrypted to an unavailable private key. Users should treat the displayed fingerprint as a security identity and compare it out of band for stronger assurance.

E2EE protects message **content** from the message service and passive network observers when the application is served faithfully over HTTPS. It does not hide metadata such as the two participants, message timing, approximate ciphertext size, contact graph, or IP information handled by infrastructure. It also cannot protect a device compromised by malware, an unlocked device, screenshots, notification previews outside Orbit, or a malicious application update delivered by a service that controls the web client. Users should compare device fingerprints out of band for strong key-authentication assurance.

## Privacy behavior

The service rejects plaintext sends from an account that has completed secure-device setup. Server-side search is disabled for E2EE-ready chats so private search terms are not sent to the service. Pins, saves, replies, and archives persist references and ciphertext only. Legacy messages created before E2EE remain legacy plaintext until they are individually removed; they are not retroactively encrypted.

## Browser capability check

The supported Orbit browser runtime was verified to provide Web Crypto P-256 ECDH, Ed25519 signing, and IndexedDB. These are required before secure-device setup can activate. Browsers that lack these primitives must not be treated as E2EE-capable.

Orbit’s device-identity module was also exercised in the browser: it produced a 24-character public-key fingerprint, P-256 and Ed25519 public-key metadata, and non-extractable private `CryptoKey` handles for both encryption and signing. Non-extractable browser keys reduce accidental export exposure, but do not protect against a compromised or unlocked browser device.

Repeated secure-device reads in the same browser returned the same fingerprint and retained non-extractable private keys, confirming that Orbit reuses its browser-held identity rather than silently rotating it during a session.

The browser implementation was exercised with an Orbit-generated envelope and a simulated peer device. The peer derived the same conversation key, recovered the original test plaintext, and verified the Ed25519 message signature. This confirms the implemented envelope format, AES-GCM additional data binding, HKDF context binding, and signature payload are internally consistent in the supported runtime.

## Live activation review

After migration `0009_peaceful_sugar_man.sql` was applied, a fresh authenticated browser session successfully published its secure-device public keys and transitioned from **Securing device** to **Secure device**. The visible status panel displayed the device fingerprint and accurately disclosed metadata and endpoint-compromise limitations rather than claiming absolute secrecy.

Two disposable secure-device accounts completed the approved-contact workflow. A browser-generated ciphertext envelope was accepted by the live `chat.sendMessage` endpoint, stored with an `oc1` envelope prefix, retrieved through the normal conversation API, then successfully decrypted and signature-verified in the browser. The server never received this validation message as plaintext.

The normal Orbit composer and thread were then exercised after structured React-level decryption replaced the earlier DOM-scanning approach. The composer encrypted and sent a validation message, the thread rendered its decrypted content from message data, and a managed-database check confirmed the stored value was an `oc1` envelope rather than plaintext. The floating connection-link control was raised above the composer so it no longer obstructs secure-message send actions.

Encrypted-chat privacy surfaces were also validated. The E2EE thread disables server-side find-in-chat and reply/edit controls that would require plaintext handling. Saving and pinning a live encrypted message through the UI created only references to an `oc1`-stored message; no duplicate plaintext was created. Pinned and saved workspace surfaces intentionally show **Encrypted signal** outside the decrypted conversation thread. Trusted connection links continue to contain only an opaque, one-time connection token and no message content.

A disposable account redeemed a fresh one-time trusted link without a request step, completed secure-device setup, and sent an `oc1`-enveloped message to the link creator. The live endpoint accepted the encrypted envelope only after both public-key records were available. This confirms that trusted-link-created direct chats use the same E2EE transport boundary as request-approved chats.
