import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { Table, Filter, ArrowUp, ArrowDown, ArrowUpDown, XCircle, Plus, X, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
// Dynamic charts can be built here using Recharts based on data shape

export function ResultsArea() {
  const { 
    processedData, 
    processedIdfcData,
    processedManualData,
    queryResult, 
    currentDataset,
    filters,
    setFilters,
    sortConfig,
    setSortConfig,
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTabId,
    includeEverestMatched,
    setIncludeEverestMatched,
    includeBookingsMatched,
    setIncludeBookingsMatched,
    unmatchedView,
    setUnmatchedView,
    allShowEverest,
    setAllShowEverest,
    transactionsRaw,
    bookingsRaw,
    commercialsRaw,
    vendorsRaw,
    idfcRaw,
    setExportDataList
  } = useStore();

  const [selectedRowKey, setSelectedRowKey] = useState<string | number | null>(null);
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1500);
  };

  React.useEffect(() => {
    setSelectedRowKey(null);
    setSelectedRow(null);
    setCopiedText(null);
  }, [currentDataset, activeTabId, includeEverestMatched, includeBookingsMatched, unmatchedView, allShowEverest]);

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

  const normalizeId = (id: string): string => {
    if (!id) return '';
    return String(id).trim().toUpperCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ');
  };

  const everestIdsSet = useMemo(() => {
    const ids = new Set<string>();
    for (const r of processedData) {
      if (r.id) ids.add(r.id);
    }
    return ids;
  }, [processedData]);

  const displayData = useMemo(() => {
    let list: any[] = [];
    if (currentDataset === 'everest') list = queryResult || transactionsRaw;
    else if (currentDataset === 'bookings') list = queryResult || bookingsRaw;
    else if (currentDataset === 'commercials') list = queryResult || commercialsRaw;
    else if (currentDataset === 'vendors') list = queryResult || vendorsRaw;
    else if (currentDataset === 'idfc') list = queryResult || idfcRaw;
    else if (currentDataset === 'manual-transactions') list = queryResult || processedManualData || [];
    else if (currentDataset === 'matched-ad2') {
      if (queryResult) {
        list = queryResult;
      } else {
        const baseList = processedData.filter(row => row.isMatched);
        if (includeEverestMatched && includeBookingsMatched) {
          list = baseList.map(row => row.merged_matched_T_T || row);
        } else if (includeEverestMatched && !includeBookingsMatched) {
          list = baseList.map(row => row.merged_matched_T_F || row);
        } else if (!includeEverestMatched && includeBookingsMatched) {
          list = baseList.map(row => row.merged_matched_F_T || row);
        } else {
          list = baseList.map(row => row.merged_matched_F_F || row);
        }
      }
    }
    else if (currentDataset === 'matched-ad1-idfc') {
      list = queryResult || processedIdfcData;
    }
    else if (currentDataset === 'unmatched') {
      if (queryResult) {
        list = queryResult;
      } else {
        if (unmatchedView === 'everest') {
          list = processedData.filter(row => !row.isMatched && !row.isMatchedToIdfc);
        } else if (unmatchedView === 'bookings') {
          list = bookingsRaw.filter(b => !everestIdsSet.has(normalizeId(b['TXN ID'])));
        } else { // 'idfc'
          list = processedIdfcData.filter(row => !everestIdsSet.has(row.id));
        }
      }
    }
    else if (currentDataset === 'all') {
      if (queryResult) {
        list = queryResult;
      } else {
        if (allShowEverest) {
          list = processedData.map(row => row.merged_all_T || row);
        } else {
          list = processedData.map(row => row.merged_all_F || row);
        }
      }
    }

    return list.map((row, idx) => {
      const normalized = normalizeRowKeys(row);
      normalized._rowIdx = idx;
      return normalized;
    });
  }, [processedData, processedIdfcData, processedManualData, idfcRaw, queryResult, currentDataset, includeEverestMatched, includeBookingsMatched, unmatchedView, allShowEverest, transactionsRaw, bookingsRaw, commercialsRaw, vendorsRaw, everestIdsSet]);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number | 'all'>(100);
  
  const columns = useMemo(() => {
    if (displayData.length === 0) return [];
    return Object.keys(displayData[0]).filter(k => k !== 'raw' && k !== 'everestRaw' && k !== 'bookingsRaw' && k !== '_rowIdx' && k.toLowerCase() !== '_rows');
  }, [displayData]);

  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);

  React.useEffect(() => {
    setActiveFilterCol(null);
    setPage(0);
  }, [currentDataset, queryResult, activeTabId]);

  const filteredAndSortedData = useMemo(() => {
    let result = [...displayData];

    Object.keys(filters).forEach(key => {
      const filter = filters[key];
      if (!filter) return;

      result = result.filter(row => {
        const val = row[key];
        if (filter.type === 'exact') {
          const displayVal = (val === null || val === undefined || val === '' || String(val).trim().toUpperCase() === 'N/A') ? 'N/A' : String(val);
          return displayVal === filter.value;
        }
        if (filter.type === 'numberRange') {
          const num = (val === null || val === undefined || val === '' || String(val).trim().toUpperCase() === 'N/A') ? 0 : (typeof val === 'number' ? val : Number(String(val).replace(/,/g, '').trim()));
          if (isNaN(num)) return false;
          if (filter.min !== undefined && filter.min !== '' && num < Number(filter.min)) return false;
          if (filter.max !== undefined && filter.max !== '' && num > Number(filter.max)) return false;
          return true;
        }
        if (filter.type === 'search') {
          const displayVal = (val === null || val === undefined || val === '' || String(val).trim().toUpperCase() === 'N/A') ? 'N/A' : String(val);
          return displayVal.toLowerCase().includes(filter.value.toLowerCase());
        }
        if (filter.type === 'dateRange') {
          if (val === null || val === undefined || val === '' || String(val).trim().toUpperCase() === 'N/A') return false;
          const d = new Date(val).getTime();
          if (isNaN(d)) return false;
          if (filter.start && d < new Date(filter.start).getTime()) return false;
          // For end date, we add a day minus 1 ms so it includes the whole day
          if (filter.end && d > new Date(filter.end).getTime() + 86399999) return false;
          return true;
        }
        return true;
      });
    });

    if (sortConfig) {
      const sampleVal = result.length > 0 ? result[0][sortConfig.key] : null;
      const isDateCol = typeof sampleVal === 'string' && (
        sortConfig.key.toLowerCase().includes('date') || 
        sortConfig.key.toLowerCase().includes('time') || 
        (sampleVal.length > 5 && !isNaN(Date.parse(sampleVal)) && isNaN(Number(sampleVal)))
      );

      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (isDateCol) {
          if (typeof valA === 'string') {
            const p = Date.parse(valA);
            if (!isNaN(p)) valA = p;
          }
          if (typeof valB === 'string') {
            const p = Date.parse(valB);
            if (!isNaN(p)) valB = p;
          }
        }

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        
        const asc = sortConfig.direction === 'asc' ? 1 : -1;
        return valA > valB ? asc : -asc;
      });
    }

    return result;
  }, [displayData, filters, sortConfig]);

  React.useEffect(() => {
    setExportDataList(filteredAndSortedData);
  }, [filteredAndSortedData, setExportDataList]);

  const resolvedPageSize = useMemo(() => {
    if (pageSize === 'all') return filteredAndSortedData.length || 1;
    return pageSize;
  }, [pageSize, filteredAndSortedData.length]);

  const paginatedData = useMemo(() => {
    return filteredAndSortedData.slice(page * resolvedPageSize, (page + 1) * resolvedPageSize);
  }, [filteredAndSortedData, page, resolvedPageSize]);

  const totalPages = Math.ceil(filteredAndSortedData.length / resolvedPageSize);

  const parentRef = React.useRef<HTMLDivElement>(null);
  
  const rowVirtualizer = useVirtualizer({
    count: paginatedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 37,
    overscan: 15,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  React.useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = 0;
    }
  }, [page, currentDataset, queryResult]);

  const getColFilterInfo = (col: string) => {
    if (col.toLowerCase().includes('date')) return { type: 'date' };
    
    const rawVals = Array.from(new Set(displayData.map(r => r[col])));
    const nonNullVals = rawVals.filter(v => v !== null && v !== undefined && v !== '' && String(v).trim().toUpperCase() !== 'N/A');
    
    if (rawVals.length === 1 && (rawVals[0] === null || rawVals[0] === undefined || rawVals[0] === '')) {
      return { type: 'none' };
    }
    
    const isNumeric = nonNullVals.length > 0 && nonNullVals.every(v => {
      if (typeof v === 'number') return true;
      const stripped = String(v).replace(/,/g, '').trim();
      return stripped !== '' && !isNaN(Number(stripped));
    });
    
    if (isNumeric) return { type: 'number' };
    
    const catOptions = Array.from(new Set(displayData.map(r => {
      const v = r[col];
      return (v === null || v === undefined || v === '' || String(v).trim().toUpperCase() === 'N/A') ? 'N/A' : String(v);
    }))).sort();
    
    if (catOptions.length <= 20) {
      return { type: 'categorical', options: catOptions };
    }
    return { type: 'string' };
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Chrome-like Tabs header */}
      <div className="flex items-end bg-surface-elevated px-4 pt-2 border-b border-border shrink-0 select-none overflow-x-auto gap-1">
        {tabs.map((t) => {
          const isActive = t.id === activeTabId;
          return (
            <div
              key={t.id}
              onClick={() => setActiveTabId(t.id)}
              className={`group flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all cursor-pointer border-t border-x ${
                isActive
                  ? 'bg-background border-border text-primary-text'
                  : 'bg-transparent border-transparent text-muted-text hover:bg-surface hover:text-secondary-text'
              }`}
            >
              <span>{t.name}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className="text-muted-text hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={addTab}
          className="flex items-center justify-center p-1 hover:bg-surface rounded-full text-secondary-text mb-1.5 ml-2 transition-colors"
          title="Add Tab"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Table size={16} className="text-secondary-text" />
            <span className="text-sm font-medium text-primary-text">Data Explorer</span>
          </div>
          {currentDataset === 'matched-ad2' && (
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-border text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-secondary-text hover:text-primary-text select-none">
                <input 
                  type="checkbox" 
                  checked={includeEverestMatched} 
                  onChange={(e) => setIncludeEverestMatched(e.target.checked)}
                  className="rounded border-border text-primary-accent focus:ring-primary-accent bg-background" 
                />
                Include Everest
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-secondary-text hover:text-primary-text select-none">
                <input 
                  type="checkbox" 
                  checked={includeBookingsMatched} 
                  onChange={(e) => setIncludeBookingsMatched(e.target.checked)}
                  className="rounded border-border text-primary-accent focus:ring-primary-accent bg-background" 
                />
                Include Booking Rate
              </label>
            </div>
          )}
          {currentDataset === 'unmatched' && (
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-border text-xs font-semibold">
              <label className="flex items-center gap-1.5 cursor-pointer text-secondary-text hover:text-primary-text select-none font-medium">
                <input 
                  type="radio" 
                  name="unmatchedView"
                  checked={unmatchedView === 'everest'} 
                  onChange={() => setUnmatchedView('everest')}
                  className="border-border text-primary-accent focus:ring-primary-accent bg-background" 
                />
                Unmatched Everest
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-secondary-text hover:text-primary-text select-none font-medium">
                <input 
                  type="radio" 
                  name="unmatchedView"
                  checked={unmatchedView === 'bookings'} 
                  onChange={() => setUnmatchedView('bookings')}
                  className="border-border text-primary-accent focus:ring-primary-accent bg-background" 
                />
                Unmatched Booking Rate
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-secondary-text hover:text-primary-text select-none font-medium">
                <input 
                  type="radio" 
                  name="unmatchedView"
                  checked={unmatchedView === 'idfc'} 
                  onChange={() => setUnmatchedView('idfc')}
                  className="border-border text-primary-accent focus:ring-primary-accent bg-background" 
                />
                Unmatched IDFC
              </label>
            </div>
          )}
          {currentDataset === 'all' && (
            <div className="flex items-center gap-4 ml-4 pl-4 border-l border-border text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-secondary-text hover:text-primary-text select-none">
                <input 
                  type="checkbox" 
                  checked={allShowEverest} 
                  onChange={(e) => setAllShowEverest(e.target.checked)}
                  className="rounded border-border text-primary-accent focus:ring-primary-accent bg-background" 
                />
                Show Everest Data
              </label>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-text">
          {Object.keys(filters).length > 0 && (
             <button onClick={() => setFilters({})} className="flex items-center gap-1 text-error hover:text-error/80 mr-2 font-medium">
               <XCircle size={14} /> Clear Filters
             </button>
          )}
          Showing {filteredAndSortedData.length.toLocaleString()} rows
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-background">
        <div className="absolute inset-0 flex flex-col overflow-hidden">
          <div ref={parentRef} className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm text-secondary-text">
              <thead className="text-xs uppercase bg-surface-elevated text-primary-text sticky top-0 z-10 shadow-sm">
                <tr>
                  {columns.map(col => (
                    <th key={col} className="px-4 py-3 font-semibold whitespace-nowrap relative">
                      <div className="flex items-center gap-2">
                        <span>{col}</span>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => setSortConfig({ key: col, direction: sortConfig?.key === col && sortConfig.direction === 'asc' ? 'desc' : 'asc' })} 
                            className="text-muted-text hover:text-primary-accent"
                          >
                            {sortConfig?.key === col ? (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={14} />}
                          </button>
                          <button 
                            onClick={() => setActiveFilterCol(activeFilterCol === col ? null : col)} 
                            className={`hover:text-primary-accent ${filters[col] ? 'text-primary-accent' : 'text-muted-text'}`}
                          >
                            <Filter size={14} />
                          </button>
                        </div>
                      </div>
                      
                      {activeFilterCol === col && (() => {
                        const info = getColFilterInfo(col);
                        return (
                          <div className="absolute top-full left-0 mt-1 bg-surface-elevated border border-border rounded-lg shadow-xl p-3 z-50 min-w-[200px] font-normal normal-case text-primary-text">
                             {info.type === 'date' && (
                                <div className="flex flex-col gap-2">
                                   <label className="text-xs text-secondary-text">Start Date</label>
                                   <input type="date" className="bg-background border border-border rounded px-2 py-1 text-sm focus:border-primary-accent outline-none" 
                                      onChange={e => setFilters({ ...filters, [col]: { ...filters[col], type: 'dateRange', start: e.target.value } })}
                                      value={filters[col]?.start || ''}
                                   />
                                   <label className="text-xs text-secondary-text mt-1">End Date</label>
                                   <input type="date" className="bg-background border border-border rounded px-2 py-1 text-sm focus:border-primary-accent outline-none" 
                                      onChange={e => setFilters({ ...filters, [col]: { ...filters[col], type: 'dateRange', end: e.target.value } })}
                                      value={filters[col]?.end || ''}
                                   />
                                </div>
                             )}
                             {info.type === 'number' && (
                                <div className="flex flex-col gap-2">
                                   <label className="text-xs text-secondary-text">Min Value</label>
                                   <input type="number" step="any" className="bg-background border border-border rounded px-2 py-1 text-sm focus:border-primary-accent outline-none" 
                                      onChange={e => setFilters({ ...filters, [col]: { ...filters[col], type: 'numberRange', min: e.target.value } })}
                                      value={filters[col]?.min || ''}
                                   />
                                   <label className="text-xs text-secondary-text mt-1">Max Value</label>
                                   <input type="number" step="any" className="bg-background border border-border rounded px-2 py-1 text-sm focus:border-primary-accent outline-none" 
                                      onChange={e => setFilters({ ...filters, [col]: { ...filters[col], type: 'numberRange', max: e.target.value } })}
                                      value={filters[col]?.max || ''}
                                   />
                                </div>
                             )}
                             {info.type === 'categorical' && (
                                <div className="flex flex-col gap-2">
                                   <label className="text-xs text-secondary-text">Select Option</label>
                                   <select className="bg-background border border-border rounded px-2 py-1 text-sm focus:border-primary-accent outline-none w-full"
                                      onChange={e => setFilters(e.target.value ? { ...filters, [col]: { type: 'exact', value: e.target.value } } : (() => { const nf = {...filters}; delete nf[col]; return nf; })())}
                                      value={filters[col]?.value || ''}
                                   >
                                      <option value="">All</option>
                                      {(info as any).options.map((val: string) => <option key={val} value={val}>{val.length > 50 ? val.substring(0, 50) + '...' : val}</option>)}
                                   </select>
                                </div>
                             )}
                             {info.type === 'string' && (
                                <div className="flex flex-col gap-2">
                                   <label className="text-xs text-secondary-text">Search Text</label>
                                   <input type="text" placeholder="Search..." className="bg-background border border-border rounded px-2 py-1 text-sm focus:border-primary-accent outline-none w-full"
                                      onChange={e => setFilters(e.target.value ? { ...filters, [col]: { type: 'search', value: e.target.value } } : (() => { const nf = {...filters}; delete nf[col]; return nf; })())}
                                      value={filters[col]?.value || ''}
                                   />
                                </div>
                             )}
                             {info.type === 'none' && (
                                <p className="text-xs text-muted-text">No data to filter</p>
                             )}
                             <div className="flex justify-between mt-3 pt-2 border-t border-border">
                               <button onClick={() => setFilters((() => { const nf = {...filters}; delete nf[col]; return nf; })())} className="text-xs text-error font-medium hover:text-error/80">Clear</button>
                               <button onClick={() => setActiveFilterCol(null)} className="text-xs text-primary-accent font-medium hover:text-primary-accent/80">Close</button>
                             </div>
                          </div>
                        );
                      })()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ height: `${paddingTop}px` }} />
                  </tr>
                )}
                {virtualItems.map(virtualRow => {
                  const row = paginatedData[virtualRow.index];
                  if (!row) return null;
                  const rowKey = row._rowIdx;
                  const isSelected = selectedRowKey === rowKey;
                  return (
                    <tr
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      onClick={() => {
                        const newKey = selectedRowKey === rowKey ? null : rowKey;
                        setSelectedRowKey(newKey);
                      }}
                      onDoubleClick={() => {
                        setSelectedRowKey(rowKey);
                        setSelectedRow(row);
                      }}
                      className={`border-b border-border transition-colors cursor-pointer select-none ${
                        isSelected 
                          ? 'bg-primary-accent/15 hover:bg-primary-accent/20' 
                          : 'hover:bg-surface/50'
                      }`}
                    >
                      {columns.map(col => {
                        const val = row[col];
                        const displayVal = val === null || val === undefined ? 'N/A' 
                          : typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 4 }) 
                          : String(val);
                        return (
                          <td key={col} className={`px-4 py-2 whitespace-nowrap ${val === null ? 'text-muted-text italic' : 'text-primary-text'}`}>
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td colSpan={columns.length} style={{ height: `${paddingBottom}px` }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface shrink-0">
            <div className="flex items-center gap-2 text-sm text-secondary-text">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => {
                  const val = e.target.value;
                  setPageSize(val === 'all' ? 'all' : Number(val));
                  setPage(0);
                }}
                className="bg-surface-elevated border border-border rounded px-2 py-1 focus:border-primary-accent outline-none text-xs"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
                <option value="all">All</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 text-sm bg-surface-elevated rounded border border-border disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-secondary-text">Page {page + 1} of {totalPages}</span>
                <button 
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="px-3 py-1 text-sm bg-surface-elevated rounded border border-border disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedRow && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm cursor-pointer"
            onClick={() => {
              setSelectedRow(null);
              setSelectedRowKey(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] cursor-default"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-elevated">
                <div className="flex items-center gap-2">
                  <Table className="text-primary-accent" size={20} />
                  <h3 className="text-lg font-semibold text-primary-text">Row Details</h3>
                </div>
                <button 
                  onClick={() => {
                    setSelectedRow(null);
                    setSelectedRowKey(null);
                  }}
                  className="text-secondary-text hover:text-primary-text transition-colors p-1 hover:bg-border/30 rounded"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(selectedRow)
                    .filter(([key, val]) => {
                      if (key.startsWith('merged_')) return false;
                      if (key === 'everestRaw' || key === 'bookingsRaw' || key === 'raw' || key === '_rowIdx') return false;
                      if (typeof val === 'object' && val !== null) return false;
                      return true;
                    })
                    .sort((a, b) => {
                      const isIdKey = (k: string) => {
                        const low = k.toLowerCase();
                        return low === 'id' || low === 'txnid' || low === 'txn id' || low === 'txn_id';
                      };
                      const isA = isIdKey(a[0]);
                      const isB = isIdKey(b[0]);
                      if (isA && !isB) return -1;
                      if (!isA && isB) return 1;
                      return 0;
                    })
                    .map(([key, val]) => {
                      const displayVal = val === null || val === undefined ? 'N/A' 
                        : typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 4 }) 
                        : String(val);
                      
                      // Convert camelCase or raw keys to readable keys
                      const readableKey = key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, str => str.toUpperCase())
                        .trim();

                      const isIdKey = (k: string) => {
                        const low = k.toLowerCase();
                        return low === 'id' || low === 'txnid' || low === 'txn id' || low === 'txn_id';
                      };
                      const isId = isIdKey(key);

                      return (
                        <div 
                          key={key} 
                          className={`relative border rounded-lg p-3 flex flex-col justify-between min-h-[72px] ${
                            isId 
                              ? 'bg-primary-accent/5 border-primary-accent/30 md:col-span-2' 
                              : 'bg-background/40 border-border/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-secondary-text uppercase tracking-wider">
                              {readableKey}
                            </span>
                            {isId && !!val && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(String(val));
                                }}
                                className="text-secondary-text hover:text-primary-accent transition-colors p-1 hover:bg-border/30 rounded"
                                title="Copy ID"
                              >
                                {copiedText === String(val) ? (
                                  <Check className="text-success" size={14} />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>
                            )}
                          </div>
                          <span className={`text-sm font-medium mt-1 break-all ${isId ? 'font-mono text-primary-accent' : ''} ${val === null ? 'text-muted-text italic' : 'text-primary-text'}`}>
                            {displayVal}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-border bg-surface-elevated flex justify-end">
                <button
                  onClick={() => {
                    setSelectedRow(null);
                    setSelectedRowKey(null);
                  }}
                  className="px-4 py-2 bg-border hover:bg-border/80 text-primary-text rounded-lg text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
