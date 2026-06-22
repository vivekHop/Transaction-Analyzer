import React, { useState } from 'react';
import { useStore, type DatasetType } from '../store';
import { Search, Database, Download, Sparkles, Clock, Loader2, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseQueryWithGeminiAll } from '../lib/gemini';
import { QuerySchema, executeQuery } from '../lib/queryEngine';

const SUGGESTED_QUERIES = [
  "Top Facilitators",
  "Revenue By Vendor",
  "Highest Markup Transactions",
  "Unmatched Transactions",
  "FX Margin By Currency",
  "Transactions Above ₹5L"
];

const normalizeRowKeys = (row: any): any => {
  if (!row) return row;
  const hasId = 'txnID' in row || 'txnId' in row || 'Txn Id' in row || 'TXN ID' in row || 'id' in row;
  if (!hasId) {
    const result: any = {};
    for (const [key, val] of Object.entries(row)) {
      if (key.startsWith('merged_')) continue;
      if (key === 'raw' || key === 'everestRaw' || key === 'bookingsRaw') continue;
      result[key] = val;
    }
    return result;
  }
  const rawId = row.txnID || row.txnId || row['Txn Id'] || row['TXN ID'] || row.id || '';
  const result: any = { txnID: rawId };
  for (const [key, val] of Object.entries(row)) {
    if (key.startsWith('merged_')) continue;
    if (key === 'raw' || key === 'everestRaw' || key === 'bookingsRaw') continue;
    const low = key.toLowerCase();
    if (low === 'id' || low === 'txnid' || low === 'txn id' || low === 'txn_id' || low === 'transaction id' || low === 'transaction_id') continue;
    result[key] = val;
  }
  return result;
};

