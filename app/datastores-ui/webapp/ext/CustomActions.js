// Custom table actions for DataStore entries (Delete, Move to No-Retry, Restart, Move to Data Store)
sap.ui.define([], function () {
  "use strict";

  // CSRF token cache
  var _csrfTokenPromise;
  var _csrfTokenBase;

  function _getServiceBase(oContext) {
    var oModel = oContext && oContext.getModel && oContext.getModel();
    var sBase = (oModel && (oModel.sServiceUrl || (oModel.getMetadata && oModel.getMetadata().getServiceUrl && oModel.getMetadata().getServiceUrl())));
    if (!sBase) { sBase = "./odata/v4/external/"; }
    if (sBase.slice(-1) !== "/") { sBase += "/"; }
    return sBase;
  }

  // Check if the current DataStore is a NoRetry datastore
  // Returns true if DataStoreName ends with "NoRetry" (case-insensitive)
  function _isNoRetryDataStore(oContext) {
    var oData = oContext && oContext.getObject && oContext.getObject();
    var sDataStoreName = oData && oData.DataStoreName;
    if (!sDataStoreName) { return false; }
    var normalized = String(sDataStoreName).toLowerCase();
    return normalized.endsWith("noretry");
  }

  function _getCsrfToken(serviceBaseUrl) {
    // Return cached token if already fetched for this base URL
    if (_csrfTokenPromise && _csrfTokenBase === serviceBaseUrl) { return _csrfTokenPromise; }
    _csrfTokenBase = serviceBaseUrl;

    function requestToken(method) {
      return fetch(serviceBaseUrl, {
        method: method,
        headers: { "X-CSRF-Token": "Fetch" },
        credentials: "same-origin"
      });
    }

    // Try HEAD first (lightweight), fall back to GET if no token returned
    _csrfTokenPromise = requestToken("HEAD").then(function (resp) {
      var token = resp.headers.get("x-csrf-token");
      if (token) { return token; }
      return requestToken("GET").then(function (resp2) {
        var token2 = resp2.headers.get("x-csrf-token");
        return token2 || null;
      });
    }).catch(function (e) {
      console.error("[CustomActions] CSRF token fetch failed:", e);
      return null;
    }).then(function (token) {
      return token;
    });

    return _csrfTokenPromise;
  }

  function _postWithCsrf(serviceBaseUrl, actionName, payload) {
    return _getCsrfToken(serviceBaseUrl).then(function (token) {
      var headers = { "Content-Type": "application/json" };
      if (token) { headers["X-CSRF-Token"] = token; }

      return fetch(serviceBaseUrl + actionName, {
        method: "POST",
        headers: headers,
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
    });
  }

  // Navigate back to the DataStores overview (ListReport).
  // Used when all entries in a datastore have been processed and the
  // datastore will vanish from the API, causing a 404 on reload.
  function _navigateToOverview() {
    // Remove the hash to go back to the root route (ListReport)
    window.location.hash = "";
    window.location.reload();
  }

  // Check whether all entries in the datastore were processed.
  // If so, navigate to overview; otherwise reload the current page.
  function _reloadOrNavigateBack(oContext, totalProcessed) {
    var iTotalMessages = 0;
    try {
      var oData = oContext && oContext.getObject && oContext.getObject();
      iTotalMessages = (oData && oData.NumberOfMessages) || 0;
    } catch (e) { /* context may be gone */ }

    if (iTotalMessages > 0 && totalProcessed >= iTotalMessages) {
      _navigateToOverview();
    } else {
      window.location.reload();
    }
  }

  // Batch size for chunked operations (avoids HTTP 413)
  var BATCH_SIZE = 100;

  /**
   * Execute an action in batches of BATCH_SIZE with a progress dialog.
   * @param {object}   opts
   * @param {string}   opts.serviceBase   - OData service base URL
   * @param {string}   opts.actionName    - Unbound action name (e.g. "DeleteEntries")
   * @param {string[]} opts.entryIds      - Full array of entry IDs
   * @param {function} opts.buildPayload  - fn(chunkIds) → request body object
   * @param {string}   opts.title         - Dialog title (e.g. "Deleting…")
   * @param {function} opts.onComplete    - fn(totalProcessed) called on success
   * @param {function} opts.onError       - fn(errorMsg, processed, total) called on failure
   */
  function _executeBatched(opts) {
    sap.ui.require([
      "sap/m/Dialog", "sap/m/Button", "sap/m/ProgressIndicator",
      "sap/m/Text", "sap/m/VBox", "sap/m/MessageBox"
    ], function (Dialog, Button, ProgressIndicator, Text, VBox, MessageBox) {

      var aAllIds  = opts.entryIds;
      var iTotal   = aAllIds.length;
      var iDone    = 0;
      var bCancelled = false;

      // Build chunks
      var aChunks = [];
      for (var i = 0; i < iTotal; i += BATCH_SIZE) {
        aChunks.push(aAllIds.slice(i, i + BATCH_SIZE));
      }

      // Progress UI
      var oProgressIndicator = new ProgressIndicator({
        percentValue: 0,
        displayValue: "0 / " + iTotal,
        showValue: true,
        state: "Information",
        width: "100%"
      });

      var oStatusText = new Text({
        text: "Processing batch 1 of " + aChunks.length + " (" + BATCH_SIZE + " entries per batch)…"
      });

      var oDialog = new Dialog({
        title: opts.title || "Processing…",
        contentWidth: "420px",
        content: [
          new VBox({
            items: [oStatusText, oProgressIndicator]
          }).addStyleClass("sapUiSmallMargin")
        ],
        endButton: new Button({
          text: "Cancel",
          press: function () {
            bCancelled = true;
          }
        }),
        escapeHandler: function (oPromise) {
          bCancelled = true;
          oPromise.resolve();
        },
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.open();

      // Sequential chunk processor
      function processNext(idx) {
        if (bCancelled) {
          oDialog.close();
          MessageBox.warning(
            iDone + " of " + iTotal + " entries processed before cancellation.",
            { title: opts.title || "Cancelled" }
          );
          return;
        }

        if (idx >= aChunks.length) {
          // All done
          oDialog.close();
          if (opts.onComplete) { opts.onComplete(iDone); }
          return;
        }

        var aChunk = aChunks[idx];
        oStatusText.setText("Processing batch " + (idx + 1) + " of " + aChunks.length + "…");

        _postWithCsrf(opts.serviceBase, opts.actionName, opts.buildPayload(aChunk))
          .then(function (oResponse) {
            if (!oResponse.ok) {
              return oResponse.text().then(function (sText) {
                throw new Error("HTTP " + oResponse.status + ": " + sText);
              });
            }
            return oResponse.json();
          })
          .then(function () {
            iDone += aChunk.length;
            var pct = Math.round((iDone / iTotal) * 100);
            oProgressIndicator.setPercentValue(pct);
            oProgressIndicator.setDisplayValue(iDone + " / " + iTotal);
            // Next chunk
            processNext(idx + 1);
          })
          .catch(function (oError) {
            oDialog.close();
            var sMsg = (oError && oError.message) ? oError.message : "Request failed";
            if (opts.onError) {
              opts.onError(sMsg, iDone, iTotal);
            } else {
              MessageBox.error(
                sMsg + "\n\n" + iDone + " of " + iTotal + " entries were processed before the error.",
                { title: (opts.title || "Error"), onClose: function () { window.location.reload(); } }
              );
            }
          });
      }

      processNext(0);
    });
  }

  // Filter/Sort info message handler
  function _showFilterInfoDialog() {
    sap.ui.require(["sap/m/Dialog", "sap/m/Button", "sap/m/Text", "sap/m/VBox", "sap/m/MessageStrip"], function(Dialog, Button, Text, VBox, MessageStrip) {
      var oDialog = new Dialog({
        title: "Filter & Sort Help",
        type: "Message",
        contentWidth: "450px",
        content: [
          new VBox({
            items: [
              new MessageStrip({
                text: "Use the settings icon (⚙) in the table toolbar to access filter and sort options.",
                type: "Information",
                showIcon: true,
                class: "sapUiSmallMarginBottom"
              }).addStyleClass("sapUiSmallMarginBottom"),
              new Text({
                text: "Supported Filter Operations:"
              }).addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom"),
              new Text({
                text: "• Contains - for partial text matching"
              }),
              new Text({
                text: "• Equal To - for exact value matching"
              }),
              new Text({
                text: "• Between - for date/number ranges"
              }),
              new Text({
                text: ""
              }).addStyleClass("sapUiSmallMarginTop"),
              new Text({
                text: "Sortable Fields:"
              }).addStyleClass("sapUiSmallMarginBottom"),
              new Text({
                text: "• UTC Timestamp of Error"
              }),
              new Text({
                text: "• Number of DS Restarts"
              }),
              new MessageStrip({
                text: "Remove the active filters from the filter settings (⚙) to reset the table to the original state. Or refresh the page to reset all filters on the table.",
                type: "Information",
                showIcon: true
              }).addStyleClass("sapUiMediumMarginTop")
            ]
          }).addStyleClass("sapUiSmallMargin")
        ],
        beginButton: new Button({
          text: "Close",
          type: "Emphasized",
          press: function () {
            oDialog.close();
          }
        }),
        afterClose: function() {
          oDialog.destroy();
        }
      });
      oDialog.open();
    });
  }

  return {
    // Show filter and sort help information dialog
    onShowFilterInfo: function (oContext) {
      _showFilterInfoDialog();
    },

    // Helper method: Check if MoveToNoRetry button should be visible
    // Returns false if the current DataStore is a NoRetry datastore
    isMoveToNoRetryVisible: function (oContext) {
      var isNoRetry = _isNoRetryDataStore(oContext);
      return !isNoRetry;
    },

    // Helper method: Check if MoveToNoRetry button should be visible on detail page
    // Returns false if the current DataStore is a NoRetry datastore
    isMoveToNoRetryVisibleDetail: function (oBindingContext) {
      var oData = oBindingContext && oBindingContext.getObject && oBindingContext.getObject();
      var sDataStoreName = oData && oData.DataStoreName;
      if (!sDataStoreName) { return true; }
      var normalized = String(sDataStoreName).toLowerCase();
      return !normalized.endsWith("noretry");
    },
    
    // Move to DataStore action: Move entries to user-selected target datastore (with dropdown)
    onMoveToDataStore: function (oContext, aSelectedContexts) {
      if (!Array.isArray(aSelectedContexts) || aSelectedContexts.length === 0) {
        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
          MessageBox.warning("No entries selected to move.", { title: "Move to Data Store" });
        });
        return;
      }

      // assume all selected belong to same datastore
      var sSourceDS = oContext && oContext.getObject && oContext.getObject().DataStoreName;
      if (!sSourceDS) {
        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
          MessageBox.error("Cannot determine datastore name", { title: "Move Error" });
        });
        return;
      }

      // collect IDs
      var aIds = [];
      for (var i = 0; i < aSelectedContexts.length; i++) {
        var oData = aSelectedContexts[i] && aSelectedContexts[i].getObject && aSelectedContexts[i].getObject();
        if (oData && oData.ID) {
          aIds.push(oData.ID);
        }
      }
      if (aIds.length === 0) {
        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
          MessageBox.error("Could not extract entry IDs", { title: "Move Error" });
        });
        return;
      }

      // fetch datastores and prompt with dropdown
      sap.ui.require(["sap/m/Dialog","sap/m/Button","sap/m/ComboBox","sap/m/MessageBox","sap/ui/core/BusyIndicator","sap/ui/core/ListItem"],
        function(Dialog, Button, ComboBox, MessageBox, BusyIndicator, ListItem) {
          var sServiceBase = _getServiceBase(oContext);
          BusyIndicator.show(0);
          fetch(sServiceBase + "DataStores?$select=DataStoreName")
            .then(function(resp){
              if (!resp.ok) { throw new Error("Failed to load datastores: " + resp.status); }
              return resp.json();
            })
            .then(function(data){
              BusyIndicator.hide();
              var aStores = (data && data.value) ? data.value : [];

              var oCombo = new ComboBox({
                placeholder: "Select target Data Store",
                showSecondaryValues: false,
                allowCustomValue: true,
                width: "100%"
              });
              // Exclude current datastore from dropdown (prevent moving to same location)
              aStores.forEach(function(s){
                if (s && s.DataStoreName && s.DataStoreName !== sSourceDS) {
                  oCombo.addItem(new ListItem({ key: s.DataStoreName, text: s.DataStoreName }));
                }
              });

              var oDialog = new Dialog({
                title: "Move to Data Store",
                content: oCombo,
                beginButton: new Button({
                  text: "Move",
                  press: function() {
                    var sTarget = (oCombo.getSelectedKey() || oCombo.getValue() || "").trim();
                    if (!sTarget) {
                      MessageBox.warning("Please select or enter a target Data Store name.");
                      return;
                    }
                    oDialog.close();

                    var sServiceBase = _getServiceBase(oContext);

                    _executeBatched({
                      serviceBase: sServiceBase,
                      actionName: "MoveToDataStore",
                      entryIds: aIds,
                      title: "Moving to " + sTarget + "…",
                      buildPayload: function (chunkIds) {
                        return {
                          dataStoreName: sSourceDS,
                          targetDataStoreName: sTarget,
                          entryIds: chunkIds
                        };
                      },
                      onComplete: function (totalProcessed) {
                        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
                          MessageBox.success(
                            totalProcessed + " message(s) moved from " + sSourceDS + " to " + sTarget,
                            { title: "Move Complete", onClose: function () { _reloadOrNavigateBack(oContext, totalProcessed); } }
                          );
                        });
                      },
                      onError: function (sMsg, processed, total) {
                        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
                          MessageBox.error(
                            sMsg + "\n\n" + processed + " of " + total + " entries were processed before the error.",
                            { title: "Move Error", onClose: function () { window.location.reload(); } }
                          );
                        });
                      }
                    });
                  }
                }),
                endButton: new Button({
                  text: "Cancel",
                  press: function() { oDialog.close(); }
                }),
                afterClose: function() { oDialog.destroy(); }
              });

              oDialog.open();
            })
            .catch(function(err){
              console.error("[CustomActions] Failed to load datastores list:", err);
              BusyIndicator.hide();
              MessageBox.error("Could not load datastores list: " + (err && err.message ? err.message : err));
            });
        });
    },
    // Restart action: Retry failed message processing
    onRestart: function (oContext, aSelectedContexts) {
      if (!Array.isArray(aSelectedContexts) || aSelectedContexts.length === 0) {
        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
          MessageBox.warning("No entries selected to restart.", { title: "Restart" });
        });
        return;
      }

      var count = aSelectedContexts.length;
      var sMessage = count === 1
        ? "Restart the selected entry?"
        : "Restart " + count + " entries?";

      sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
        MessageBox.confirm(sMessage, {
          title: "Confirm Restart",
          onClose: function (sAction) {
            if (sAction === MessageBox.Action.OK) {
              // Datastore name from OP context (used in API dsname)
              var sSourceDS = oContext && oContext.getObject && oContext.getObject().DataStoreName;
              if (!sSourceDS) {
                MessageBox.error("Cannot determine datastore name", { title: "Restart Error" });
                return;
              }

              // IDs
              var aIds = [];
              for (var i = 0; i < aSelectedContexts.length; i++) {
                var oData = aSelectedContexts[i] && aSelectedContexts[i].getObject && aSelectedContexts[i].getObject();
                if (oData && oData.ID) {
                  aIds.push(oData.ID);
                }
              }

              if (aIds.length === 0) {
                MessageBox.error("Could not extract entry IDs", { title: "Restart Error" });
                return;
              }

              var sServiceBase = _getServiceBase(oContext);
              var sActionName = "Restart";

              _executeBatched({
                serviceBase: sServiceBase,
                actionName: sActionName,
                entryIds: aIds,
                title: "Restarting…",
                buildPayload: function (chunkIds) {
                  return { dataStoreName: sSourceDS, entryIds: chunkIds };
                },
                onComplete: function (totalProcessed) {
                  MessageBox.success(
                    totalProcessed + " entries restarted successfully",
                    { title: "Restart Complete", onClose: function () { _reloadOrNavigateBack(oContext, totalProcessed); } }
                  );
                },
                onError: function (sMsg, processed, total) {
                  MessageBox.error(
                    sMsg + "\n\n" + processed + " of " + total + " entries were processed before the error.",
                    { title: "Restart Error", onClose: function () { window.location.reload(); } }
                  );
                }
              });
            }
          }
        });
      });
    },
    // Delete action: Permanently delete entries (non-recoverable)
    onDeleteMessage: function (oContext, aSelectedContexts) {
      if (!Array.isArray(aSelectedContexts) || aSelectedContexts.length === 0) {
        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
          MessageBox.warning("No entries selected for deletion.", { title: "Delete" });
        });
        return;
      }

      var count = aSelectedContexts.length;
      var sMessage = count === 1
        ? "Are you sure you want to delete the selected entry? It won't be possible to restore it."
        : "Are you sure you want to delete " + count + " entries? They won't be possible to restore.";

      sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
        MessageBox.confirm(sMessage, {
          title: "Confirm Delete",
          onClose: function (sAction) {
            if (sAction === MessageBox.Action.OK) {
              // Extract datastore name from root context
              var sDataStoreName = oContext && oContext.getObject && oContext.getObject().DataStoreName;
              if (!sDataStoreName) {
                MessageBox.error("Cannot determine datastore name", { title: "Delete Error" });
                return;
              }

              // Extract IDs from selected contexts
              var aIds = [];
              for (var i = 0; i < aSelectedContexts.length; i++) {
                var oData = aSelectedContexts[i] && aSelectedContexts[i].getObject && aSelectedContexts[i].getObject();
                if (oData && oData.ID) {
                  aIds.push(oData.ID);
                }
              }

              if (aIds.length === 0) {
                MessageBox.error("Could not extract entry IDs", { title: "Delete Error" });
                return;
              }

              var sServiceBase = _getServiceBase(oContext);
              var sActionName = "DeleteEntries";

              _executeBatched({
                serviceBase: sServiceBase,
                actionName: sActionName,
                entryIds: aIds,
                title: "Deleting…",
                buildPayload: function (chunkIds) {
                  return { dataStoreName: sDataStoreName, entryIds: chunkIds };
                },
                onComplete: function (totalProcessed) {
                  sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
                    MessageBox.success(
                      totalProcessed + " message(s) deleted successfully from " + sDataStoreName,
                      { title: "Delete Complete", onClose: function () { _reloadOrNavigateBack(oContext, totalProcessed); } }
                    );
                  });
                },
                onError: function (sMsg, processed, total) {
                  sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
                    MessageBox.error(
                      sMsg + "\n\n" + processed + " of " + total + " entries were processed before the error.",
                      { title: "Delete Error", onClose: function () { window.location.reload(); } }
                    );
                  });
                }
              });
            }
          }
        });
      });
    },
    // Move to No-Retry action: Move entries to no-retry datastore
    onMoveToNoRetry: function (oContext, aSelectedContexts) {
      if (!Array.isArray(aSelectedContexts) || aSelectedContexts.length === 0) {
        sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
          MessageBox.warning("No entries selected to move.", { title: "Move to No-Retry" });
        });
        return;
      }

      var count = aSelectedContexts.length;
      var sMessage = count === 1
        ? "Move the selected entry to No-Retry?"
        : "Move " + count + " entries to No-Retry?";

      sap.ui.require(["sap/m/MessageBox"], function (MessageBox) {
        MessageBox.confirm(sMessage, {
          title: "Confirm Move",
          onClose: function (sAction) {
            if (sAction === MessageBox.Action.OK) {
              // Datastore name from OP context (used in API dsname)
              var sSourceDS = oContext && oContext.getObject && oContext.getObject().DataStoreName;
              if (!sSourceDS) {
                MessageBox.error("Cannot determine datastore name", { title: "Move Error" });
                return;
              }

              // IDs
              var aIds = [];
              for (var i = 0; i < aSelectedContexts.length; i++) {
                var oData = aSelectedContexts[i] && aSelectedContexts[i].getObject && aSelectedContexts[i].getObject();
                if (oData && oData.ID) {
                  aIds.push(oData.ID);
                }
              }

              if (aIds.length === 0) {
                MessageBox.error("Could not extract entry IDs", { title: "Move Error" });
                return;
              }

              var sServiceBase = _getServiceBase(oContext);
              var sActionName = "MoveToNoRetry";

              _executeBatched({
                serviceBase: sServiceBase,
                actionName: sActionName,
                entryIds: aIds,
                title: "Moving to No-Retry…",
                buildPayload: function (chunkIds) {
                  return { dataStoreName: sSourceDS, entryIds: chunkIds };
                },
                onComplete: function (totalProcessed) {
                  MessageBox.success(
                    totalProcessed + " message(s) moved successfully from " + sSourceDS + " to No-Retry",
                    { title: "Move Complete", onClose: function () { _reloadOrNavigateBack(oContext, totalProcessed); } }
                  );
                },
                onError: function (sMsg, processed, total) {
                  MessageBox.error(
                    sMsg + "\n\n" + processed + " of " + total + " entries were processed before the error.",
                    { title: "Move Error", onClose: function () { window.location.reload(); } }
                  );
                }
              });
            }
          }
        });
      });
    },

    // Delete single entry from detail page with navigation back to list
    onDeleteDetailEntry: function (oBindingContext, aSelectedContexts) {
      var oContext = oBindingContext;
      
      sap.ui.require(["sap/m/MessageBox", "sap/ui/core/BusyIndicator"], function (MessageBox, BusyIndicator) {
        var oData = oContext && oContext.getObject && oContext.getObject();
        var sEntryId = oData && oData.ID;
        var sDataStoreName = oData && oData.DataStoreName;
        
        if (!sEntryId || !sDataStoreName) {
          MessageBox.error("Missing entry ID or DataStore name", { title: "Delete Error" });
          return;
        }
        
        MessageBox.confirm(
          "Are you sure you want to delete this entry?",
          {
            title: "Delete Entry",
            onClose: function (sAction) {
              if (sAction !== MessageBox.Action.OK) {
                return;
              }
              
              BusyIndicator.show();
              
              var sServiceBase = _getServiceBase(oContext);
              
              _postWithCsrf(sServiceBase, "DeleteEntries", {
                dataStoreName: sDataStoreName,
                entryIds: [sEntryId]
              }).then(function (oResponse) {
                BusyIndicator.hide();
                
                if (oResponse.ok) {
                  window.history.back();
                  
                  setTimeout(function() {
                    MessageBox.success("Entry deleted successfully.", {
                      title: "Delete Successful",
                      onClose: function() {
                        // Check if the datastore still exists; if not, go to overview
                        fetch(sServiceBase + "DataStores('" + encodeURIComponent(sDataStoreName) + "')")
                          .then(function(r) { return r.ok ? window.location.reload() : _navigateToOverview(); })
                          .catch(function() { _navigateToOverview(); });
                      }
                    });
                  }, 300);
                } else {
                  return oResponse.json().then(function (oError) {
                    var sErrorMsg = (oError && oError.error && oError.error.message) ? oError.error.message : "Delete failed with status " + oResponse.status;
                    MessageBox.error(sErrorMsg, { title: "Delete Error" });
                  }).catch(function () {
                    MessageBox.error("Delete failed with status " + oResponse.status, { title: "Delete Error" });
                  });
                }
              }).catch(function(oError) {
                BusyIndicator.hide();
                var sErrorMsg = (oError && oError.message) ? oError.message : "Delete failed";
                MessageBox.error(sErrorMsg, { title: "Delete Error" });
              });
            }
          }
        );
      });
    },

    // Move single entry to No-Retry from detail page with navigation back to list
    onMoveToNoRetryDetailEntry: function (oBindingContext, aSelectedContexts) {
      var oContext = oBindingContext;
      
      sap.ui.require(["sap/m/MessageBox", "sap/ui/core/BusyIndicator"], function (MessageBox, BusyIndicator) {
        var oData = oContext && oContext.getObject && oContext.getObject();
        var sEntryId = oData && oData.ID;
        var sDataStoreName = oData && oData.DataStoreName;
        
        if (!sEntryId || !sDataStoreName) {
          MessageBox.error("Missing entry ID or DataStore name", { title: "Move Error" });
          return;
        }
        
        // Show confirmation dialog
        MessageBox.confirm(
          "Move this entry to No-Retry?",
          {
            title: "Confirm Move",
            onClose: function (sAction) {
              if (sAction !== MessageBox.Action.OK) {
                return;
              }
              
              BusyIndicator.show();
              
              var sServiceBase = _getServiceBase(oContext);
              var sActionName = "MoveToNoRetry";
              
              // Call the MoveToNoRetry action
              _postWithCsrf(sServiceBase, sActionName, {
                dataStoreName: sDataStoreName,
                entryIds: [sEntryId]
              }).then(function(oResponse) {
                BusyIndicator.hide();
                
                if (oResponse.ok) {
                  return oResponse.json().then(function(oResult) {
                    // Derive target datastore name (replace Retry with NoRetry)
                    var sTargetDS = sDataStoreName.replace(/Retry$/i, "NoRetry");
                    if (sTargetDS === sDataStoreName) {
                      sTargetDS = sDataStoreName + "_NoRetry";
                    }
                    var sSuccessMsg = "1 message moved successfully from " + sDataStoreName + " to " + sTargetDS;
                    
                    // Navigate back first
                    window.history.back();
                    
                    // Show success message after navigation
                    setTimeout(function() {
                      MessageBox.success(sSuccessMsg, {
                        title: "Move Complete",
                        onClose: function() {
                          fetch(sServiceBase + "DataStores('" + encodeURIComponent(sDataStoreName) + "')")
                            .then(function(r) { return r.ok ? window.location.reload() : _navigateToOverview(); })
                            .catch(function() { _navigateToOverview(); });
                        }
                      });
                    }, 300);
                  });
                } else {
                  // Move failed - stay on detail page and show error
                  return oResponse.text().then(function(sText) {
                    var sErrorMsg = "Move failed: HTTP " + oResponse.status;
                    try {
                      var oError = JSON.parse(sText);
                      if (oError && oError.error && oError.error.message) {
                        sErrorMsg = oError.error.message;
                      }
                    } catch (e) {}
                    MessageBox.error(sErrorMsg, { title: "Move Error" });
                  }).catch(function() {
                    MessageBox.error("Move failed with status " + oResponse.status, { title: "Move Error" });
                  });
                }
              }).catch(function(oError) {
                // Move failed - stay on detail page and show error
                BusyIndicator.hide();
                console.error("[CustomActions] MoveToNoRetry action failed:", oError);
                var sErrorMsg = (oError && oError.message) ? oError.message : "Move failed";
                MessageBox.error(sErrorMsg, { title: "Move Error" });
              });
            }
          }
        );
      });
    },

    // Restart single entry from detail page with navigation back to list
    onRestartDetailEntry: function (oBindingContext, aSelectedContexts) {
      var oContext = oBindingContext;
      
      sap.ui.require(["sap/m/MessageBox", "sap/ui/core/BusyIndicator"], function (MessageBox, BusyIndicator) {
        var oData = oContext && oContext.getObject && oContext.getObject();
        var sEntryId = oData && oData.ID;
        var sDataStoreName = oData && oData.DataStoreName;
        
        if (!sEntryId || !sDataStoreName) {
          MessageBox.error("Missing entry ID or DataStore name", { title: "Restart Error" });
          return;
        }
        
        // Show confirmation dialog
        MessageBox.confirm(
          "Restart this entry?",
          {
            title: "Confirm Restart",
            onClose: function (sAction) {
              if (sAction !== MessageBox.Action.OK) {
                return;
              }
              
              BusyIndicator.show();
              
              var sServiceBase = _getServiceBase(oContext);
              var sActionName = "Restart";
              
              // Call the Restart action
              _postWithCsrf(sServiceBase, sActionName, {
                dataStoreName: sDataStoreName,
                entryIds: [sEntryId]
              }).then(function(oResponse) {
                BusyIndicator.hide();
                
                if (oResponse.ok) {
                  return oResponse.json().then(function(oResult) {
                    var sSuccessMsg = (oResult && (oResult.message || oResult.Message || oResult.result)) || "1 message restarted successfully from " + sDataStoreName;
                    if (typeof sSuccessMsg !== "string") { sSuccessMsg = JSON.stringify(sSuccessMsg); }
                    
                    // Navigate back first
                    window.history.back();
                    
                    // Show success message after navigation
                    setTimeout(function() {
                      MessageBox.success(sSuccessMsg, {
                        title: "Restart Complete",
                        onClose: function() {
                          fetch(sServiceBase + "DataStores('" + encodeURIComponent(sDataStoreName) + "')")
                            .then(function(r) { return r.ok ? window.location.reload() : _navigateToOverview(); })
                            .catch(function() { _navigateToOverview(); });
                        }
                      });
                    }, 300);
                  });
                } else {
                  // Restart failed - stay on detail page and show error
                  return oResponse.text().then(function(sText) {
                    var sErrorMsg = "Restart failed: HTTP " + oResponse.status;
                    try {
                      var oError = JSON.parse(sText);
                      if (oError && oError.error && oError.error.message) {
                        sErrorMsg = oError.error.message;
                      }
                    } catch (e) {}
                    MessageBox.error(sErrorMsg, { title: "Restart Error" });
                  }).catch(function() {
                    MessageBox.error("Restart failed with status " + oResponse.status, { title: "Restart Error" });
                  });
                }
              }).catch(function(oError) {
                // Restart failed - stay on detail page and show error
                BusyIndicator.hide();
                console.error("[CustomActions] Restart action failed:", oError);
                var sErrorMsg = (oError && oError.message) ? oError.message : "Restart failed";
                MessageBox.error(sErrorMsg, { title: "Restart Error" });
              });
            }
          }
        );
      });
    },

  // Move single entry from detail page to another datastore with navigation back to list
  onMoveToDataStoreDetailEntry: function (oBindingContext, aSelectedContexts) {
      var oContext = oBindingContext;

      sap.ui.require(["sap/m/Dialog","sap/m/Button","sap/m/ComboBox","sap/m/MessageBox","sap/ui/core/BusyIndicator","sap/ui/core/ListItem"],
        function(Dialog, Button, ComboBox, MessageBox, BusyIndicator, ListItem) {
        var oData = oContext && oContext.getObject && oContext.getObject();
        var sEntryId = oData && oData.ID;
        var sDataStoreName = oData && oData.DataStoreName;
        
        if (!sEntryId || !sDataStoreName) {
          MessageBox.error("Missing entry ID or DataStore name", { title: "Move Error" });
          return;
        }

        // Fetch datastores and prompt with dropdown
          var sServiceBase = _getServiceBase(oContext);
          BusyIndicator.show(0);
          fetch(sServiceBase + "DataStores?$select=DataStoreName")
            .then(function(resp){
              if (!resp.ok) { throw new Error("Failed to load datastores: " + resp.status); }
              return resp.json();
            })
            .then(function(data){
              BusyIndicator.hide();
              var aStores = (data && data.value) ? data.value : [];

              var oCombo = new ComboBox({
                placeholder: "Select target Data Store",
                showSecondaryValues: false,
                allowCustomValue: true,
                width: "100%"
              });
              // Exclude current datastore from dropdown 
              aStores.forEach(function(s){
                if (s && s.DataStoreName && s.DataStoreName !== sDataStoreName) {
                  oCombo.addItem(new ListItem({ key: s.DataStoreName, text: s.DataStoreName }));
                }
              });

              var oDialog = new Dialog({
                title: "Move to Data Store",
                content: oCombo,
                beginButton: new Button({
                  text: "Move",
                  press: function() {
                    var sTarget = (oCombo.getSelectedKey() || oCombo.getValue() || "").trim();
                    if (!sTarget) {
                      MessageBox.warning("Please select or enter a target Data Store name.");
                      return;
                    }
                    oDialog.close();
                    BusyIndicator.show(0);

                    var sActionName = "MoveToDataStore";

                    _postWithCsrf(sServiceBase, sActionName, {
                      dataStoreName: sDataStoreName,
                      targetDataStoreName: sTarget,
                      entryIds: [sEntryId]
                    }).then(function(oResponse) {
                      BusyIndicator.hide();
                      
                      if (oResponse.ok) {
                        return oResponse.json().then(function(oResult) {
                          var sSuccessMsg = "1 message moved successfully from " + sDataStoreName + " to " + sTarget;   
                          
                          // Navigate back first
                          window.history.back();
                          
                          // Show success message after navigation
                          setTimeout(function() {
                            MessageBox.success(sSuccessMsg, {
                              title: "Move Complete",
                              onClose: function() {
                                fetch(sServiceBase + "DataStores('" + encodeURIComponent(sDataStoreName) + "')")
                                  .then(function(r) { return r.ok ? window.location.reload() : _navigateToOverview(); })
                                  .catch(function() { _navigateToOverview(); });
                              }
                            });
                          }, 300);
                        });
                      } else {
                        // Move failed - stay on detail page and show error
                        return oResponse.text().then(function(sText) {
                          var sErrorMsg = "Move failed: HTTP " + oResponse.status;
                          try {
                            var oError = JSON.parse(sText);
                            if (oError && oError.error && oError.error.message) {
                              sErrorMsg = oError.error.message;
                            }
                          } catch (e) {}
                          MessageBox.error(sErrorMsg, { title: "Move Error" });
                        }).catch(function() {
                          MessageBox.error("Move failed with status " + oResponse.status, { title: "Move Error" });
                        });
                      }
                    }).catch(function(oError) {
                      // Move failed - stay on detail page and show error
                      BusyIndicator.hide();
                      console.error("[CustomActions] MoveToDataStore action failed:", oError);
                      var sErrorMsg = (oError && oError.message) ? oError.message : "Move failed";
                      MessageBox.error(sErrorMsg, { title: "Move Error" });
                    });
                  }
                }),
                endButton: new Button({
                  text: "Cancel",
                  press: function() {
                    oDialog.close();
                  }
                }),
                afterClose: function() {
                  oDialog.destroy();
                }
              });
              oDialog.open();
            })
            .catch(function(err){
              BusyIndicator.hide();
              MessageBox.error("Failed to load datastores: " + err.message, { title: "Move Error" });
            });
      });
    }

  };
});
