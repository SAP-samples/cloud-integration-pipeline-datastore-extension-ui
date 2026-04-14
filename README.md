# Cloud Integration Pipeline - Datastore Extension UI

[![REUSE status](https://api.reuse.software/badge/github.com/SAP-samples/cloud-integration-pipeline-datastore-extension-ui)](https://api.reuse.software/info/github.com/SAP-samples/cloud-integration-pipeline-datastore-extension-ui)

## Description

A SAP Fiori Elements UI application for managing Data Store entries created by the [Process Integration Pipeline Extension - Restart via Data Store](https://hub.sap.com/package/processintegrationpipelineextensionrestartviadatastore/overview) package on SAP Cloud Integration.

This application connects to the optional HTTP API Integration Flows of the Pipeline Extension package and provides a user-friendly interface to inspect, restart, move, and delete Data Store entries — without requiring direct API calls or Postman.

### Features

- **DataStore Overview**: View all Global datastores with message counts and overdue message indicators
- **DataStore Entry Overview**: View all messages of a datastore and their properties (Scenario ID, Processing Stage, Receiver, Number of Restarts, etc.)
- **Filtering**: Filter datastores and entries by various criteria (contains, equals, between)
- **Bulk Operations**: Apply operations to multiple selected entries or all filtered entries at once
  - **Restart**: Retry failed message processing
  - **Delete**: Permanently remove entries
  - **Move to No-Retry**: Move entries to the NoRetry datastore
  - **Move to DataStore**: Move entries to any target datastore
- **Error Analysis**: Inspect error messages, HTTP response headers, and processing metadata per entry
- **Payload Decoding**: Decode base64-encoded message payloads on demand
- **Detail Page Actions**: Restart, delete, and move actions directly on the detail page of each message

## Requirements

- Node.js >= 20 (LTS)
- npm (comes with Node.js)
- Access to an SAP Cloud Integration tenant with the [Process Integration Pipeline Extension - Restart via Data Store](https://hub.sap.com/package/processintegrationpipelineextensionrestartviadatastore/overview) package deployed, including the two optional API Integration Flows:
  - **Pipeline API - Data Store Manage Retries** (provides the `/dsretry` endpoint)
  - **Pipeline API - Data Store Manage Entries** (provides the `/dsentry` endpoint)
- OAuth credentials (Client ID, Client Secret, Token URL) for the Cloud Integration runtime
- For Cloud Foundry deployment: Cloud Foundry CLI with the MTA plugin

## Download and Installation

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

5. **Access the UI** — Open the URL shown in the terminal (e.g., `http://localhost:4004`) and click on `/datastores-ui/webapp/index.html`

### Cloud Foundry Deployment

For deployment to SAP BTP Cloud Foundry, see [CONFIGURATION.md](CONFIGURATION.md).

## Known Issues

- Filter operators `starts with`, `ends with`, and `not equal to` are not supported for DataStore entries. Supported operators are: `contains`, `equal to`, and `between`.
- Sorting on the DataStore entries table is only supported for `UTCTimestampOfError` and `NumberOfDSRestarts`.

## How to obtain support

[Create an issue](https://github.com/SAP-samples/cloud-integration-pipeline-datastore-extension-ui/issues) in this repository if you find a bug or have questions about the content.

For additional support, [ask a question in SAP Community](https://community.sap.com/).

## Contributing

If you wish to contribute code, offer fixes or improvements, please send a pull request. Due to legal reasons, contributors will be asked to accept a DCO when they create the first pull request to this project. This happens in an automated fashion during the submission process. SAP uses [the standard DCO text of the Linux Foundation](https://developercertificate.org/).

## License

Copyright (c) 2026 SAP SE or an SAP affiliate company. All rights reserved. This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE](LICENSE) file.