export function QuerySidebar() {
  const { 
    currentDataset, 
    setCurrentDataset, 
    processedData, 
    processedIdfcData,
    processedManualData,
    queryResult, 
    setQueryResult, 
    queryHistory, 
    addQueryToHistory, 
    currentPlan, 
    setCurrentPlan, 
    currentQueryText,
    transactionsRaw,
    bookingsRaw,
    commercialsRaw,
    vendorsRaw,
    idfcRaw,
    manualTransactionsRaw,
    includeEverestMatched,
    includeBookingsMatched,
    unmatchedView,
    allShowEverest,
    exportDataList
  } = useStore();
  const [query, setQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  React.useEffect(() => {
    if (!currentPlan) {
      setQueryResult(null);
      return;
    }

    const normalizeId = (id: string): string => {
      if (!id) return '';
      return String(id).trim().toUpperCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ');
    };
    
    try {
      let dataToQuery: any[] = [];
      if (currentDataset === 'everest') {
        dataToQuery = transactionsRaw;
      } else if (currentDataset === 'bookings') {
        dataToQuery = bookingsRaw;
      } else if (currentDataset === 'commercials') {
        dataToQuery = commercialsRaw;
      } else if (currentDataset === 'vendors') {
        dataToQuery = vendorsRaw;
      } else if (currentDataset === 'idfc') {
        dataToQuery = idfcRaw;
      } else if (currentDataset === 'manual-transactions') {
        dataToQuery = processedManualData || [];
      } else if (currentDataset === 'matched-ad2') {
        const baseList = processedData.filter(row => row.isMatched);
        if (includeEverestMatched && includeBookingsMatched) {
          dataToQuery = baseList.map(row => row.merged_matched_T_T || row);
        } else if (includeEverestMatched && !includeBookingsMatched) {
          dataToQuery = baseList.map(row => row.merged_matched_T_F || row);
        } else if (!includeEverestMatched && includeBookingsMatched) {
          dataToQuery = baseList.map(row => row.merged_matched_F_T || row);
        } else {
          dataToQuery = baseList.map(row => row.merged_matched_F_F || row);
        }
      } else if (currentDataset === 'matched-ad1-idfc') {
        dataToQuery = processedIdfcData;
      } else if (currentDataset === 'unmatched') {
        if (unmatchedView === 'everest') {
          dataToQuery = processedData.filter(row => !row.isMatched);
        } else {
          const everestIds = new Set(processedData.map(r => r.id));
          dataToQuery = bookingsRaw.filter(b => !everestIds.has(normalizeId(b['TXN ID'])));
        }
      } else if (currentDataset === 'all') {
        dataToQuery = processedData.map(row => 
          allShowEverest ? (row.merged_all_T || row) : (row.merged_all_F || row)
        );
      }

      dataToQuery = dataToQuery.map(row => normalizeRowKeys(row));

      const activePlan = currentPlan[currentDataset];
      if (activePlan && dataToQuery.length > 0) {
        const result = executeQuery(dataToQuery, activePlan);
        setQueryResult(result);
      } else {
        setQueryResult(null);
      }
    } catch (err: any) {
      console.error("Failed to re-apply AI plan:", err);
    }
  }, [
    currentDataset, 
    currentPlan, 
    processedData, 
    setQueryResult, 
    transactionsRaw, 
    bookingsRaw, 
    commercialsRaw, 
    vendorsRaw,
    processedManualData,
    includeEverestMatched,
    includeBookingsMatched,
    unmatchedView,
    allShowEverest
  ]);

  const handleExport = () => {
    const rawData = exportDataList;
    if (!rawData || rawData.length === 0) return;
    
    const dataToExport = rawData.map(row => {
      const { _rowIdx, _rows, _ROWS, ...rest } = row;
      return rest;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, "export.xlsx");
  };

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsQuerying(true);
    setError(null);
    try {
      const everestRaw = useStore.getState().transactionsRaw;
      const bookingsRaw = useStore.getState().bookingsRaw;
      const commercialsRaw = useStore.getState().commercialsRaw;
      const vendorsRaw = useStore.getState().vendorsRaw;
      const idfcRaw = useStore.getState().idfcRaw;
      const processedIdfcData = useStore.getState().processedIdfcData;
      const manualTransactionsRaw = useStore.getState().manualTransactionsRaw;
      const processedManualData = useStore.getState().processedManualData;

      const getSampleSchema = (data: any[]) => {
        if (!data || data.length === 0) return [];
        const sample = data[0];
        const seen = new Set<string>();
        const list: { name: string; type: string }[] = [];
        
        Object.keys(sample)
          .filter(k => k !== 'raw' && k !== 'everestRaw' && k !== 'bookingsRaw')
          .forEach(k => {
            const low = k.toLowerCase();
            const isId = low === 'id' || low === 'txnid' || low === 'txn id' || low === 'txn_id';
            const name = isId ? 'txnID' : k;
            if (!seen.has(name)) {
              seen.add(name);
              list.push({ name, type: typeof sample[k] });
            }
          });
        return list;
      };

      const everestSchema = getSampleSchema(everestRaw);
      const bookingsSchema = getSampleSchema(bookingsRaw);
      const commercialsSchema = getSampleSchema(commercialsRaw);
      const vendorsSchema = getSampleSchema(vendorsRaw);
      const idfcSchema = getSampleSchema(idfcRaw);
      const manualTransactionsSchema = getSampleSchema(processedManualData.length > 0 ? processedManualData : manualTransactionsRaw);

      const matchedSchema = [
        ...getSampleSchema(processedData.filter(r => r.isMatched)),
        ...everestSchema.filter(e => !['txnID', 'Exchange Rate', 'Amount paid (INR)', 'Foreign Currency Amount Received'].includes(e.name)),
        ...bookingsSchema.filter(b => !['txnID', 'Exchange Rate', 'Book Rate', 'Facilitator'].includes(b.name))
      ];

      const matchedAD1IDFCSchema = [
        ...idfcSchema,
        { name: 'Banking Partner', type: 'string' },
        { name: 'Type of Transaction', type: 'string' },
        { name: 'Total Markup', type: 'number' },
        { name: 'Total Fx Markup', type: 'number' },
        { name: 'Total Non-Fx Fees', type: 'number' },
        { name: 'Bank Fx Rate', type: 'number' },
        { name: 'Bank Non Fx Charges', type: 'number' },
        { name: 'Bank Fx Margin', type: 'number' },
        { name: 'Revenue', type: 'number' },
        { name: 'COGS', type: 'number' },
        { name: 'Net Profit', type: 'number' }
      ];

      let unmatchedSchema: { name: string; type: string }[] = [];
      if (unmatchedView === 'everest') {
        unmatchedSchema = [
          ...getSampleSchema(processedData.filter(r => !r.isMatched && !r.isMatchedToIdfc)),
          ...everestSchema.filter(e => e.name !== 'txnID')
        ];
      } else if (unmatchedView === 'bookings') {
        unmatchedSchema = bookingsSchema;
      } else { // 'idfc'
        unmatchedSchema = idfcSchema;
      }

      const allSchema = matchedSchema;

      const schemas = {
        'matched-ad2': matchedSchema,
        'matched-ad1-idfc': matchedAD1IDFCSchema,
        unmatched: unmatchedSchema,
        all: allSchema,
        everest: everestSchema,
        bookings: bookingsSchema,
        idfc: idfcSchema,
        commercials: commercialsSchema,
        vendors: vendorsSchema,
        'manual-transactions': manualTransactionsSchema
      };

      const planRawMap = await parseQueryWithGeminiAll(query, schemas);
      const parsedPlans: Record<string, any> = {};
      
      Object.keys(planRawMap).forEach(key => {
        const rawPlan = planRawMap[key];
        if (rawPlan && rawPlan.operations && rawPlan.operations.length > 0) {
          try {
            parsedPlans[key] = QuerySchema.parse(rawPlan);
          } catch (err) {
            console.error(`Failed to parse schema plan for ${key}:`, err);
          }
        }
      });

      const activePlan = parsedPlans[currentDataset];
      if (activePlan) {
        let dataToQuery: any[] = [];
        if (currentDataset === 'everest') {
          dataToQuery = everestRaw;
        } else if (currentDataset === 'bookings') {
          dataToQuery = bookingsRaw;
        } else if (currentDataset === 'commercials') {
          dataToQuery = commercialsRaw;
        } else if (currentDataset === 'vendors') {
          dataToQuery = vendorsRaw;
        } else if (currentDataset === 'idfc') {
          dataToQuery = idfcRaw;
        } else if (currentDataset === 'manual-transactions') {
          dataToQuery = processedManualData || [];
        } else if (currentDataset === 'matched-ad2') {
          dataToQuery = processedData.filter(row => row.isMatched).map(row => row.merged_matched_T_T || row);
        } else if (currentDataset === 'matched-ad1-idfc') {
          dataToQuery = processedIdfcData;
        } else if (currentDataset === 'unmatched') {
          const normalizeId = (id: string): string => {
            if (!id) return '';
            return String(id).trim().toUpperCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ');
          };
          if (unmatchedView === 'everest') {
            dataToQuery = processedData.filter(row => !row.isMatched && !row.isMatchedToIdfc);
          } else if (unmatchedView === 'bookings') {
            const everestIdsSet = new Set(processedData.map(r => r.id));
            dataToQuery = bookingsRaw.filter(b => !everestIdsSet.has(normalizeId(b['TXN ID'])));
          } else { // 'idfc'
            const everestIdsSet = new Set(processedData.map(r => r.id));
            dataToQuery = processedIdfcData.filter(row => !everestIdsSet.has(row.id));
          }
        } else { // 'all'
          dataToQuery = processedData.map(row => row.merged_all_T || row);
        }
        dataToQuery = dataToQuery.map(row => normalizeRowKeys(row));
        const result = executeQuery(dataToQuery, activePlan);
        setQueryResult(result);
      } else {
        setQueryResult(null);
      }

      setCurrentPlan(parsedPlans, query);
      addQueryToHistory(query, parsedPlans);
      setQuery('');
    } catch (err: any) {
      setError(err.message || "Failed to execute query.");
      setQueryResult(null);
    } finally {
      setIsQuerying(false);
    }
  };

  const executeHistoryQuery = (hq: any) => {
    setCurrentPlan(hq.plan, hq.query);
  };

  return (
    <div className="w-80 flex flex-col gap-4 overflow-y-auto">
      {/* Search Input */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
        {currentPlan && currentPlan[currentDataset] && (() => {
          const plan = currentPlan[currentDataset];
          if (!plan || !plan.operations) return null;
          const filterOps = plan.operations.filter((op: any) => op.type === 'filter');
          if (filterOps.length === 0) return null;
          const fields = Array.from(new Set(filterOps.map((op: any) => op.field))).join(', ');
          
          return (
            <div className="flex flex-wrap gap-1 mb-1">
              <div className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-500 font-semibold shadow-sm transition-all">
                <span className="capitalize">{currentDataset}</span> Filtered: {fields}
              </div>
            </div>
          );
        })()}
        <form onSubmit={handleQuerySubmit} className="relative">
          <Sparkles className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${currentPlan ? 'text-primary-accent' : 'text-primary-accent'}`} />
          <input
            type="text"
            value={currentPlan ? currentQueryText || '' : query}
            onChange={(e) => !currentPlan && setQuery(e.target.value)}
            disabled={isQuerying || !!currentPlan}
            placeholder="Ask anything about your data..."
            className={`w-full bg-background border rounded-lg pl-10 py-3 text-sm focus:outline-none transition-all placeholder:text-muted-text ${
              currentPlan 
                ? 'border-primary-accent/50 text-primary-accent pr-10' 
                : 'border-border text-primary-text pr-10 focus:border-primary-accent focus:ring-1 focus:ring-primary-accent disabled:opacity-50'
            }`}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {!currentPlan && isQuerying && <Loader2 className="text-primary-accent w-4 h-4 animate-spin" />}
            {!currentPlan && !isQuerying && (
              <button
                type="submit"
                className="text-muted-text hover:text-primary-accent transition-colors"
                title="Search query"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
            {currentPlan && (
              <button
                type="button"
                onClick={() => setCurrentPlan(null)}
                className="text-error hover:text-error/80 transition-colors"
                title="Clear active filter"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </form>
        {error && <p className="text-xs text-error">{error}</p>}

        {queryHistory.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <h3 className="text-xs font-semibold text-primary-text mb-2 flex items-center gap-1.5">
              <Clock size={12} /> History
            </h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {(showAllHistory ? queryHistory : queryHistory.slice(0, 3)).map((hq, idx) => (
                <button
                  key={idx}
                  onClick={() => executeHistoryQuery(hq)}
                  className="w-full text-left px-2 py-1.5 bg-background border border-border rounded-md text-[11px] text-secondary-text hover:text-primary-text hover:border-primary-accent/50 transition-colors truncate"
                  title={hq.query}
                >
                  {hq.query}
                </button>
              ))}
              {queryHistory.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllHistory(!showAllHistory)}
                  className="w-full text-center text-[11px] font-semibold text-primary-accent hover:text-primary-accent/80 mt-1"
                >
                  {showAllHistory ? 'Show Less' : 'Show All'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dataset Selector */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-primary-text mb-3 flex items-center gap-2">
          <Database size={16} /> Dataset Scope
        </h3>
        <div className="space-y-2">
          {(() => {
            const getDatasetLabel = (type: DatasetType) => {
              switch (type) {
                case 'matched-ad2':
                  return 'Matched-AD2/Booking Rate';
                case 'matched-ad1-idfc':
                  return 'Matched-AD1/IDFC';
                case 'unmatched':
                  return 'Unmatched';
                case 'all':
                  return 'All';
                case 'everest':
                  return 'Everest';
                case 'bookings':
                  return 'Bookings';
                case 'idfc':
                  return 'IDFC';
                case 'commercials':
                  return 'Commercials';
                case 'vendors':
                  return 'Vendors';
                case 'manual-transactions':
                  return 'Manual Transactions';
                default:
                  return type;
              }
            };
            return (['matched-ad2', 'matched-ad1-idfc', 'manual-transactions', 'unmatched', 'all', 'everest', 'bookings', 'idfc', 'commercials', 'vendors'] as DatasetType[]).map((type) => (
              <button
                key={type}
                onClick={() => setCurrentDataset(type)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  currentDataset === type 
                    ? 'bg-primary-accent/10 text-primary-accent font-medium border border-primary-accent/20' 
                    : 'text-secondary-text hover:bg-surface-elevated border border-transparent'
                }`}
              >
                <span>{getDatasetLabel(type)}</span>
                {currentDataset === type && <div className="w-2 h-2 rounded-full bg-primary-accent" />}
              </button>
            ));
          })()}
        </div>
      </div>

      {/* Suggested Queries */}
      <div className="bg-surface border border-border rounded-xl p-4 flex-1">
        <h3 className="text-sm font-semibold text-primary-text mb-3 flex items-center gap-2">
          <Search size={16} /> Suggested
        </h3>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUERIES.map(q => (
            <button
              key={q}
              onClick={() => setQuery(q)}
              className="px-3 py-1.5 bg-background border border-border rounded-full text-xs text-secondary-text hover:text-primary-text hover:border-primary-accent/50 transition-colors text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      
      {/* Actions */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-secondary-background border border-border rounded-lg text-sm font-medium text-primary-text hover:bg-surface-elevated transition-colors"
        >
          <Download size={16} />
          Export Current View
        </button>
      </div>
    </div>
  );
}
