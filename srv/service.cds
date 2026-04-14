service ExternalService {

    @Capabilities.Deletable: false
    @Capabilities.Updatable: false
    entity DataStores {
        key DataStoreName : String;
        NumberOfMessages : Integer;
        NumberOfOverdueMessages : Integer;
        to_Entries : Composition of many DataStoreEntries on to_Entries.DataStoreName = $self.DataStoreName;
        
    }

    @Capabilities.Insertable: false
    @Capabilities.Deletable: false
    @Capabilities.Updatable: false
    entity DataStoreEntries {
        key ID : String;
        DataStoreName : String;
        ScenarioID : String;
        ProcessingStage : String;
        Receiver : String;
        UTCTimestampOfError : String;
        MPL_ID : String;
        NumberOfDSRestarts : Integer;
        
        // Additional fields for details view
        Error : String;
        ResponseHeaders : LargeString;
        Payload : LargeString;
        customheaderproperties : LargeString;
        maxjmsretries : String;
        partnerid : String;
        pipelinestepid : String;
        exceptiontimestamp : String;
        exceptionsourcemplid : String;
        sap_headers : LargeString;
    }

    actions {
        action DecodePayload() returns DataStoreEntries; // return the entity so FE can merge Payload
    }
        // Unbound actions to delete, move and restart selected entries
        action DeleteEntries(dataStoreName: String, entryIds: array of String) returns Boolean;
        action MoveToDataStore(dataStoreName: String, targetDataStoreName: String, entryIds: array of String) returns Boolean;
        action MoveToNoRetry(dataStoreName: String, entryIds: array of String) returns Boolean;
        action Restart(dataStoreName: String, entryIds: array of String) returns Boolean;

        

}

