import React, { useState } from 'react';
import { useStore } from '../store';
import { Database, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { SignJWT, importPKCS8 } from 'jose';



export function UploadSection() {
  const {
    setTransactionsRaw,
    setBookingsRaw,
    setCommercialsRaw,
    setVendorsRaw,
    setIdfcRaw,
    setManualTransactionsRaw,
    processData,
    transactionsRaw,
    bookingsRaw,
    commercialsRaw,
    vendorsRaw,
    idfcRaw,
    manualTransactionsRaw
  } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getGoogleAccessToken = async () => {
    const privateKeyStr = import.meta.env.VITE_GOOGLE_PRIVATE_KEY;
    const clientEmail = import.meta.env.VITE_GOOGLE_CLIENT_EMAIL;
    if (!privateKeyStr || !clientEmail) {
      throw new Error("Google API credentials are not configured in environment variables (.env)");
    }

    // Clean and normalize the environment variable
    let cleaned = privateKeyStr
      .replace(/^["']|["']$/g, '')
      .replace(/\\+n/g, '\n')
      .replace(/\\+r/g, '\r')
      .trim();

    // Extract the raw base64 body from between PEM headers/footers
    const header = "-----BEGIN PRIVATE KEY-----";
    const footer = "-----END PRIVATE KEY-----";

    let body = cleaned;
    if (body.includes(header)) {
      body = body.substring(body.indexOf(header) + header.length);
    }
    if (body.includes(footer)) {
      body = body.substring(0, body.indexOf(footer));
    }

    // Strip all non-base64 characters (whitespace, quotes, slashes, backslashes, etc.)
    const base64Body = body.replace(/[^A-Za-z0-9+/=]/g, '');

    // Reconstruct clean single-line PEM
    const cleanKey = `${header}\n${base64Body}\n${footer}`;
    const cleanEmail = clientEmail.replace(/^["']|["']$/g, '').trim();

    const privateKey = await importPKCS8(cleanKey, 'RS256');

    const jwt = await new SignJWT({
      iss: cleanEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error('Failed to get Google access token: ' + errorText);
    }

    const data = await res.json();
    return data.access_token;
  };

  const fetchGoogleSheetData = async (url: string, accessToken: string) => {
    const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/gid=([0-9]+)/);

    if (!sheetIdMatch) throw new Error("Invalid Google Sheets URL: missing spreadsheet ID");
    const sheetId = sheetIdMatch[1];
    const gid = gidMatch ? parseInt(gidMatch[1], 10) : 0;

    // 1. Fetch metadata to get the sheet name from gid
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!metaRes.ok) {
      const errText = await metaRes.text();
      let err;
      try { err = JSON.parse(errText); } catch { err = { error: { message: errText } }; }
      throw new Error(err.error?.message || "Failed to fetch spreadsheet metadata");
    }

    const metaText = await metaRes.text();
    let meta;
    try {
      meta = JSON.parse(metaText);
    } catch (e) {
      throw new Error("Failed to parse metadata JSON: " + metaText.slice(0, 100));
    }
    const sheet = meta.sheets.find((s: any) => s.properties.sheetId === gid);
    if (!sheet) throw new Error(`Sheet with gid ${gid} not found`);
    const sheetName = sheet.properties.title;

    // 2. Fetch the detailed grid data for the sheet, heavily restricting fields to avoid massive payloads
    const fields = 'sheets(data(rowData(values(effectiveValue,formattedValue,effectiveFormat/numberFormat,dataValidation))))';
    const detailedRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?ranges=${encodeURIComponent(sheetName)}&fields=${encodeURIComponent(fields)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!detailedRes.ok) {
      const errText = await detailedRes.text();
      let err;
      try { err = JSON.parse(errText); } catch { err = { error: { message: errText } }; }
      throw new Error(err.error?.message || "Failed to fetch spreadsheet detailed data");
    }

    const detailedText = await detailedRes.text();
    let detailedData;
    try {
      detailedData = JSON.parse(detailedText);
    } catch (e) {
      throw new Error("Failed to parse detailed data JSON. Payload might be too large. Snippet: " + detailedText.slice(-100));
    }

    const sheetData = detailedData.sheets?.[0]?.data?.[0]?.rowData;
    if (!sheetData || sheetData.length === 0) {
      return { data: [], metadata: { columns: [] } };
    }

    // Process headers and formats
    const headers = (sheetData[0].values || []).map((v: any) => v.formattedValue || '');
    const metadata: any = { columns: [] };

    // Infer column types and validation options from first data row
    const firstDataRow = sheetData[1]?.values || [];
    headers.forEach((header: string, i: number) => {
      if (!header) return;
      let type = 'string';
      let options: string[] = [];

      const cell = firstDataRow[i];
      if (cell) {
        if (cell.dataValidation?.condition?.values) {
          options = cell.dataValidation.condition.values.map((v: any) => v.userEnteredValue).filter(Boolean);
        }

        if (cell.effectiveValue) {
          const numFormat = cell.effectiveFormat?.numberFormat?.type;
          if (numFormat === 'DATE' || numFormat === 'DATE_TIME' || numFormat === 'TIME') {
            type = 'date';
          } else {
            if (cell.effectiveValue.numberValue !== undefined) {
              type = 'number';
            } else if (cell.effectiveValue.boolValue !== undefined) {
              type = 'boolean';
            } else if (cell.effectiveValue.stringValue !== undefined) {
              type = 'string';
            }
          }
        }
      }

      metadata.columns.push({ name: header, type, options });
    });

    const rowsData = sheetData.slice(1).map((row: any) => {
      const obj: Record<string, any> = {};
      const cells = row.values || [];
      headers.forEach((header: string, i: number) => {
        if (!header) return;
        const cell = cells[i];
        let val = null;
        if (cell) {
          const formatType = cell.effectiveFormat?.numberFormat?.type;
          const isDate = formatType === 'DATE' || formatType === 'DATE_TIME' || formatType === 'TIME';

          if (isDate && cell.formattedValue) {
            val = cell.formattedValue;
          } else if (cell.effectiveValue?.numberValue !== undefined) {
            val = cell.effectiveValue.numberValue;
          } else if (cell.effectiveValue?.boolValue !== undefined) {
            val = cell.effectiveValue.boolValue;
          } else if (cell.effectiveValue?.stringValue !== undefined) {
            val = cell.effectiveValue.stringValue;
          } else if (cell.formattedValue !== undefined) {
            val = cell.formattedValue;
          }
        }
        obj[header] = val;
      });
      return obj;
    });

    return { data: rowsData, metadata };
  };

  const handleFetchData = async () => {
    setError(null);
    setLoading(true);
    try {
      const everestUrl = (import.meta.env.VITE_EVEREST_LINK || '').replace(/^["']|["']$/g, '').trim();
      const bookingUrl = (import.meta.env.VITE_BOOKING_LINK || '').replace(/^["']|["']$/g, '').trim();
      const commercialUrl = (import.meta.env.VITE_COMMERCIAL_LINK || '').replace(/^["']|["']$/g, '').trim();
      const vendorUrl = (import.meta.env.VITE_VENDOR_MAPPING_LINK || '').replace(/^["']|["']$/g, '').trim();
      const idfcUrl = (import.meta.env.VITE_IDFC_LINK || '').replace(/^["']|["']$/g, '').trim();
      const manualUrl = (import.meta.env.VITE_MANUAL_TRANSACTIONS_LINK || '').replace(/^["']|["']$/g, '').trim();

      if (!everestUrl || !bookingUrl || !commercialUrl || !vendorUrl || !idfcUrl || !manualUrl) {
        throw new Error("One or more Google Sheets links are not defined in environment variables");
      }

      // Generate OAuth Token from service account
      const accessToken = await getGoogleAccessToken();


      const { setDatasetsMetadata } = useStore.getState();

      // Fetch all simultaneously
      const [everestRes, bookingRes, commercialRes, vendorRes, idfcRes, manualRes] = await Promise.all([
        fetchGoogleSheetData(everestUrl, accessToken),
        fetchGoogleSheetData(bookingUrl, accessToken),
        fetchGoogleSheetData(commercialUrl, accessToken),
        fetchGoogleSheetData(vendorUrl, accessToken),
        fetchGoogleSheetData(idfcUrl, accessToken),
        fetchGoogleSheetData(manualUrl, accessToken)
      ]);

      setTransactionsRaw(everestRes.data);
      setDatasetsMetadata('everest', everestRes.metadata);

      setBookingsRaw(bookingRes.data);
      setDatasetsMetadata('bookings', bookingRes.metadata);

      setCommercialsRaw(commercialRes.data);
      setDatasetsMetadata('commercials', commercialRes.metadata);

      setVendorsRaw(vendorRes.data);
      setDatasetsMetadata('vendors', vendorRes.metadata);

      setIdfcRaw(idfcRes.data);
      setDatasetsMetadata('idfc', idfcRes.metadata);

      setManualTransactionsRaw(manualRes.data);
      setDatasetsMetadata('manual-transactions', manualRes.metadata);

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to fetch data from Google Sheets");
    } finally {
      setLoading(false);
    }
  };

  const hasTx = transactionsRaw.length > 0;
  const hasBk = bookingsRaw.length > 0;
  const hasCm = commercialsRaw.length > 0;
  const hasVn = vendorsRaw.length > 0;
  const hasIdfc = idfcRaw.length > 0;
  const hasManual = manualTransactionsRaw.length > 0;
  const canProcess = hasTx && hasBk && hasCm && hasVn && hasIdfc && hasManual;

  return (
    <div className="flex-1 flex flex-col items-center justify-center max-w-3xl mx-auto w-full gap-8">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-primary-text">Fetch Datasets</h2>
        <p className="text-secondary-text max-w-lg mx-auto">
          The system will automatically fetch transaction and booking data directly from the configured Google Sheets.
        </p>
      </div>

      <div className="w-full flex flex-col items-center justify-center space-y-4">
        <button
          onClick={handleFetchData}
          disabled={loading}
          className={`w-full max-w-md py-4 rounded-xl flex items-center justify-center gap-3 text-lg font-medium transition-all ${loading
              ? 'bg-surface-elevated text-muted-text cursor-not-allowed'
              : 'bg-primary-accent hover:bg-primary-accent/90 text-white shadow-lg shadow-primary-accent/25'
            }`}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={24} />
              Fetching Data...
            </>
          ) : (
            <>
              <Database size={24} />
              Fetch from Google Sheets
            </>
          )}
        </button>

        {error && (
          <div className="w-full max-w-md p-4 bg-error/10 border border-error/20 rounded-lg text-error text-sm text-center">
            {error}
          </div>
        )}
      </div>

      {(hasTx || hasBk) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-surface border border-border rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold text-primary-text mb-4">Data Status</h3>
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Database className={hasTx ? "text-success" : "text-muted-text"} />
                <div>
                  <p className="font-medium text-primary-text">Transactions Dataset (Everest)</p>
                  <p className="text-xs text-muted-text">{hasTx ? `${transactionsRaw.length} rows loaded` : 'Waiting to fetch...'}</p>
                </div>
              </div>
              {hasTx ? <CheckCircle2 className="text-success" size={20} /> : <AlertTriangle className="text-warning" size={20} />}
            </div>

            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Database className={hasBk ? "text-secondary-accent" : "text-muted-text"} />
                <div>
                  <p className="font-medium text-primary-text">Bookings Dataset</p>
                  <p className="text-xs text-muted-text">{hasBk ? `${bookingsRaw.length} rows loaded` : 'Waiting to fetch...'}</p>
                </div>
              </div>
              {hasBk ? <CheckCircle2 className="text-success" size={20} /> : <AlertTriangle className="text-warning" size={20} />}
            </div>

            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Database className={hasCm ? "text-primary-accent" : "text-muted-text"} />
                <div>
                  <p className="font-medium text-primary-text">Commercials Dataset</p>
                  <p className="text-xs text-muted-text">{hasCm ? `${commercialsRaw.length} rows loaded` : 'Waiting to fetch...'}</p>
                </div>
              </div>
              {hasCm ? <CheckCircle2 className="text-success" size={20} /> : <AlertTriangle className="text-warning" size={20} />}
            </div>

            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Database className={hasVn ? "text-warning" : "text-muted-text"} />
                <div>
                  <p className="font-medium text-primary-text">Vendor Mapping Dataset</p>
                  <p className="text-xs text-muted-text">{hasVn ? `${vendorsRaw.length} rows loaded` : 'Waiting to fetch...'}</p>
                </div>
              </div>
              {hasVn ? <CheckCircle2 className="text-success" size={20} /> : <AlertTriangle className="text-warning" size={20} />}
            </div>

            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Database className={hasIdfc ? "text-highlight" : "text-muted-text"} style={{ color: hasIdfc ? '#a855f7' : undefined }} />
                <div>
                  <p className="font-medium text-primary-text">IDFC Dataset</p>
                  <p className="text-xs text-muted-text">{hasIdfc ? `${idfcRaw.length} rows loaded` : 'Waiting to fetch...'}</p>
                </div>
              </div>
              {hasIdfc ? <CheckCircle2 className="text-success" size={20} /> : <AlertTriangle className="text-warning" size={20} />}
            </div>

            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <Database className={hasManual ? "text-primary-accent" : "text-muted-text"} style={{ color: hasManual ? '#e11d48' : undefined }} />
                <div>
                  <p className="font-medium text-primary-text">Manual Transactions Dataset</p>
                  <p className="text-xs text-muted-text">{hasManual ? `${manualTransactionsRaw.length} rows loaded` : 'Waiting to fetch...'}</p>
                </div>
              </div>
              {hasManual ? <CheckCircle2 className="text-success" size={20} /> : <AlertTriangle className="text-warning" size={20} />}
            </div>
          </div>

          <button
            onClick={processData}
            disabled={!canProcess}
            className={`w-full py-3 rounded-lg font-medium transition-all ${canProcess
                ? 'bg-primary-accent hover:bg-primary-accent/90 text-white shadow-lg shadow-primary-accent/25'
                : 'bg-surface-elevated text-muted-text cursor-not-allowed'
              }`}
          >
            Process & Match Data
          </button>
        </motion.div>
      )}
    </div>
  );
}

