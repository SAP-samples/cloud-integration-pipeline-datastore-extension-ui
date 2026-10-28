# Configuration Guide

## Overview

The application connects to one or more SAP Cloud Integration tenants via OAuth 2.0. Each tenant requires four credentials:

| Field | Description | Where to find it |
|---|---|---|
| `id` | Short identifier used internally (e.g. `dev`, `rte`, `prod`) | Choose any unique lowercase string |
| `label` | Display name shown in the "Select Tenant" dropdown | Choose a meaningful name |
| `oauthUrl` | OAuth 2.0 token endpoint | SAP BTP subaccount → Instances and Subscriptions → Process Integration Runtime → Service Key |
| `clientId` | OAuth client ID | Same service key |
| `clientSecret` | OAuth client secret | Same service key |
| `apiBaseUrl` | Base URL of your Cloud Integration HTTP API | Compose from your tenant's runtime URL (see note below) |

> **API Base URL format**: The base URL follows the pattern `https://<tenant-id>.<runtime-host>/http/pipeline/api/v1`. You can derive the runtime host from the `url` field in the Process Integration Runtime service key. It typically looks like `https://<tenant>.it-cpi018-rt.cfapps.<region>.hana.ondemand.com`.

---

## Local Development

### Step 1: Create your `.env` file

```bash
cp .env.example .env
```

> The `.env` file is git-ignored and will **not** be committed.

### Step 2: Add your credentials to `.env`

Open `.env` and set `TENANTS_CONFIG` to a JSON array. Each object in the array represents one tenant:

```
TENANTS_CONFIG=[{"id":"dev","label":"DEV","oauthUrl":"https://your-tenant.authentication.eu10.hana.ondemand.com/oauth/token","clientId":"sb-your-client-id","clientSecret":"your-client-secret","apiBaseUrl":"https://your-tenant.it-cpi018-rt.cfapps.eu10.hana.ondemand.com/http/pipeline/api/v1"}]
```

For **multiple tenants**, add more objects to the array:

```
TENANTS_CONFIG=[{"id":"dev","label":"DEV","oauthUrl":"https://tenant-dev.authentication.eu10.hana.ondemand.com/oauth/token","clientId":"sb-client-id-dev","clientSecret":"secret-dev","apiBaseUrl":"https://tenant-dev.it-cpi018-rt.cfapps.eu10.hana.ondemand.com/http/pipeline/api/v1"},{"id":"rte","label":"RTE","oauthUrl":"https://tenant-rte.authentication.eu10.hana.ondemand.com/oauth/token","clientId":"sb-client-id-rte","clientSecret":"secret-rte","apiBaseUrl":"https://tenant-rte.it-cpi018-rt.cfapps.eu10.hana.ondemand.com/http/pipeline/api/v1"}]
```

> **Important**: The entire `TENANTS_CONFIG` value must be on a **single line** in the `.env` file. Multi-line values are not supported by the `.env` format.

> **Important**: Do not use quotation marks around the value itself.

### Step 3: Start the application

```bash
npm install
cds watch
```

If `cds` is not in your PATH, use `npx cds watch` or install the CDS CLI globally:

```bash
npm install -g @sap/cds-dk
cds watch
```

Open the URL shown in the terminal (e.g. `http://localhost:4004`) and click on `/datastores-ui/webapp`.

---

## Cloud Foundry Deployment

### Prerequisite: Log in and target your space

```bash
cf login -a https://api.<region>.hana.ondemand.com
cf target -o <org> -s <space>
```

### Step 1: Create your credentials extension file

```bash
cp credentials.mtaext.template credentials.mtaext
```

> The `credentials.mtaext` file is git-ignored and will **not** be committed. Only the `.template` file is tracked.

### Step 2: Add your credentials to `credentials.mtaext`

Open `credentials.mtaext` and replace the placeholder values. The YAML `>-` block scalar lets you write the JSON array across multiple lines for readability — it will be folded into a single line automatically:

```yaml
_schema-version: 3.3.0
ID: datastore-extension-ui-credentials
extends: datastore-extension-ui

modules:
- name: datastore-extension-ui-srv
  properties:
    TENANTS_CONFIG: >-
      [
        {
          "id": "dev",
          "label": "DEV",
          "oauthUrl": "https://tenant-dev.authentication.eu10.hana.ondemand.com/oauth/token",
          "clientId": "sb-your-client-id-dev",
          "clientSecret": "your-client-secret-dev",
          "apiBaseUrl": "https://tenant-dev.it-cpi018-rt.cfapps.eu10.hana.ondemand.com/http/pipeline/api/v1"
        },
        {
          "id": "rte",
          "label": "RTE",
          "oauthUrl": "https://tenant-rte.authentication.eu10.hana.ondemand.com/oauth/token",
          "clientId": "sb-your-client-id-rte",
          "clientSecret": "your-client-secret-rte",
          "apiBaseUrl": "https://tenant-rte.it-cpi018-rt.cfapps.eu10.hana.ondemand.com/http/pipeline/api/v1"
        }
      ]
```

