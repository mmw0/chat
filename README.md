# Orbit Chat

Orbit Chat is a privacy-first, mobile-first direct messaging application. It uses React, Express, tRPC, Drizzle ORM, and a managed MySQL-compatible database. The application includes native username/password authentication, consent-based contacts, browser-held E2EE device identities, encrypted direct-message transport, secure-device recovery, one-time connection links, and explicit multi-device pairing.

## Development and validation

Install the project dependencies with `pnpm install`. Run the development service with `pnpm dev`. The validated release commands are `pnpm check`, `pnpm test`, `pnpm smoke:native`, and `pnpm build`.

The application requires runtime environment values for its database, signed authentication sessions, and managed platform services. Never commit `.env` files, personal access tokens, passwords, or production credentials.

## Deployment

This repository contains a **full-stack application**, not a static site. Its chat functionality requires the Express server, tRPC endpoints, authentication cookies, database connectivity, and server-side security controls. Therefore, **GitHub Pages cannot host a fully functional Orbit Chat deployment**: GitHub Pages only serves static HTML, CSS, and JavaScript and cannot run the required backend or database.

Use a Node-compatible full-stack host with managed environment variables and database access for a live deployment.

## GitHub source publication

The repository is intended for source control, code review, and collaboration. Before deployment from another host, configure that host’s environment variables and database connection securely. Do not attempt to substitute a GitHub personal access token for an application runtime secret.
