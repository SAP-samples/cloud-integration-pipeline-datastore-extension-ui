sap.ui.define(
    ["sap/fe/core/AppComponent"],
    function (Component) {
        "use strict";

        return Component.extend("datastoresui.Component", {
            metadata: {
                manifest: "json"
            },

            init: function () {
                Component.prototype.init.apply(this, arguments);

                // Load custom CSS (ensures it works in FLP/managed approuter)
                var sPath = sap.ui.require.toUrl("datastoresui/css/style.css");
                sap.ui.requireSync; // ensure core is loaded
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