Add or remove objects in the array to match the number of tenants you need.

### Step 3: Build and deploy

```bash
mbt build
cf deploy mta_archives/datastore-extension-ui_1.0.0.mtar -e credentials.mtaext
```

### Step 4: Access the application

After a successful deployment, open the **SAP BTP Cockpit** for your subaccount:

- Navigate to **HTML5 Applications** and search for `Datastore_Extension_UI`.
- Optionally add it to **SAP Build Work Zone** (see section below).

---

## Single-Tenant Fallback (backward compatible)

If `TENANTS_CONFIG` is not set, the application falls back to four individual environment variables. This is provided for backward compatibility — the multi-tenant approach using `TENANTS_CONFIG` is recommended for all new deployments.

| Variable | Description |
|---|---|
| `OAUTH_TOKEN_URL` | OAuth 2.0 token endpoint |
| `OAUTH_CLIENT_ID` | OAuth client ID |
| `OAUTH_CLIENT_SECRET` | OAuth client secret |
| `API_BASE_URL` | Data Store API base URL |

In `.env`:
```
OAUTH_TOKEN_URL=https://your-auth-endpoint/oauth/token
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
API_BASE_URL=https://your-api-endpoint/http/pipeline/api/v1
```

In `credentials.mtaext` (comment out `TENANTS_CONFIG` and uncomment these):
```yaml
    OAUTH_TOKEN_URL: https://your-auth-endpoint/oauth/token
    OAUTH_CLIENT_ID: your-client-id
    OAUTH_CLIENT_SECRET: your-client-secret
    API_BASE_URL: https://your-api-endpoint/http/pipeline/api/v1
```

---

## Troubleshooting

### "TENANTS_CONFIG is not valid JSON"

The JSON array in `.env` is malformed or split across multiple lines. Make sure:
- The entire value is on a single line in `.env`
- All strings use double quotes (`"`) not single quotes
- There are no trailing commas after the last object in the array

Validate your JSON at [jsonlint.com](https://jsonlint.com) before pasting it into `.env`.

### "Failed to obtain access token"

- Verify `oauthUrl`, `clientId`, and `clientSecret` in your tenant configuration
- Check that the OAuth server is reachable from your network (or from the CF runtime)

### "No tenants configured" in the Select Tenant dialog

`TENANTS_CONFIG` is not set or could not be parsed. Check the application logs:

```bash
# Local
cds watch  # errors appear in the terminal

# Cloud Foundry
cf logs datastore-extension-ui-srv --recent
```

Look for lines starting with `[external-service]` or `TENANTS_CONFIG` to diagnose the issue.

### Other issues

```bash
# Cloud Foundry — check environment variables
cf env datastore-extension-ui-srv

# Cloud Foundry — stream live logs
cf logs datastore-extension-ui-srv
```

---

## Adding the Application to SAP Build Work Zone (Optional)

After a successful deployment, you can make the application accessible via the SAP Build Work Zone launchpad. The necessary technical configuration is already included — you only need to register and configure it in the Work Zone portal.

### Prerequisites

- SAP Build Work Zone, standard edition is subscribed in your BTP subaccount.
- The MTA has been built and deployed successfully (see above).

### Step 1: Synchronize the HTML5 App Repository

1. Open **SAP Build Work Zone, standard edition** (find the link under **Instances and Subscriptions** in the BTP Cockpit).
2. Navigate to **Channel Manager**.
3. Click **Update content** on the HTML5 Apps channel.

### Step 2: Add the app to the Content Manager

1. Open **Content Manager** → **Content Explorer** → **HTML5 Apps**.
2. Select `Cloud Integration Pipeline - Datastore Extension UI` and click **Add**.

### Step 3: Create a Group

1. In **Content Manager**, click **Create > Group**.
2. Give the group a name (e.g. `Cloud Integration Pipeline`) and save.
3. Edit the group and enable the **Assignment Status** toggle for this app.

### Step 4: Make the app visible to users

1. In **Content Manager**, select the **Everyone** role.
2. Click **Edit**, enable the toggle for this app, and click **Save**.

### Step 5: Add to a Launchpad Site

1. Navigate to **Site Directory** and add the app to an existing site, or click **Create Site**.
2. Give the site a name (e.g. `Pipeline Dashboard`) and click **Create**.
3. Open the site — the application tile should now appear.
