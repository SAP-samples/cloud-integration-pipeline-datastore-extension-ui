// Controller extension for handling DecodePayload action callback
sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension"
], function (ControllerExtension) {
  "use strict";

  return ControllerExtension.extend("datastoresui.ext.ControllerExt", {
    onAfterAction: function (mParameters) {
      this._handleAfterAction(mParameters);
    },

    _handleAfterAction: function (mParameters) {
      try {
        var sActionName = mParameters && (
          (typeof mParameters.action?.getName === "function" ? mParameters.action.getName() : null) ||
          mParameters.action?.name ||
          mParameters.name
        );

        if (sActionName !== "ExternalService.DecodePayload" && sActionName !== "DecodePayload") {
          return;
        }

        var oView = this.base?.getView?.();
        var oCtx = oView?.getBindingContext?.();
        if (!oCtx?.getModel?.()) return;

        var oData = oCtx.getObject?.();
        if (!oData) return;
        
        var oResult = mParameters?.result || mParameters?.response || mParameters?.parameters?.result;
        if (oResult?.Payload !== undefined) {
          oData.Payload = oResult.Payload || "";
          oCtx.getModel().refresh();
        }
      } catch (e) {
        // Silent fail to protect FE flow
      }
    }
  });
});
