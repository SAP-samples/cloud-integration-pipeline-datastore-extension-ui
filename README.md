# Cloud Integration Pipeline - Datastore Extension UI

[![REUSE status](https://api.reuse.software/badge/github.com/SAP-samples/cloud-integration-pipeline-datastore-extension-ui)](https://api.reuse.software/info/github.com/SAP-samples/cloud-integration-pipeline-datastore-extension-ui)

## Description

This is a CAP/SAP Fiori Elements application for managing datastore entries. The application uses the [Process Integration Pipeline Extension - Restart via Data Store](https://hub.sap.com/package/processintegrationpipelineextensionrestartviadatastore/overview) package.

This application connects to the HTTP API Integration Flows of the Pipeline Extension package and provides a user-friendly interface to inspect, restart, move, and delete datastore entries — without requiring direct API calls or an API client like Postman.

You can find a detailed description of the project including screenshots of the UI [in this blog post](https://community.sap.com/t5/integration-blog-posts/cloud-integration-pipeline-datastore-extension-ui/ba-p/14326020).

### Features

- **Datastore Overview**: View all **global** datastores with message counts and overdue message indicators
- **Datastore Entry Overview**: View all messages of a datastore and their properties (Scenario ID, Processing Stage, Receiver, Number of Restarts, etc.)
- **Filtering**: Filter datastores and entries by various criteria 
- **Bulk Operations**: Apply operations to multiple selected entries or all filtered entries at once
  - **Restart**: Retry failed message processing
  - **Delete**: Permanently remove message
  - **Move to No-Retry datastore**: Move entries to a No-Retry datastore
  - **Move to Datastore**: Move entries to any target datastore
- **Error Analysis**: Inspect error messages, HTTP response headers, and metadata per message
- **Payload Decoding**: Decode base64-encoded message payloads on demand
- **Detail Page Actions**: Restart, delete, and move actions directly on the detail page of each message

## Requirements

- Node.js >= 20 (LTS)
- npm (comes with Node.js)
- Access to an SAP Cloud Integration tenant with the [Process Integration Pipeline Extension - Restart via Data Store](https://hub.sap.com/package/processintegrationpipelineextensionrestartviadatastore/overview) package deployed, including the two optional API Integration Flows:
  - **Pipeline API - Data Store Manage Retries** (provides the `/dsretry` endpoint)
  - **Pipeline API - Data Store Manage Entries** (provides the `/dsentry` endpoint)
- OAuth credentials (Client ID, Client Secret, Token URL) for the Cloud Integration runtime
- For Cloud Foundry deployment: Cloud Foundry CLI with the MTA plugin + a SAP Build Work Uone subscription 

## Installation

### Quick Start (local)

1. **Clone the repository**
   ```bash
   git clone https://github.com/SAP-samples/cloud-integration-pipeline-datastore-extension-ui.git
   cd cloud-integration-pipeline-datastore-extension-ui
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure credentials**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your OAuth credentials and API endpoint. See [CONFIGURATION.md](CONFIGURATION.md) for details.

   > **Important**: Do not use quotation marks around values in the `.env` file.

4. **Start the application**
   ```bash
   cds watch
   ```
   If `cds` is not in your PATH, use `npx cds watch` or install the CDS CLI globally:
   ```bash
   npm install -g @sap/cds-dk
   cds watch
   ```

5. **Access the UI** — Open the URL shown in the terminal (e.g., `http://localhost:4004`) and click on `/datastores-ui/webapp`

### Cloud Foundry Deployment

For deployment to SAP BTP Cloud Foundry, see [CONFIGURATION.md](CONFIGURATION.md).

## Known Issues

- Filter operators `starts with`, `ends with`, and `not equal to` are not supported for datastore entries. Supported operators are: `contains`, `equal to`, and `between`.
- Closing the filter banner does not refresh the data in the datastore entries table, in this case you need to refresh the page to reset the table (alternatively, remove the filters in the filter menu instead of closing the banner in the first place)


## How to obtain support

[Create an issue](https://github.com/SAP-samples/cloud-integration-pipeline-datastore-extension-ui/issues) in this repository if you find a bug or have questions about the content.

For additional support, [ask a question in SAP Community](https://community.sap.com/).

## Contributing

If you wish to contribute code, offer fixes or improvements, please send a pull request. Due to legal reasons, contributors will be asked to accept a DCO when they create the first pull request to this project. This happens in an automated fashion during the submission process. SAP uses [the standard DCO text of the Linux Foundation](https://developercertificate.org/).

## License

Copyright (c) 2026 SAP SE or an SAP affiliate company. All rights reserved. This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE](LICENSE) file.

