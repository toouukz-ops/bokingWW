# GPB authentication rollout

## 1. Deploy without enforcement

Deploy the backend with `AUTH_REQUIRED=false` (or leave it unset). Authentication endpoints are available, but existing extension versions continue to work.

## 2. Create the first administrator

Run this command in the backend environment. Do not put the password in Git:

```sh
GPB_USER_PASSWORD='temporary password of at least 10 characters' npm run auth:create-user -- ernest 'Эрнест' admin
```

Create every operator in the same way, replacing the login, display name and role:

```sh
GPB_USER_PASSWORD='temporary password of at least 10 characters' npm run auth:create-user -- operator1 'Имя оператора' operator
```

## 3. Install the authenticated extension

Install version 1.0.259 on every authorized machine and verify login, reservations, contacts, statuses, dialogs, settings and realtime synchronization.

## 4. Enforce authentication

Set these backend environment variables and redeploy:

```text
AUTH_REQUIRED=true
AUTH_SESSION_HOURS=12
```

After this deploy, old extensions and direct API requests without a valid token receive HTTP 401.

## Emergency rollback

Set `AUTH_REQUIRED=false` and redeploy. This restores API access for old extensions without deleting users or sessions.
