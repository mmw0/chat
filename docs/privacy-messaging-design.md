# Orbit Privacy Messaging Design Notes

Orbit will treat disappearing messages as a **retention agreement**, not a guarantee that a recipient cannot preserve content. Each direct-chat participant can set the chat timer. The setting affects newly sent messages only, exposes a visible timer indicator, and offers concise options: Off, 1 hour, 24 hours, 7 days, and 30 days. This follows Signal’s model of a per-chat timer that applies to new messages and visibly signals its use, while making the limitation clear to users: a recipient can still make a copy before expiry.[1]

One-time trusted connection links will use a high-entropy random token, persist only a SHA-256 token hash, expire after 24 hours, and atomically record a single redemption. An authenticated recipient who redeems an active link becomes an accepted direct contact without the usual request round-trip. The creator can revoke unused links. This follows the security properties OWASP expects of sensitive token links: random, time-limited, single-use, and protected at rest.[2]

Password changes require the user’s active Orbit session, the current password, and a valid replacement password. The server verifies the current scrypt hash, writes a new hash, and reissues the current native session. It does not expose password data or use an account identifier supplied by the browser. OWASP specifically recommends active-session plus current-password verification for password changes.[3]

Clear-history will be personal: it hides prior messages from the initiating person’s timeline without mutating the peer’s copy. Delete-conversation will be mutually visible and removes the direct relationship and its shared message history after explicit confirmation. These different labels prevent misleading users about what is and is not removed for the other participant.

## References

[1]: https://support.signal.org/hc/en-us/articles/360007320771-Set-and-manage-disappearing-messages
[2]: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/04-Authentication_Testing/09-Testing_for_Weak_Password_Change_or_Reset_Functionalities
[3]: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
