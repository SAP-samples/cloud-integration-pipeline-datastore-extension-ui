// Load environment variables from .env file (for local development)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const cds = require('@sap/cds');
const LOG = cds.log('external-service');

const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

// External API configuration - read from environment variables
const ENV_CONFIG = {
  OAUTH_TOKEN_URL: process.env.OAUTH_TOKEN_URL,
  OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET,
  API_BASE_URL: process.env.API_BASE_URL // Data Store Retry API base URL (without trailing slash)
};

// Validate that all required environment variables are set
function validateEnvironmentVariables() {
  const required = ['OAUTH_TOKEN_URL', 'OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'API_BASE_URL'];
  const missing = required.filter(key => !ENV_CONFIG[key]);
  
  if (missing.length > 0) {
    const errorMsg = `Missing required environment variables: ${missing.join(', ')}.\n` +
      `Please set these variables before starting the application:\n` +
      `  OAUTH_TOKEN_URL=${ENV_CONFIG.OAUTH_TOKEN_URL || 'https://your-auth-endpoint/oauth/token'}\n` +
      `  OAUTH_CLIENT_ID=${ENV_CONFIG.OAUTH_CLIENT_ID || 'your-client-id'}\n` +
      `  OAUTH_CLIENT_SECRET=${ENV_CONFIG.OAUTH_CLIENT_SECRET || '***'}\n` +
      `  API_BASE_URL=${ENV_CONFIG.API_BASE_URL || 'https://your-api-endpoint/http/pipeline/api/v1'}`;
    throw new Error(errorMsg);
  }

}

// Helper function to get OAuth access token
async function getAccessToken() {
  const tokenResponse = await executeHttpRequest(
    { url: ENV_CONFIG.OAUTH_TOKEN_URL },
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: `grant_type=client_credentials&client_id=${encodeURIComponent(ENV_CONFIG.OAUTH_CLIENT_ID)}&client_secret=${encodeURIComponent(ENV_CONFIG.OAUTH_CLIENT_SECRET)}`
    },
    { fetchCsrfToken: false }
  );
  
  const accessToken = tokenResponse.data && tokenResponse.data.access_token;
  if (!accessToken) {
    throw new Error('Failed to obtain access token from OAuth endpoint');
  }
  
  return accessToken;
}


// Extract field values from entryID for DataStoreEntries Table
function getDsEntryAttributes(entryId) {
  const pattern = /^(.+?)~\(([A-Za-z0-9]{2})\)(?:~(.+?))?~([A-Za-z0-9_-]{28})~(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)(?:~(\d{1,4}))?$/;
  const matcher = entryId.match(pattern);
  if (matcher) {
    return {
      ScenarioID: matcher[1],
      ProcessingStage: matcher[2] === 'OB' ? 'Outbound' : matcher[2] === 'IB' ? 'Inbound' : matcher[2],
      Receiver: matcher[3] || null,
      MPL_ID: matcher[4],
      UTCTimestampOfError: matcher[5],
      NumberOfDSRestarts: matcher[6] ? Number(matcher[6]) : 0
    };
  } else {
    return {
      ScenarioID: null,
      ProcessingStage: null,
      Receiver: null,
      MPL_ID: null,
      UTCTimestampOfError: null,
      NumberOfDSRestarts: 0
    };
  }
}

// Helper: strip surrounding quotes from search input
function stripQuotes(s) {
  return (s || "").replace(/^"+|"+$/g, "").trim();
}

// Helper: normalize string for search (case-insensitive, unicode-safe)
function normalizeSearch(s) {
  if (!s && s !== 0) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-z0-9]/g, "");
}



