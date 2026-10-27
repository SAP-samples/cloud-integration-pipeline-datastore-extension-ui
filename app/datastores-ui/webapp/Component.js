sap.ui.define(
    ["sap/fe/core/AppComponent", "sap/ui/model/json/JSONModel"],
    function (Component, JSONModel) {
        "use strict";

        return Component.extend("datastoresui.Component", {
            metadata: {
                manifest: "json"
            },

            init: function () {
                var sTenantId = sessionStorage.getItem("datastores_tenantId") || "";

                Component.prototype.init.apply(this, arguments);

                // Set X-Tenant-Id on the OData V4 model so all data requests use the selected tenant.
                // window.fetch interception does NOT work for OData V4 model requests (they use XHR).
                if (sTenantId) {
                    var oModel = this.getModel();
                    if (oModel && typeof oModel.changeHttpHeaders === "function") {
                        oModel.changeHttpHeaders({ "X-Tenant-Id": sTenantId });
                    }
                }

                // Load tenants for the "Select Tenant" dialog dropdown
                // Use OData model binding instead of fetch() so routing works in deployed version too
                var that = this;
                var oModel = this.getModel();
                if (oModel) {
                    oModel.bindList("/Tenants").requestContexts(0, 100)
                        .then(function (aContexts) {
                            var aTenants = aContexts.map(function (c) { return c.getObject(); });
                            that.setModel(new JSONModel({
                                tenants: aTenants,
                                selectedTenantId: sTenantId || ""
                            }), "tenantModel");
                        })
                        .catch(function (e) {
                            console.error("[Tenant] Failed to load tenants:", e);
                        });
                }

                // Load custom CSS (ensures it works in FLP/managed approuter)
                var sPath = sap.ui.require.toUrl("datastoresui/css/style.css");
                if (!document.querySelector("link[href*='css/style.css']")) {
                    var oLink = document.createElement("link");
                    oLink.rel = "stylesheet";
                    oLink.href = sPath;
                    document.head.appendChild(oLink);
                }
            }
        });
    }
);