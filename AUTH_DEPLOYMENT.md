# GPB authentication rollout

## 1. Deploy without enforcement

Authentication is required by default. Deploy without `AUTH_REQUIRED`, or set `AUTH_REQUIRED=true`. Existing extension versions that do not support login will be denied access.

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
MIN_EXTENSION_VERSION=1.0.270
EXTENSION_UPDATE_URL=
```

After this deploy, extensions older than `MIN_EXTENSION_VERSION` (or without a version marker) receive HTTP 426. Current extensions without a valid token receive HTTP 401.

## Emergency rollback

Set `AUTH_REQUIRED=false` and redeploy. This restores API access for old extensions without deleting users or sessions.
