using ExternalService as service from '../../srv/service';

annotate service.DataStores with {
    DataStoreName   @Common.Label : 'Datastore Name';
    NumberOfMessages @Common.Label : 'Number of Messages';
    NumberOfOverdueMessages @Common.Label : 'Number of Overdue Messages';
};

annotate service.DataStores with @(
    Capabilities.FilterRestrictions : {
        FilterExpressionRestrictions: [
            { Property: DataStoreName, AllowedExpressions: #SingleValue }
        ]
    },

    UI : { HeaderInfo : {
        TypeName : 'Datastore',
        TypeNamePlural : 'Datastores',
        Title : {
            $Type : 'UI.DataField',
            Value : DataStoreName
        },
        },
    },

    UI.FieldGroup #GeneratedGroup : {
        $Type : 'UI.FieldGroupType',
        Data : [
            {
                $Type : 'UI.DataField',
                Label : 'Datastore Name',
                Value : DataStoreName,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Messages',
                Value : NumberOfMessages,
            },
            {
                $Type : 'UI.DataField',
                Label : 'Overdue Messages',
                Value : NumberOfOverdueMessages,
            },
        ],
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'GeneratedFacet1',
            Label : 'General Information',
            Target : '@UI.FieldGroup#GeneratedGroup',
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'DataStoreEntriesFacet',
            Label : 'Datastore Entries',
            Target : 'to_Entries/@UI.LineItem',
        }
    ],
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'Datastore Name',
            Value : DataStoreName,
            ![@HTML5.CssDefaults] : { width: '33%' }
        },
        {
            $Type : 'UI.DataField',
            Label : 'Messages',
            Value : NumberOfMessages,
            ![@HTML5.CssDefaults] : { width: '33%' }
        },
        {
            $Type : 'UI.DataField',
            Label : 'Overdue Messages',
            Value : NumberOfOverdueMessages,
            ![@HTML5.CssDefaults] : { width: '33%' }
        }
    ],
);


annotate service.DataStoreEntries with @(
    Capabilities.FilterRestrictions : {
        NonFilterableProperties: [
            customheaderproperties,
            DataStoreName,
            Error,
            exceptionsourcemplid,
            exceptiontimestamp,
            maxjmsretries,
            partnerid,
            Payload,
            pipelinestepid,
            ResponseHeaders,
            sap_headers
        ],
        FilterExpressionRestrictions: [
            { Property: UTCTimestampOfError, AllowedExpressions: #MultiRangeOrSearchExpression },
            { Property: ID, AllowedExpressions: #SearchExpression },
            { Property: ScenarioID, AllowedExpressions: #SearchExpression },
            { Property: ProcessingStage, AllowedExpressions: #SearchExpression },
            { Property: Receiver, AllowedExpressions: #SearchExpression },
            { Property: MPL_ID, AllowedExpressions: #SearchExpression },
            { Property: NumberOfDSRestarts, AllowedExpressions: #SearchExpression }
        ]
    },
    Capabilities.SortRestrictions : {
        NonSortableProperties: [
            customheaderproperties,
            DataStoreName,
            Error,
            exceptionsourcemplid,
            exceptiontimestamp,
            maxjmsretries,
            partnerid,
            Payload,
            pipelinestepid,
            ResponseHeaders,
            sap_headers,
            ID,
            ScenarioID,
            ProcessingStage,
            Receiver,
            MPL_ID
        ]
    },
    UI.LineItem : [
        {
            $Type : 'UI.DataField',
            Label : 'ID',
            Value : ID,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Scenario ID',
            Value : ScenarioID,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Processing Stage',
            Value : ProcessingStage,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Receiver',
            Value : Receiver,
        },
        {
            $Type : 'UI.DataField',
            Label : 'MPL ID',
            Value : MPL_ID,
        },
        {
            $Type : 'UI.DataField',
            Label : 'UTC Timestamp Of Error',
            Value : UTCTimestampOfError,
        },
        {
            $Type : 'UI.DataField',
            Label : 'Number of Restarts',
            Value : NumberOfDSRestarts,
        },
    ],
    UI.HeaderInfo : {
        TypeName : 'Data Store Entry',
        TypeNamePlural : 'Data Store Entries',
        Title : {
            $Type : 'UI.DataField',
            Value : ID
        },
        Description : {
            $Type : 'UI.DataField',
            Value : ProcessingStage
        }
    },
    UI.Facets : [
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'EntryDetails',
            Label : 'Entry Details',
            Target : '@UI.FieldGroup#EntryDetails'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'ErrorFacet',
            Label : 'Error',
            Target : '@UI.FieldGroup#ErrorBlock'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'HeadersFacet',
            Label : 'HTTP Headers',
            Target : '@UI.FieldGroup#HeadersBlock'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID : 'PayloadFacet',
            Label : 'Payload',
            Target : '@UI.FieldGroup#PayloadBlock'
        }
    ],
    UI.FieldGroup #EntryDetails : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Label : 'ID', Value : ID },
            { $Type : 'UI.DataField', Label : 'Datastore Name', Value : DataStoreName },
            { $Type : 'UI.DataField', Label : 'Scenario ID', Value : ScenarioID },
            { $Type : 'UI.DataField', Label : 'Processing Stage', Value : ProcessingStage },
            { $Type : 'UI.DataField', Label : 'Receiver', Value : Receiver },
            { $Type : 'UI.DataField', Label : 'UTC Timestamp Of Error', Value : UTCTimestampOfError },
            { $Type : 'UI.DataField', Label : 'MPL ID', Value : MPL_ID },
            { $Type : 'UI.DataField', Label : 'Number of Restarts', Value : NumberOfDSRestarts }
        ]
    },
    
    UI.FieldGroup #ErrorBlock : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Label : 'Error', Value : Error }
        ]
    },
    UI.FieldGroup #HeadersBlock : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Label : 'Custom Header Properties (decoded)', Value : customheaderproperties },
            { $Type : 'UI.DataField', Label : 'Max JMS Retries', Value : maxjmsretries },
            { $Type : 'UI.DataField', Label : 'Partner ID', Value : partnerid },
            { $Type : 'UI.DataField', Label : 'Pipeline Step ID', Value : pipelinestepid },
            { $Type : 'UI.DataField', Label : 'Exception Timestamp', Value : exceptiontimestamp },
            { $Type : 'UI.DataField', Label : 'Exception Source MPL ID', Value : exceptionsourcemplid },
            { $Type : 'UI.DataField', Label : 'SAP Headers', Value : sap_headers }
        ]
    },
    UI.FieldGroup #PayloadBlock : {
        $Type : 'UI.FieldGroupType',
        Data : [
            { $Type : 'UI.DataField', Label : 'Payload', Value : Payload },
            {
                $Type : 'UI.DataFieldForAction',
                Label : 'Decode Payload',
                Action : 'ExternalService.DecodePayload',
                InvocationGrouping : #Isolated
            }
        ]
    }
);

annotate service.DataStoreEntries with {
    Error @UI.MultiLineText;
    ResponseHeaders @UI.MultiLineText;
    Payload @UI.MultiLineText;
    customheaderproperties @UI.MultiLineText;
    sap_headers @UI.MultiLineText;
};

// Ensure FE refreshes Payload after DecodePayload action
annotate service.DataStoreEntries with actions {
    DecodePayload @Common.SideEffects : {
        TargetEntities : [ '_it' ]
    };
};

// Add SelectionFields for the to_Entries table in the Object Page
annotate service.DataStores.to_Entries with @(
    UI.SelectionFields : [
        ProcessingStage,
        ScenarioID,
        Receiver,
        MPL_ID
    ]
);