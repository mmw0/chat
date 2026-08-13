# Advanced Workflow Review Notes

The unauthenticated Orbit entry screen was reviewed at 375×812 and 1280×720. The compact dark-navy card, warm-cream backdrop, primary and secondary account actions, and username/password-only positioning remain readable at both sizes.

A disposable native account was created through the live workspace to review the authenticated state. The desktop workspace rendered the contextual left navigation and empty direct-chat state without a client error. The profile sheet exposed the full 100-item built-in anime portrait gallery and the trusted-link, password, and permanent-delete control areas. No external image-upload affordance was present.

The newly added mute, reply, and archive controls are covered by TypeScript and unit validation. End-to-end native smoke validation passed once additive migration `0007_wet_bloodscream.sql` was successfully applied to the managed database.

The signed-in desktop review also confirmed that the new **Organize chats** dock is available beside the one-time-link dock. Its personal favorites-and-labels panel opens with a clear empty state when there are no accepted direct contacts, and explicitly explains that labels and favorites affect only the account owner’s workspace. Migration `0008_blushing_white_tiger.sql` was applied before the final validation run.

## Secure-device recovery validation

A disposable account was intentionally assigned a different stored public-key identity. The next authenticated load displayed the **Secure device recovery** dialog rather than the earlier disruptive mismatch alert. The dialog clearly explained the cause and impact on older encrypted messages, required the current password, and required a deliberate **Use this browser** action. Password-confirmed recovery completed successfully, refreshed the account’s device identity, dismissed the dialog, and displayed a success notice that new encrypted messages use the recovered browser.

## Settings-only security controls

The persistent workspace **Secure device** indicator and floating one-time-link control were removed. The signed-in workspace was reviewed without either floating control. One-time link creation and revocation remain available inside account settings, where a disposable active link was created and revoked successfully. Account settings now also present non-intrusive secure-device recovery guidance. After this relocation, a fresh deliberate key-mismatch scenario again showed the password-confirmed recovery dialog and successfully recovered the review device.

## Hosting diagnosis

The server-backed production application accepted a fresh disposable username-and-password registration and rendered the authenticated workspace, confirming that native authentication and the main application service are available. The GitHub Pages URL was reachable but was serving its previously built static repository surface at review time; its static deployment cannot host the application API, authentication, database, or encrypted chat service. A repository-root landing page was committed for the Pages surface, pending GitHub Pages rebuild propagation.
