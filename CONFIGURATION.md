# Configuration Guide


## Configuration Requirements

The application requires **4 environment variables** to be set:

| Variable | Description | Example |
|----------|-------------|---------|
| `OAUTH_TOKEN_URL` | OAuth 2.0 token endpoint | `https://auth.example.com/oauth/token` |
| `OAUTH_CLIENT_ID` | OAuth client ID | `sb-12345...!b99999` |
| `OAUTH_CLIENT_SECRET` | OAuth client secret | `your-secret-key` |
| `API_BASE_URL` | Data Store Retry API base URL | `https://api.example.com/http/pipeline/api/v1` |

## Local Development

### Step 1: Create .env file

```bash
cp .env.example .env
```

> **Note**: The `.env` file is git-ignored and will NOT be committed. 

### Step 2: Edit .env with your values

```bash
OAUTH_TOKEN_URL=https://your-auth-endpoint/oauth/token
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-secret-here
API_BASE_URL=https://your-api-endpoint/http/pipeline/api/v1
```

### Step 3: Run the application

```bash
npm install
cds watch
```

If `cds` is not found, use `npx cds watch` (uses the local devDependency) or install the CDS CLI globally and then run `cds watch`:

```bash
npm install -g @sap/cds-dk
cds watch
```

The application will validate that all environment variables are set on startup and throw an error if any are missing.


------------------------------------------------------------------------------------------------------

## Cloud Foundry Deployment (MTA)

### Prerequisite: Log in and target your space

Make sure you are logged in to the correct Cloud Foundry landscape, org, and space before deploying:

```bash
cf login -a https://api.<region>.hana.ondemand.com
cf target -o <org> -s <space>
```

### Step 1: Create your credentials extension file

Copy the template and fill in your actual credentials:

```bash
cp credentials.mtaext.template credentials.mtaext
```

Edit `credentials.mtaext` with your real values:

```yaml
_schema-version: 3.3.0
ID: datastore-extension-ui-credentials
extends: datastore-extension-ui

modules:
- name: datastore-extension-ui-srv
  properties:
    OAUTH_TOKEN_URL: https://your-auth-endpoint/oauth/token
    OAUTH_CLIENT_ID: your-client-id
    OAUTH_CLIENT_SECRET: your-client-secret
    API_BASE_URL: https://your-api-endpoint/http/pipeline/api/v1
```

> **Note**: The `credentials.mtaext` file is git-ignored and will NOT be committed. Only the `.template` file is tracked.

### Step 2: Build and Deploy

```bash
mbt build
cf deploy mta_archives/datastore-extension-ui_1.0.0.mtar -e credentials.mtaext
```

### Step 3: Accessing the Application

You can access the successfully deployed application under the "HTML5 Applications" tab in the BTP Cockpit of your BTP subaccount. 

- Your subaccount > HTML5 Applications > search for: Datastore_Extension_UI
- You can now also add it to SAP Build Workzone (see instructions below) and access the application from there. 

## Troubleshooting

### "Missing required environment variables"

Ensure all 4 variables are set correctly. Use:

```bash
cf env datastore-extension-ui-srv  # Check on CF
echo $OAUTH_TOKEN_URL          # Check locally
```

### "Failed to obtain access token"

Check that:
- `OAUTH_TOKEN_URL` is correct
- `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` are valid
- The OAuth server is accessible from your network

## Other issues

Check the application logs:

```bash
# Local development
cds watch  # Errors appear in terminal under [external-service]

# Cloud Foundry
cf logs datastore-extension-ui-srv
cf logs datastore-extension-ui-srv --recent
```

Look for `[external-service]` log entries to diagnose API communication issues.

---

## Adding the App to SAP Build Work Zone (Optional) 

After a successful deployment, you can make the application accessible via the SAP Build Work Zone launchpad. The necessary technical configuration is already included in the code — you only need to register and configure it in the Work Zone portal.

### Prerequisites

- SAP Build Work Zone, standard edition is subscribed in your BTP subaccount.
- The MTA has been built and deployed successfully (see above).

### Step 1: Synchronize HTML5 App Repository

1. Open the **SAP Build Work Zone, standard edition** portal. You can find the link under **Instances and Subscriptions** in the SAP BTP Cockpit.
2. Navigate to the **Channel Manager** menu.
3. Click the **Update content** button on the HTML5 Apps channel to synchronize with the latest deployment.

### Step 2: Add the App to the Content Manager

1. Open the **Content Manager** menu.
2. Click **Content Explorer** and then the **HTML5 Apps** tile.
3. You should see `Cloud Integration Pipeline - Datastore Extension UI` in the list. Select its checkbox and click **Add**.

### Step 3: Create a Group

1. In **Content Manager**, click **Create > Group**.
2. Give the group a name (e.g. `Cloud Integration Pipeline`).
3. Save the group, then edit it and enable the **Assignment Status** toggle for this app. Save again.

### Step 4: Make the App Visible to Users

1. In **Content Manager**, select the **Everyone** role.
2. Click **Edit** and enable the toggle for this app. Click **Save**.

### Step 5: Add to (or create) a Launchpad Site

1. Navigate to **Site Directory** and add the app to an existing site OR click **Create Site**.
2. Give the site a name (e.g. `POC Test Dashboard`) and click **Create**.
3. Open the site — the tile for this application should now appear on the launchpad.