module.exports = cds.service.impl(function() {
  validateEnvironmentVariables();


  // DataStores READ handler - list of datastores on first UI screen
  this.on('READ', 'DataStores', async (req) => {
    try {
      const accessToken = await getAccessToken();

      // Request all fields including Visibility to enable filtering
      const apiResponse = await executeHttpRequest(
        {
          url: `${ENV_CONFIG.API_BASE_URL}/dsretry?$select=DataStoreName,NumberOfMessages,NumberOfOverdueMessages,Visibility`
        },
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          },
          validateStatus: () => true
        }
      );

      // Log API response status for troubleshooting
      if (apiResponse.status && apiResponse.status !== 200) {
        LOG.warn('External API returned status:', apiResponse.status, '- Response:', JSON.stringify(apiResponse.data).substring(0, 300));
      }

      // Extract all DataStores from response (API returns object when single, array when multiple)
      const rawStores = apiResponse.data && apiResponse.data.DataStore ? apiResponse.data.DataStore : [];
      const allStores = Array.isArray(rawStores) ? rawStores : [rawStores];
      
      // Filter for Visibility = "Global" (case-insensitive)
      const globalStores = allStores.filter(entry => {
        const visibility = (entry.Visibility || '').toString().toLowerCase();
        return visibility === 'global';
      });

      // Map to expected format
      const processedData = globalStores.map(entry => ({
        DataStoreName: String(entry.DataStoreName),
        NumberOfMessages: Number(entry.NumberOfMessages) || 0,
        NumberOfOverdueMessages: Number(entry.NumberOfOverdueMessages) || 0
      }));

      // support OData $search for List Report BasicSearch (case-insensitive, normalized)
      const rawListSearch = (req && req.data && req.data.$search) ||
                            (req && req._ && req._.req && req._.req.query && req._.req.query.$search) || "";
      const qList = normalizeSearch(stripQuotes(rawListSearch));

      let resultStores = processedData;
      if (qList) {
        resultStores = processedData.filter(s => normalizeSearch(s.DataStoreName).includes(qList));
      }

      // support OData $filter from filter bar
      const filterStr = req.query?.$filter || req._?.req?.query?.$filter || "";
      if (filterStr) {
        let match;

        // contains(Property,'value') — string contains
        const containsRegex = /contains\s*\(\s*(\w+)\s*,\s*'([^']*)'\s*\)/gi;
        while ((match = containsRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = match[2].toLowerCase();
          resultStores = resultStores.filter(e => String(e[prop] ?? '').toLowerCase().includes(val));
        }

        // Property eq 'value' — for DataStoreName treat eq as contains
        const eqStringRegex = /(\w+)\s+eq\s+'([^']*)'/gi;
        while ((match = eqStringRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = match[2].toLowerCase();
          if (prop === 'DataStoreName') {
            resultStores = resultStores.filter(e => String(e[prop] ?? '').toLowerCase().includes(val));
          } else {
            resultStores = resultStores.filter(e => String(e[prop] ?? '').toLowerCase() === val);
          }
        }

        // Property eq 123 — numeric equal
        const eqNumRegex = /(\w+)\s+eq\s+(\d+)(?!\s*')/gi;
        while ((match = eqNumRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = parseInt(match[2], 10);
          resultStores = resultStores.filter(e =>
            typeof e[prop] === 'number' ? e[prop] === val : String(e[prop] ?? '') === String(val)
          );
        }

        // Property ne 123 — numeric not equal
        const neNumRegex = /(\w+)\s+ne\s+(\d+)/gi;
        while ((match = neNumRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = parseInt(match[2], 10);
          resultStores = resultStores.filter(e =>
            typeof e[prop] === 'number' ? e[prop] !== val : String(e[prop] ?? '') !== String(val)
          );
        }

        // Property lt 123 — less than
        const ltRegex = /(\w+)\s+lt\s+(\d+)/gi;
        while ((match = ltRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = parseInt(match[2], 10);
          resultStores = resultStores.filter(e => {
            const fv = typeof e[prop] === 'number' ? e[prop] : parseInt(e[prop], 10) || 0;
            return fv < val;
          });
        }

        // Property le 123 — less than or equal (standalone, not part of between)
        const leRegex = /(\w+)\s+le\s+(\d+)(?!\s)/gi;
        while ((match = leRegex.exec(filterStr)) !== null) {
          // skip if this is part of a ge...and...le between pattern
          if (/\w+\s+ge\s+\d+\s+and\s+\w+\s+le\s+/i.test(filterStr)) continue;
          const prop = match[1];
          const val = parseInt(match[2], 10);
          resultStores = resultStores.filter(e => {
            const fv = typeof e[prop] === 'number' ? e[prop] : parseInt(e[prop], 10) || 0;
            return fv <= val;
          });
        }

        // Property gt 123 — greater than
        const gtRegex = /(\w+)\s+gt\s+(\d+)/gi;
        while ((match = gtRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = parseInt(match[2], 10);
          resultStores = resultStores.filter(e => {
            const fv = typeof e[prop] === 'number' ? e[prop] : parseInt(e[prop], 10) || 0;
            return fv > val;
          });
        }

        // Property ge 123 — greater than or equal (standalone, not part of between)
        const geRegex = /(\w+)\s+ge\s+(\d+)(?!\s+and)/gi;
        while ((match = geRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = parseInt(match[2], 10);
          resultStores = resultStores.filter(e => {
            const fv = typeof e[prop] === 'number' ? e[prop] : parseInt(e[prop], 10) || 0;
            return fv >= val;
          });
        }

        // Property ge 123 and Property le 456 — between (numeric range)
        const betweenNumRegex = /(\w+)\s+ge\s+(\d+)\s+and\s+\1\s+le\s+(\d+)/gi;
        while ((match = betweenNumRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const fromVal = parseInt(match[2], 10);
          const toVal = parseInt(match[3], 10);
          resultStores = resultStores.filter(e => {
            const fv = typeof e[prop] === 'number' ? e[prop] : parseInt(e[prop], 10) || 0;
            return fv >= fromVal && fv <= toVal;
          });
        }
      }

      // Handle READ by key (Object Page)
      if (req.data && req.data.DataStoreName) {
        const key = String(req.data.DataStoreName);
        const item = resultStores.find(s => s.DataStoreName === key);
        if (!item) {
          // returns 404 for single-read automatically when undefined/null
          return null;
        }
        return item; // single object for Object Page header binding
      }

      // Collection read
      return resultStores;

    } catch (error) {
      LOG.error('DataStores READ failed:', error);
      req.reject(500, 'Failed to load datastores. Please try again later.');
    }
  });

  // DataStoreEntries READ handler - list of datastore entries on second UI screen
  this.on('READ', 'DataStoreEntries', async (req) => {
    try {
      // Detect single-read by key
      const isReadByKey = Object.prototype.hasOwnProperty.call(req.data || {}, 'ID');
      const targetId = isReadByKey ? String(req.data.ID) : null;

      // Resolve parent DataStoreName from navigation 
      let dsname = null;
      if (req.params && req.params.length > 0 && req.params[0].DataStoreName) {
        dsname = req.params[0].DataStoreName;
      }

      // Fallbacks (collection or direct calls)
      if (!dsname) {
        dsname =
          (req.data && req.data.DataStoreName) ||
          (req._ && req._.req && req._.req.query && (req._.req.query.dsname || req._.req.query.DataStoreName)) ||
          null;
      }

      // For READ-by-key we must know the parent dsname (API cannot fetch by ID alone)
      if (isReadByKey && !dsname) {
        return null;
      }

      // For collection reads, dsname is required (no default)
      if (!dsname) {
        return req.reject(400, 'DataStoreName parameter is required. Navigate from DataStores list or provide dsname parameter.');
      }

      // Token
      const accessToken = await getAccessToken();

      // Build API URL (encode dsname)
      const apiUrl = `${ENV_CONFIG.API_BASE_URL}/dsretry?dsname=${encodeURIComponent(dsname)}`;

      const apiResponse = await executeHttpRequest(
        { url: apiUrl },
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          },
          validateStatus: () => true
        }
      );

      const body = apiResponse.data;
      let entryIds = [];
      if (body) {
        if (Array.isArray(body.Id)) {
          entryIds = body.Id;
        } else if (typeof body.Id === 'string') {
          // Single entry case: wrap the string in an array
          entryIds = [body.Id];
        } else if (Array.isArray(body)) {
          entryIds = body;
        }
      }

      // Mapper to extract fields from entry ID
      const toEntry = (id) => {
        const attrs = getDsEntryAttributes(id);
        return {
          ID: id,
          DataStoreName: dsname,
          ScenarioID: attrs.ScenarioID,
          ProcessingStage: attrs.ProcessingStage,
          Receiver: attrs.Receiver,
          UTCTimestampOfError: attrs.UTCTimestampOfError,
          MPL_ID: attrs.MPL_ID,
          NumberOfDSRestarts: attrs.NumberOfDSRestarts
        };
      };

      if (isReadByKey) {
        const matchedId = entryIds.find(x => String(x) === targetId);
        if (!matchedId) {
          return null;
        }
        
        const matched = toEntry(String(matchedId));
        
        // Load error and headers for the requested entry
        try {
          const errorApiUrl = `${ENV_CONFIG.API_BASE_URL}/dsentry?dsname=${encodeURIComponent(dsname)}&dsentry=${encodeURIComponent(matched.ID)}`;
          const errorResponse = await executeHttpRequest(
            { url: errorApiUrl },
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/xml'
              },
              validateStatus: () => true
            }
          );

          if (errorResponse.status === 200 && errorResponse.data) {
            const xmlText = typeof errorResponse.data === 'string' ? errorResponse.data : JSON.stringify(errorResponse.data);
            
            // Extract and decode Error
            const errorMatch = xmlText.match(/<Error>([^<]+)<\/Error>/);
            if (errorMatch && errorMatch[1]) {
              const base64Error = errorMatch[1].trim();
              try {
                matched.Error = Buffer.from(base64Error, 'base64').toString('utf-8');
              } catch (decodeErr) {
                matched.Error = base64Error;
              }
            }
            
            // Extract Payload (keep as Base64, will be decoded on button click)
            const payloadMatch = xmlText.match(/<Payload>([^<]+)<\/Payload>/);
            if (payloadMatch && payloadMatch[1]) {
              const base64Payload = payloadMatch[1].trim();
              matched.Payload = base64Payload; 
            }

            // Capture pipeline/http headers for display
            const pipelineHeaders = Object.entries(errorResponse.headers || {})
              .filter(([k]) => {
                const lk = String(k || '').toLowerCase();
                return lk.startsWith('x-') || lk.includes('pipeline');
              })
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
              .join('\n');
            matched.ResponseHeaders = pipelineHeaders || null;
            
            // Extract specific headers
            const headers = errorResponse.headers || {};
            const getHeader = (key) => {
              const found = Object.entries(headers).find(([k]) => 
                String(k || '').toLowerCase() === key.toLowerCase()
              );
              return found ? (Array.isArray(found[1]) ? found[1].join(', ') : found[1]) : null;
            };
            
            // Decode customheaderproperties if present
            const customHeaderBase64 = getHeader('customheaderproperties');
            if (customHeaderBase64) {
              try {
                matched.customheaderproperties = Buffer.from(customHeaderBase64, 'base64').toString('utf-8');
              } catch (e) {
                matched.customheaderproperties = customHeaderBase64;
              }
            }
            
            // Extract individual headers
            matched.maxjmsretries = getHeader('maxjmsretries');
            matched.partnerid = getHeader('partnerid');
            matched.pipelinestepid = getHeader('pipelinestepid');
            matched.exceptiontimestamp = getHeader('exceptiontimestamp');
            matched.exceptionsourcemplid = getHeader('exceptionsourcemplid');
            
            // Collect all SAP_* headers
            const sapHeaders = Object.entries(headers)
              .filter(([k]) => String(k || '').toLowerCase().startsWith('sap_'))
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
              .join('\n');
            matched.sap_headers = sapHeaders || null;
          }
        } catch (e) {
          // Error loading additional entry details
        }
        
        return matched;
      }

      // Collection
      const entries = entryIds.map(id => toEntry(String(id)));

      // support OData $search from UI BasicSearch (separate to first search bc. here search for multiple different columns)
      const rawSearch = (req && req.data && req.data.$search) ||
                        (req && req._ && req._.req && req._.req.query && req._.req.query.$search) || "";
      const raw = stripQuotes(rawSearch);
      const q = normalizeSearch(raw);

      let resultEntries = entries;
      if (q) {
        const props = ["ID","MPL_ID","ScenarioID","Receiver","ProcessingStage","UTCTimestampOfError"];
        resultEntries = entries.filter(e =>
          props.some(p => normalizeSearch(e[p]).includes(q))
        );
      }

      // support OData $filter from table filter dialog
      const filterStr = req.query?.$filter || req._?.req?.query?.$filter || "";
      if (filterStr) {
        // Supported operators: contains, eq (equals), ge/le (for between/range on dates)
        // Unsupported operators that should show error: startswith, endswith, ne, lt, gt (when not part of range)
        
        // Check for unsupported operators and return helpful error
        const unsupportedPatterns = [
          { pattern: /startswith\s*\(/i, name: 'starts with' },
          { pattern: /endswith\s*\(/i, name: 'ends with' },
          { pattern: /\s+ne\s+/i, name: 'not equal to' }
        ];
        
        for (const check of unsupportedPatterns) {
          if (check.pattern.test(filterStr)) {
            return req.reject(400, `Filter operator "${check.name}" is not supported. Please use: contains, equal to, or between.`);
          }
        }
        
        // Parse and apply supported filters
        // Pattern: contains(Property,'value') - for string fields
        const containsRegex = /contains\s*\(\s*(\w+)\s*,\s*'([^']*)'\s*\)/gi;
        let match;
        while ((match = containsRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = match[2].toLowerCase();
          resultEntries = resultEntries.filter(e => {
            const fieldVal = String(e[prop] ?? '').toLowerCase();
            return fieldVal.includes(val);
          });
        }
        
        // Pattern: Property eq 'value' (string with quotes)
        const eqStringRegex = /(\w+)\s+eq\s+'([^']*)'/gi;
        while ((match = eqStringRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = match[2].toLowerCase();
          resultEntries = resultEntries.filter(e => {
            const fieldVal = String(e[prop] ?? '').toLowerCase();
            return fieldVal === val;
          });
        }
        
        // Pattern: Property eq 123 (numeric without quotes)
        const eqNumericRegex = /(\w+)\s+eq\s+(\d+)(?!\s*')/gi;
        while ((match = eqNumericRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const val = parseInt(match[2], 10);
          resultEntries = resultEntries.filter(e => {
            const fieldVal = e[prop];
            // Handle both numeric and string comparison
            if (typeof fieldVal === 'number') {
              return fieldVal === val;
            }
            return String(fieldVal ?? '') === String(val);
          });
        }
        
        // Pattern: Property ge 'value' and Property le 'value' (between for strings/dates)
        const betweenStringRegex = /(\w+)\s+ge\s+'([^']*)'\s+and\s+\1\s+le\s+'([^']*)'/gi;
        while ((match = betweenStringRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const fromVal = match[2];
          const toVal = match[3];
          resultEntries = resultEntries.filter(e => {
            const fieldVal = String(e[prop] ?? '');
            return fieldVal >= fromVal && fieldVal <= toVal;
          });
        }
        
        // Pattern: Property ge 123 and Property le 456 (between for numbers)
        const betweenNumericRegex = /(\w+)\s+ge\s+(\d+)\s+and\s+\1\s+le\s+(\d+)/gi;
        while ((match = betweenNumericRegex.exec(filterStr)) !== null) {
          const prop = match[1];
          const fromVal = parseInt(match[2], 10);
          const toVal = parseInt(match[3], 10);
          resultEntries = resultEntries.filter(e => {
            const fieldVal = typeof e[prop] === 'number' ? e[prop] : parseInt(e[prop], 10) || 0;
            return fieldVal >= fromVal && fieldVal <= toVal;
          });
        }
        
        // Pattern: Property lt/gt for standalone less/greater than (show error)
        if (/\s+(lt|gt)\s+/i.test(filterStr) && !/\s+ge\s+.*\s+and\s+.*\s+le\s+/i.test(filterStr)) {
          return req.reject(400, `Filter operators "less than" and "greater than" are not supported. Please use "between" instead.`);
        }
      }

      // support OData $orderby for sorting
      const orderby = req.query?.$orderby || req._?.req?.query?.$orderby || "";
      if (orderby) {
        // Parse orderby: "PropertyName asc" or "PropertyName desc"
        const parts = orderby.trim().split(/\s+/);
        const sortProp = parts[0];
        const sortDir = (parts[1] || 'asc').toLowerCase();
        
        // Only allow sorting on UTCTimestampOfError and NumberOfDSRestarts
        if (sortProp === 'UTCTimestampOfError') {
          resultEntries.sort((a, b) => {
            const aVal = a.UTCTimestampOfError || '';
            const bVal = b.UTCTimestampOfError || '';
            const cmp = aVal.localeCompare(bVal);
            return sortDir === 'desc' ? -cmp : cmp;
          });
        } else if (sortProp === 'NumberOfDSRestarts') {
          resultEntries.sort((a, b) => {
            const aVal = a.NumberOfDSRestarts || 0;
            const bVal = b.NumberOfDSRestarts || 0;
            const cmp = aVal - bVal;
            return sortDir === 'desc' ? -cmp : cmp;
          });
        }
      }

      // extract pagination parameters
      const skip = parseInt(req.query?.$skip || req._?.query?.$skip || 0, 10);
      const top = parseInt(req.query?.$top || req._?.query?.$top || 10000, 10);
      
      const pagedEntries = resultEntries.slice(skip, skip + top);
      
      // Set $count for UI awareness
      pagedEntries.$count = resultEntries.length;
      return pagedEntries;


    } catch (error) {
      LOG.error('DataStoreEntries READ failed:', error);
      req.reject(500, 'Failed to load datastore entries. Please try again later.');
    }
  });


  // DecodePayload action handler
  this.on('DecodePayload', 'DataStoreEntries', async (req) => {
    try {
      // Get the context of the entry
      let entryId = null;
      let dsname = null;
      
      // Extract from params (bound action context)
      if (req.params && req.params.length > 0) {
        if (req.params.length > 1) {
          dsname = req.params[0].DataStoreName || req.params[0];
          entryId = req.params[1].ID || req.params[1];
        } else {
          entryId = req.params[0].ID || req.params[0];
          dsname = req.params[0].DataStoreName;
        }
      }
      
      if (!entryId || !dsname) {
        return req.reject(400, 'Entry ID and DataStoreName are required');
      }
      
      // Payload is not passed with bound actions, so we need to fetch it from API
      // Get Bearer Token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return req.reject(500, 'No access token');
      }
      
      // Fetch the entry from API
      const apiUrl = `${ENV_CONFIG.API_BASE_URL}/dsentry?dsname=${encodeURIComponent(dsname)}&dsentry=${encodeURIComponent(entryId)}`;
      
      const apiResponse = await executeHttpRequest(
        { url: apiUrl },
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/xml'
          },
          validateStatus: () => true
        }
      );
      
      if (apiResponse.status !== 200) {
        LOG.error('DecodePayload fetch returned HTTP', apiResponse.status);
        return req.reject(500, 'Failed to fetch entry for decoding. The external API returned an error.');
      }
      
      const xmlText = typeof apiResponse.data === 'string' ? apiResponse.data : JSON.stringify(apiResponse.data);
      
      // Extract and decode Payload from XML
      let decodedPayload = null;
      const payloadMatch = xmlText.match(/<Payload>([^<]+)<\/Payload>/);
      if (payloadMatch && payloadMatch[1]) {
        const base64Payload = payloadMatch[1].trim();
        try {
          decodedPayload = Buffer.from(base64Payload, 'base64').toString('utf-8');
        } catch (decodeErr) {
          return req.reject(400, `Failed to decode payload: ${decodeErr.message}`);
        }
      } else {
        return req.reject(400, 'Payload not found in API response');
      }
      
      // Return the decoded payload
      return {
        ID: entryId,
        DataStoreName: dsname,
        Payload: decodedPayload
      };
      
    } catch (error) {
      LOG.error('DecodePayload failed:', error);
      return req.reject(500, 'Failed to decode payload. Please try again later.');
    }
  });

  // DeleteEntries unbound action handler
  this.on('DeleteEntries', async (req) => {
    try {
      const { entryIds, dataStoreName } = req.data;
      
      if (!dataStoreName || !Array.isArray(entryIds) || entryIds.length === 0) {
        return req.reject(400, 'DataStoreName and entryIds are required');
      }
      
      // Get Bearer Token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return req.reject(500, 'Authentication failed');
      }
      
      // Fetch CSRF token manually for /dsentry — a GET to this endpoint without
      // the dsentry parameter returns an error status, which causes the SDK's
      // auto-CSRF preflight to throw. The token is still present in the headers
      // of the error response, so we use validateStatus to ignore the status code.
      const deleteUrl = `${ENV_CONFIG.API_BASE_URL}/dsentry?dsname=${encodeURIComponent(dataStoreName)}`;
      const csrfResponse = await executeHttpRequest(
        { url: deleteUrl },
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-CSRF-Token': 'Fetch',
            Accept: '*/*'
          },
          validateStatus: () => true
        },
        { fetchCsrfToken: false }
      );
      const csrfToken = csrfResponse.headers['x-csrf-token'] || csrfResponse.headers['X-CSRF-Token'];
      const setCookie = csrfResponse.headers['set-cookie'];
      const cookieHeader = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : (setCookie ? String(setCookie).split(';')[0] : undefined);

      // Call delete API (DELETE with IDs in body)
      const deleteResponse = await executeHttpRequest(
        { url: deleteUrl },
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            ...(cookieHeader ? { Cookie: cookieHeader } : {})
          },
          data: entryIds,
          validateStatus: () => true
        },
        { fetchCsrfToken: false }
      );
      
      if (deleteResponse.status !== 200 && deleteResponse.status !== 204) {
        LOG.error('Delete API returned HTTP', deleteResponse.status);
        return req.reject(500, 'Delete failed. The external API returned an error.');
      }
      
      return {
        count: entryIds.length,
        dataStoreName: dataStoreName
      };
      
    } catch (error) {
      LOG.error('DeleteEntries failed:', error);
      return req.reject(500, 'Delete failed. Please try again later.');
    }
  });

  // MoveToNoRetry unbound action handler
  this.on('MoveToNoRetry', async (req) => {
    try {
      const { dataStoreName, entryIds } = req.data;

      if (!dataStoreName || !Array.isArray(entryIds) || entryIds.length === 0) {
        return req.reject(400, 'dataStoreName and entryIds are required');
      }

      // Get Bearer Token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return req.reject(500, 'Authentication failed');
      }

      // Call move-to-no-retry API using the current datastore
      const moveUrl = `${ENV_CONFIG.API_BASE_URL}/dsretry?dsname=${encodeURIComponent(dataStoreName)}`;
      const moveResponse = await executeHttpRequest(
        { url: moveUrl },
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          data: entryIds,
          validateStatus: () => true
        }
      );

      if (moveResponse.status !== 200 && moveResponse.status !== 204) {
        LOG.error('MoveToNoRetry API returned HTTP', moveResponse.status);
        return req.reject(500, 'Move to No-Retry failed. The external API returned an error.');
      }
      return {
        count: entryIds.length,
        dataStoreName: dataStoreName
      };

    } catch (error) {
      LOG.error('MoveToNoRetry failed:', error);
      return req.reject(500, 'Move to No-Retry failed. Please try again later.');
    }
  });

  // MoveToDataStore unbound action handler (PUT with target-dsname)
  this.on('MoveToDataStore', async (req) => {
    try {
      const { dataStoreName, targetDataStoreName, entryIds } = req.data;

      if (!dataStoreName || !targetDataStoreName || !Array.isArray(entryIds) || entryIds.length === 0) {
        return req.reject(400, 'dataStoreName, targetDataStoreName and entryIds are required');
      }

      // Bearer token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return req.reject(500, 'Authentication failed');
      }

      // PUT move
      const moveUrl = `${ENV_CONFIG.API_BASE_URL}/dsretry?dsname=${encodeURIComponent(dataStoreName)}&trg-dsname=${encodeURIComponent(targetDataStoreName)}`;
      const moveResponse = await executeHttpRequest(
        { url: moveUrl },
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          data: entryIds,
          validateStatus: () => true
        }
      );

      if (moveResponse.status !== 200 && moveResponse.status !== 204) {
        LOG.error('MoveToDataStore API returned HTTP', moveResponse.status);
        return req.reject(500, 'Move to Data Store failed. The external API returned an error.');
      }
      return true;

    } catch (error) {
      LOG.error('MoveToDataStore failed:', error);
      return req.reject(500, 'Move to Data Store failed. Please try again later.');
    }
  });

  // Restart unbound action handler
  this.on('Restart', async (req) => {
    try {
      const { dataStoreName, entryIds } = req.data;

      if (!dataStoreName || !Array.isArray(entryIds) || entryIds.length === 0) {
        return req.reject(400, 'dataStoreName and non-empty entryIds array are required');
      }

      // Get Bearer Token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return req.reject(500, 'Authentication failed: no access token');
      }

      // POST restart API with IDs in body
      const restartUrl = `${ENV_CONFIG.API_BASE_URL}/dsretry?dsname=${encodeURIComponent(dataStoreName)}`;
      const restartResponse = await executeHttpRequest(
        { url: restartUrl },
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          data: entryIds,
          validateStatus: () => true
        }
      );

      if (restartResponse.status !== 200 && restartResponse.status !== 204) {
        LOG.error('Restart API returned HTTP', restartResponse.status);
        return req.reject(500, 'Restart failed. The external API returned an error.');
      }

      // Try to surface backend message if present
      const apiMessage = (restartResponse.data && (restartResponse.data.message || restartResponse.data.Message || restartResponse.data.result)) || restartResponse.data;

      return {
        success: true,
        message: apiMessage || 'Restart completed'
      };

    } catch (error) {
      LOG.error('Restart failed:', error);
      return req.reject(500, 'Restart failed. Please try again later.');
    }
  });

  

});