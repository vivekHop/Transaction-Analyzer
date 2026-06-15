import { create } from 'zustand';
// @ts-ignore
import ProcessorWorker from './dataProcessor.worker?worker';
import { clearCache } from './lib/db';

export interface ProcessedTransaction {
  id: string;
  txnId: string;
  txnDate: string | null;
  exchangeRate: number | null;
  amountPaidINR: number | null;
  foreignCurrencyAmountReceived: number | null;

  facilitator: string | null;
  bookingRate: number | null;

  totalMarkup: number | null;
  totalFxMarkup: number | null;
  totalNonFxFees: number | null;

  typeOfTransaction: string | null;
  bankFxRate: number | null;
  bankNonFxCharges: number | null;
  bankFxMargin: number | null;
  revenue: number | null;
  cogs: number | null;
  netProfit: number | null;

  everestRaw?: any;
  bookingsRaw?: any;

  isMatched: boolean;
  isMatchedToIdfc?: boolean;
  raw: any;

  merged_matched_T_T?: any;
  merged_matched_T_F?: any;
  merged_matched_F_T?: any;
  merged_matched_F_F?: any;

  merged_all_T?: any;
  merged_all_F?: any;
}

export type DatasetType = 'matched-ad2' | 'matched-ad1-idfc' | 'unmatched' | 'all' | 'everest' | 'bookings' | 'idfc' | 'commercials' | 'vendors' | 'manual-transactions';

export interface TabState {
  id: string;
  name: string;
  currentDataset: DatasetType;
  currentPlan: Record<string, any> | null;
  currentQueryText: string | null;
  queryResult: any[] | null;
  filters: Record<string, any>;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  includeEverestMatched: boolean;
  includeBookingsMatched: boolean;
  unmatchedView: 'everest' | 'bookings' | 'idfc';
  allShowEverest: boolean;
}

interface AppState {
  transactionsRaw: any[];
  bookingsRaw: any[];
  commercialsRaw: any[];
  vendorsRaw: any[];
  idfcRaw: any[];
  manualTransactionsRaw: any[];
  datasetsMetadata: Record<string, any>;
  processedData: ProcessedTransaction[];
  processedIdfcData: any[];
  processedManualData: any[];
  queryHistory: { query: string; plan: any }[];

  setTransactionsRaw: (data: any[]) => void;
  setBookingsRaw: (data: any[]) => void;
  setCommercialsRaw: (data: any[]) => void;
  setVendorsRaw: (data: any[]) => void;
  setIdfcRaw: (data: any[]) => void;
  setManualTransactionsRaw: (data: any[]) => void;
  setDatasetsMetadata: (key: string, metadata: any) => void;
  processData: () => void;
  clearSession: () => void;

  currentDataset: DatasetType;
  setCurrentDataset: (type: DatasetType) => void;

  currentPlan: Record<string, any> | null;
  setCurrentPlan: (plan: Record<string, any> | null, text?: string | null) => void;
  currentQueryText: string | null;

  queryResult: any[] | null;
  setQueryResult: (res: any[] | null) => void;
  addQueryToHistory: (query: string, plan: any) => void;

  filters: Record<string, any>;
  setFilters: (filters: Record<string, any>) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  setSortConfig: (sortConfig: { key: string; direction: 'asc' | 'desc' } | null) => void;

  includeEverestMatched: boolean;
  setIncludeEverestMatched: (val: boolean) => void;
  includeBookingsMatched: boolean;
  setIncludeBookingsMatched: (val: boolean) => void;
  unmatchedView: 'everest' | 'bookings' | 'idfc';
  setUnmatchedView: (val: 'everest' | 'bookings' | 'idfc') => void;
  allShowEverest: boolean;
  setAllShowEverest: (val: boolean) => void;

  tabs: TabState[];
  activeTabId: string;
  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string) => void;

  isProcessing: boolean;
  exportDataList: any[];
  setExportDataList: (list: any[]) => void;
}

function normalizeId(id: string): string {
  if (!id) return '';
  return String(id).trim().toUpperCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ');
}

export const useStore = create<AppState>((set, get) => ({
  transactionsRaw: [],
  bookingsRaw: [],
  commercialsRaw: [],
  vendorsRaw: [],
  idfcRaw: [],
  manualTransactionsRaw: [],
  datasetsMetadata: {},
  processedData: [],
  processedIdfcData: [],
  processedManualData: [],
  queryHistory: [],
  isProcessing: false,
  exportDataList: [],
  setExportDataList: (list) => set({ exportDataList: list }),

  currentDataset: 'matched-ad2',
  setCurrentDataset: (type) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, currentDataset: type, filters: {}, sortConfig: null } : t);
    return { currentDataset: type, filters: {}, sortConfig: null, tabs: updatedTabs };
  }),

  currentPlan: null,
  currentQueryText: null,
  setCurrentPlan: (plan, text = null) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, currentPlan: plan, currentQueryText: text } : t);
    return { currentPlan: plan, currentQueryText: text, tabs: updatedTabs };
  }),

  queryResult: null,
  setQueryResult: (res) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, queryResult: res } : t);
    return { queryResult: res, tabs: updatedTabs };
  }),
  addQueryToHistory: (query, plan) => set((state) => ({ queryHistory: [{ query, plan }, ...state.queryHistory] })),

  filters: {},
  setFilters: (filters) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, filters } : t);
    return { filters, tabs: updatedTabs };
  }),
  sortConfig: null,
  setSortConfig: (sortConfig) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, sortConfig } : t);
    return { sortConfig, tabs: updatedTabs };
  }),

  includeEverestMatched: false,
  setIncludeEverestMatched: (val) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, includeEverestMatched: val } : t);
    return { includeEverestMatched: val, tabs: updatedTabs };
  }),
  includeBookingsMatched: false,
  setIncludeBookingsMatched: (val) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, includeBookingsMatched: val } : t);
    return { includeBookingsMatched: val, tabs: updatedTabs };
  }),
  unmatchedView: 'everest',
  setUnmatchedView: (val) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, unmatchedView: val } : t);
    return { unmatchedView: val, tabs: updatedTabs };
  }),
  allShowEverest: false,
  setAllShowEverest: (val) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, allShowEverest: val } : t);
    return { allShowEverest: val, tabs: updatedTabs };
  }),

  tabs: [
    {
      id: 'tab-1',
      name: 'Tab 1',
      currentDataset: 'matched-ad2',
      currentPlan: null,
      currentQueryText: null,
      queryResult: null,
      filters: {},
      sortConfig: null,
      includeEverestMatched: false,
      includeBookingsMatched: false,
      unmatchedView: 'everest',
      allShowEverest: false,
    }
  ],
  activeTabId: 'tab-1',
  addTab: () => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? {
      ...t,
      currentDataset: state.currentDataset,
      currentPlan: state.currentPlan,
      currentQueryText: state.currentQueryText,
      queryResult: state.queryResult,
      filters: state.filters,
      sortConfig: state.sortConfig,
      includeEverestMatched: state.includeEverestMatched,
      includeBookingsMatched: state.includeBookingsMatched,
      unmatchedView: state.unmatchedView,
      allShowEverest: state.allShowEverest,
    } : t);

    const nextId = `tab-${Date.now()}`;
    const newTab: TabState = {
      id: nextId,
      name: `Tab ${updatedTabs.length + 1}`,
      currentDataset: 'matched-ad2',
      currentPlan: null,
      currentQueryText: null,
      queryResult: null,
      filters: {},
      sortConfig: null,
      includeEverestMatched: false,
      includeBookingsMatched: false,
      unmatchedView: 'everest',
      allShowEverest: false,
    };

    return {
      tabs: [...updatedTabs, newTab],
      activeTabId: nextId,
      currentDataset: 'matched-ad2',
      currentPlan: null,
      currentQueryText: null,
      queryResult: null,
      filters: {},
      sortConfig: null,
      includeEverestMatched: false,
      includeBookingsMatched: false,
      unmatchedView: 'everest',
      allShowEverest: false,
    };
  }),
  closeTab: (id) => set((state) => {
    if (state.tabs.length === 1) return {};
    const newTabs = state.tabs.filter(t => t.id !== id);
    let newActiveId = state.activeTabId;
    let updates: any = { tabs: newTabs };
    
    if (state.activeTabId === id) {
      const idx = state.tabs.findIndex(t => t.id === id);
      const nextActive = state.tabs[idx + 1] || state.tabs[idx - 1];
      newActiveId = nextActive.id;
      updates = {
        ...updates,
        activeTabId: newActiveId,
        currentDataset: nextActive.currentDataset,
        currentPlan: nextActive.currentPlan,
        currentQueryText: nextActive.currentQueryText,
        queryResult: nextActive.queryResult,
        filters: nextActive.filters,
        sortConfig: nextActive.sortConfig,
        includeEverestMatched: nextActive.includeEverestMatched,
        includeBookingsMatched: nextActive.includeBookingsMatched,
        unmatchedView: nextActive.unmatchedView,
        allShowEverest: nextActive.allShowEverest,
      };
    }
    return updates;
  }),
  setActiveTabId: (id) => set((state) => {
    const updatedTabs = state.tabs.map(t => t.id === state.activeTabId ? {
      ...t,
      currentDataset: state.currentDataset,
      currentPlan: state.currentPlan,
      currentQueryText: state.currentQueryText,
      queryResult: state.queryResult,
      filters: state.filters,
      sortConfig: state.sortConfig,
      includeEverestMatched: state.includeEverestMatched,
      includeBookingsMatched: state.includeBookingsMatched,
      unmatchedView: state.unmatchedView,
      allShowEverest: state.allShowEverest,
    } : t);

    const nextTab = updatedTabs.find(t => t.id === id);
    if (!nextTab) return {};

    return {
      tabs: updatedTabs,
      activeTabId: id,
      currentDataset: nextTab.currentDataset,
      currentPlan: nextTab.currentPlan,
      currentQueryText: nextTab.currentQueryText,
      queryResult: nextTab.queryResult,
      filters: nextTab.filters,
      sortConfig: nextTab.sortConfig,
      includeEverestMatched: nextTab.includeEverestMatched,
      includeBookingsMatched: nextTab.includeBookingsMatched,
      unmatchedView: nextTab.unmatchedView,
      allShowEverest: nextTab.allShowEverest,
    };
  }),

  setTransactionsRaw: (data) => {
    const cleaned = Array.isArray(data) ? data.map(row => {
      if (row && typeof row === 'object') {
        const targetKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'hop coins used') || 'Hop Coins Used';
        const val = row[targetKey];
        if (val !== undefined && typeof val === 'string' && val.trim().toUpperCase() === 'N/A') {
          return { ...row, [targetKey]: 0 };
        }
      }
      return row;
    }) : [];
    set({ transactionsRaw: cleaned });
  },
  setBookingsRaw: (data) => {
    const cleaned = Array.isArray(data) ? data.map(row => {
      if (row && typeof row === 'object') {
        const targetKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'facilitator') || 'Facilitator';
        const val = row[targetKey];
        if (val !== undefined && typeof val === 'string' && (val.trim() === 'RemitX' || val.trim() === 'remitx')) {
          return { ...row, [targetKey]: 'Remit X' };
        }
      }
      return row;
    }) : [];
    set({ bookingsRaw: cleaned });
  },
  setCommercialsRaw: (data) => set({ commercialsRaw: data }),
  setVendorsRaw: (data) => set({ vendorsRaw: data }),
  setIdfcRaw: (data) => set({ idfcRaw: data }),
  setManualTransactionsRaw: (data) => set({ manualTransactionsRaw: data }),
  setDatasetsMetadata: (key, metadata) => set((state) => ({
    datasetsMetadata: { ...state.datasetsMetadata, [key]: metadata }
  })),

  clearSession: () => {
    clearCache().catch(err => console.error("Failed to clear IndexedDB cache:", err));
    set({
      transactionsRaw: [],
      bookingsRaw: [],
      commercialsRaw: [],
      vendorsRaw: [],
      idfcRaw: [],
      manualTransactionsRaw: [],
      datasetsMetadata: {},
      processedData: [],
      processedIdfcData: [],
      processedManualData: [],
      queryHistory: [],
      currentPlan: null,
      currentQueryText: null,
      queryResult: null,
      currentDataset: 'matched-ad2',
      filters: {},
      sortConfig: null,
      includeEverestMatched: false,
      includeBookingsMatched: false,
      unmatchedView: 'everest',
      allShowEverest: false,
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          name: 'Tab 1',
          currentDataset: 'matched-ad2',
          currentPlan: null,
          currentQueryText: null,
          queryResult: null,
          filters: {},
          sortConfig: null,
          includeEverestMatched: false,
          includeBookingsMatched: false,
          unmatchedView: 'everest',
          allShowEverest: false,
        }
      ],
    });
  },

  processData: () => {
    set({ isProcessing: true });
    const { transactionsRaw, bookingsRaw, commercialsRaw, idfcRaw, manualTransactionsRaw } = get();

    try {
      const worker = new ProcessorWorker();
      worker.postMessage({ transactionsRaw, bookingsRaw, commercialsRaw, idfcRaw, manualTransactionsRaw });
      
      worker.onmessage = (e: any) => {
        const { processed, processedIdfc, processedManual } = e.data;
        set({ processedData: processed, processedIdfcData: processedIdfc, processedManualData: processedManual, isProcessing: false });
        worker.terminate();
      };

      worker.onerror = (err) => {
        console.error("Worker error during data processing:", err);
        set({ isProcessing: false });
        worker.terminate();
      };
    } catch (err) {
      console.error("Failed to start background worker for data processing. Running synchronously on main thread as fallback.", err);
      // Synchronous fallback
      // Create bookings map
      const bookingsMap = new Map<string, any>();
      for (const b of bookingsRaw) {
        if (b['TXN ID']) {
          bookingsMap.set(normalizeId(b['TXN ID']), b);
        }
      }

      const getValByKeyFallback = (row: any, key: string) => {
        if (!row) return null;
        const trimmedKey = key.trim().toLowerCase();
        const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === trimmedKey);
        return foundKey ? row[foundKey] : null;
      };

      const normalizePartnerName = (name: string): string => {
        if (!name) return '';
        const clean = name.trim().toLowerCase();
        if (clean.includes('prithivi') || clean.includes('prithvhi') || clean.includes('prithvi')) {
          return 'prithvi forex';
        }
        if (clean === 'rrsb' || clean.includes('rr sen')) {
          return 'rr sen';
        }
        return clean;
      };

      // Create IDFC IDs set
      const idfcIdsSet = new Set<string>();
      for (const row of idfcRaw || []) {
        const txId = getValByKeyFallback(row, 'TRANSACTION ID');
        if (txId) {
          idfcIdsSet.add(normalizeId(String(txId)));
        }
      }

      // Create Everest map by txn ID
      const everestMap = new Map<string, any>();
      for (const t of transactionsRaw) {
        const txId = t['Txn Id'] || '';
        if (txId) {
          everestMap.set(normalizeId(txId), t);
        }
      }

      // Create commercials map
      const commercialsMap = new Map<string, any>();
      for (const row of commercialsRaw) {
        const partner = normalizePartnerName(String(row['Banking Partner'] || ''));
        const transType = String(row['Type of Transaction'] || '').replace(/\s+/g, '').toUpperCase();
        commercialsMap.set(`${partner}|||${transType}`, row);
      }

      const parseRawValFallback = (val: any): number | null => {
        if (val == null) return null;
        if (typeof val === 'number') return val;
        const str = String(val).trim().toUpperCase();
        if (str === 'N/A' || str === '' || str === 'NULL' || str === 'UNDEFINED') return null;
        const cleanStr = str.replace(/,/g, '');
        const parsed = parseFloat(cleanStr);
        return isNaN(parsed) ? null : parsed;
      };

      const valOrZeroFallback = (val: number | null | undefined): number => {
        return val ?? 0;
      };

      const processedFallback: ProcessedTransaction[] = transactionsRaw.map(t => {
        const rawTxnId = t['Txn Id'] || '';
        const normId = normalizeId(rawTxnId);
        const txnDate = t['Txn Date'] || t['Date'] || t['txn date'] || t['Transaction Date'] || null;

        const b = bookingsMap.get(normId);
        const isMatched = !!b;
        const isMatchedToIdfc = idfcIdsSet.has(normId);

        const exchangeRateVal = t['Exchange Rate'];
        const bookingRateVal = b ? b['Book Rate'] : null;
        const foreignCurrencyVal = t['Foreign Currency Amount Received'];
        const amountPaidINRVal = t['Amount paid (INR)'];

        let exchangeRate = parseRawValFallback(exchangeRateVal);
        let bookingRate = parseRawValFallback(bookingRateVal);
        let foreignCurrencyAmountReceived = parseRawValFallback(foreignCurrencyVal);
        let amountPaidINR = parseRawValFallback(amountPaidINRVal);

        let facilitator: string | null = null;
        let totalMarkup: number | null = null;
        let totalFxMarkup: number | null = null;

        if (isMatched) {
          facilitator = b['Facilitator'] || null;
          if (facilitator && (facilitator.trim() === 'RemitX' || facilitator.trim() === 'remitx')) {
            facilitator = 'Remit X';
            b['Facilitator'] = 'Remit X';
          }
          if (facilitator && (facilitator.toLowerCase().includes('prithivi') || facilitator.toLowerCase().includes('prithvhi') || facilitator.toLowerCase().includes('prithvi'))) {
            facilitator = 'Prithvi Forex';
            b['Facilitator'] = 'Prithvi Forex';
          }
          if (facilitator && (facilitator.trim().toUpperCase() === 'RRSB' || facilitator.toLowerCase().includes('rr sen'))) {
            facilitator = 'RR Sen';
            b['Facilitator'] = 'RR Sen';
          }

          if (exchangeRate !== null || bookingRate !== null) {
            totalMarkup = valOrZeroFallback(exchangeRate) - valOrZeroFallback(bookingRate);
          }
          if (totalMarkup !== null || foreignCurrencyAmountReceived !== null) {
            totalFxMarkup = valOrZeroFallback(totalMarkup) * valOrZeroFallback(foreignCurrencyAmountReceived);
          }
        } else {
          facilitator = "Not Found";
        }

        // Calculate Total Non-Fx Fees
        const hopFees = t['Hop Fees'];
        const bankProcessingFees = t['Bank Processing Fees'];
        const nostroCharges = t['Nostro Charges'];
        const promoCodeApplied = t['Promo Code Applied'];
        const hopCoinsUsed = t['Hop Coins Used'];

        let totalNonFxFees: number | null = null;

        if (hopFees != null || bankProcessingFees != null || nostroCharges != null) {
          const hf = valOrZeroFallback(parseRawValFallback(hopFees));
          const bpf = valOrZeroFallback(parseRawValFallback(bankProcessingFees));
          const nc = valOrZeroFallback(parseRawValFallback(nostroCharges));
          const pca = valOrZeroFallback(parseRawValFallback(promoCodeApplied));
          const hcu = valOrZeroFallback(parseRawValFallback(hopCoinsUsed));

          const sumFees = hf + bpf + nc;
          const discount = pca + (hcu / 2);
          totalNonFxFees = (sumFees - discount) / 1.18;
        }

        // 1. BankFx rate & transaction type mapping
        const purpose = t['Purpose'] || null;
        let typeOfTransaction: string | null = null;
        if (purpose) {
          const p = purpose.trim().toLowerCase();
          if (p === 'overseas education - living expenses' || p === 'overseas education - university fees') {
            typeOfTransaction = 'AD 2';
          } else if (p === 'personal gift or donation' || p === 'family maintenance') {
            typeOfTransaction = 'AD 1';
          }
        }

        let bankFxRate: number | null = null;
        let bankNonFxCharges: number | null = null;
        let bankFxMargin: number | null = null;

        if (isMatched && facilitator && typeOfTransaction) {
          const normFac = normalizePartnerName(facilitator);
          const normType = typeOfTransaction.replace(/\s+/g, '').toUpperCase();

          const commRow = commercialsMap.get(`${normFac}|||${normType}`);

          if (commRow) {
            const fxMarginVal = commRow['Fx Margin '] || commRow['Fx Margin'];
            bankFxRate = parseRawValFallback(fxMarginVal);

            const isUSD = String(t['Currency'] || '').trim().toUpperCase() === 'USD';
            const nonFxVal = commRow[isUSD ? 'Non FX (USD)' : 'Non FX (Others)'];
            bankNonFxCharges = parseRawValFallback(nonFxVal);

            if (bankFxRate !== null || foreignCurrencyAmountReceived !== null) {
              bankFxMargin = valOrZeroFallback(bankFxRate) * valOrZeroFallback(foreignCurrencyAmountReceived);
            }
          }
        }

        let revenue: number | null = null;
        if (totalFxMarkup !== null || totalNonFxFees !== null || bankFxMargin !== null) {
          revenue = valOrZeroFallback(totalFxMarkup) + valOrZeroFallback(totalNonFxFees) + valOrZeroFallback(bankFxMargin);
        }

        let cogs: number | null = null;
        if (bankFxMargin !== null || bankNonFxCharges !== null) {
          cogs = valOrZeroFallback(bankFxMargin) + valOrZeroFallback(bankNonFxCharges);
        }

        let netProfit: number | null = null;
        if (revenue !== null || cogs !== null) {
          netProfit = valOrZeroFallback(revenue) - valOrZeroFallback(cogs);
        }

        const baseObj = {
          id: normId,
          txnId: rawTxnId,
          txnDate,
          exchangeRate,
          amountPaidINR,
          foreignCurrencyAmountReceived,
          facilitator,
          bookingRate,
          totalMarkup,
          totalFxMarkup,
          totalNonFxFees,
          typeOfTransaction,
          bankFxRate,
          bankNonFxCharges,
          bankFxMargin,
          revenue,
          cogs,
          netProfit,
          isMatched,
          isMatchedToIdfc,
          raw: { ...t, ...b }
        };

        const getNormalizedKey = (k: string): string => {
          return k.toLowerCase().replace(/[^a-z0-9]/g, '');
        };

        const mergeRow = (ev: boolean, bk: boolean) => {
          const merged = { ...baseObj };
          const existingNormalized = new Set<string>();
          for (const k of Object.keys(merged)) {
            existingNormalized.add(getNormalizedKey(k));
          }

          if (ev && t) {
            for (const [k, val] of Object.entries(t)) {
              const normK = getNormalizedKey(k);
              if (!existingNormalized.has(normK)) {
                (merged as any)[k] = val;
                existingNormalized.add(normK);
              }
            }
          }

          if (bk && b) {
            for (const [k, val] of Object.entries(b)) {
              const normK = getNormalizedKey(k);
              if (!existingNormalized.has(normK)) {
                (merged as any)[k] = val;
                existingNormalized.add(normK);
              }
            }
          }

          delete (merged as any).everestRaw;
          delete (merged as any).bookingsRaw;
          return merged;
        };

        return {
          ...baseObj,
          everestRaw: t,
          bookingsRaw: b,
          merged_matched_T_T: mergeRow(true, true),
          merged_matched_T_F: mergeRow(true, false),
          merged_matched_F_T: mergeRow(false, true),
          merged_matched_F_F: mergeRow(false, false),
          merged_all_T: mergeRow(true, false),
          merged_all_F: mergeRow(false, false)
        };
      });

      const processedIdfcFallback = idfcRaw.map(row => {
        const rawTxnId = getValByKeyFallback(row, 'TRANSACTION ID') || '';
        const normId = normalizeId(String(rawTxnId));
        const evRow = everestMap.get(normId);
        
        const purpose = getValByKeyFallback(row, 'PURPOSE') || '';
        let bankingPartner = '';
        let typeOfTransaction = '';
        if (purpose) {
          const parts = String(purpose).split('-');
          if (parts.length >= 2) {
            bankingPartner = parts[0].trim();
            typeOfTransaction = parts[1].trim();
          } else {
            bankingPartner = String(purpose).trim();
          }
        }

        if (bankingPartner && (bankingPartner.toLowerCase().includes('prithivi') || bankingPartner.toLowerCase().includes('prithvhi') || bankingPartner.toLowerCase().includes('prithvi'))) {
          bankingPartner = 'Prithvi Forex';
        }
        if (bankingPartner && (bankingPartner.trim().toUpperCase() === 'RRSB' || bankingPartner.toLowerCase().includes('rr sen'))) {
          bankingPartner = 'RR Sen';
        }

        let bankFxRate: number | null = null;
        let bankNonFxCharges: number | null = null;
        let bankFxMargin: number | null = null;

        if (bankingPartner && typeOfTransaction) {
          const normFac = normalizePartnerName(bankingPartner);
          const normType = typeOfTransaction.replace(/\s+/g, '').toUpperCase();
          const commRow = commercialsMap.get(`${normFac}|||${normType}`);
          if (commRow) {
            const fxMarginVal = commRow['Fx Margin '] || commRow['Fx Margin'];
            bankFxRate = parseRawValFallback(fxMarginVal);
            
            const fcy = getValByKeyFallback(row, 'FCY');
            const isUSD = String(fcy || '').trim().toUpperCase() === 'USD';
            const nonFxVal = commRow[isUSD ? 'Non FX (USD)' : 'Non FX (Others)'];
            bankNonFxCharges = parseRawValFallback(nonFxVal);
          }
        }

        const clientRateVal = getValByKeyFallback(row, 'CLIENT RATE');
        const bookingRateVal = getValByKeyFallback(row, 'BOOKING RATE');
        const fcyAmountVal = getValByKeyFallback(row, 'FCY AMOUNT');
        const billAmountVal = getValByKeyFallback(row, 'BILL AMOUNT');

        const exchangeRate = parseRawValFallback(clientRateVal);
        const bookingRate = parseRawValFallback(bookingRateVal);
        const foreignCurrencyAmountReceived = parseRawValFallback(fcyAmountVal);
        const amountPaidINR = parseRawValFallback(billAmountVal);

        let totalMarkup: number | null = null;
        let totalFxMarkup: number | null = null;

        if (exchangeRate !== null || bookingRate !== null) {
          totalMarkup = valOrZeroFallback(exchangeRate) - valOrZeroFallback(bookingRate);
        }
        if (totalMarkup !== null || foreignCurrencyAmountReceived !== null) {
          totalFxMarkup = valOrZeroFallback(totalMarkup) * valOrZeroFallback(foreignCurrencyAmountReceived);
        }

        if (bankFxRate !== null || foreignCurrencyAmountReceived !== null) {
          bankFxMargin = valOrZeroFallback(bankFxRate) * valOrZeroFallback(foreignCurrencyAmountReceived);
        }

        // Calculate Total Non-Fx Fees (IDFC Matched)
        let totalNonFxFees: number | null = null;
        if (evRow) {
          const hopFees = evRow['Hop Fees'];
          const bankProcessingFees = evRow['Bank Processing Fees'];
          const nostroCharges = evRow['Nostro Charges'];
          const promoCodeApplied = evRow['Promo Code Applied'];
          const hopCoinsUsed = evRow['Hop Coins Used'];

          if (hopFees != null || bankProcessingFees != null || nostroCharges != null) {
            const hf = valOrZeroFallback(parseRawValFallback(hopFees));
            const bpf = valOrZeroFallback(parseRawValFallback(bankProcessingFees));
            const nc = valOrZeroFallback(parseRawValFallback(nostroCharges));
            const pca = valOrZeroFallback(parseRawValFallback(promoCodeApplied));
            const hcu = valOrZeroFallback(parseRawValFallback(hopCoinsUsed));

            const sumFees = hf + bpf + nc;
            const discount = pca + (hcu / 2);
            totalNonFxFees = (sumFees - discount) / 1.18;
          }
        }

        let revenue: number | null = null;
        if (totalFxMarkup !== null || totalNonFxFees !== null || bankFxMargin !== null) {
          revenue = valOrZeroFallback(totalFxMarkup) + valOrZeroFallback(totalNonFxFees) + valOrZeroFallback(bankFxMargin);
        }

        let cogs: number | null = null;
        if (bankFxMargin !== null || bankNonFxCharges !== null) {
          cogs = valOrZeroFallback(bankFxMargin) + valOrZeroFallback(bankNonFxCharges);
        }

        let netProfit: number | null = null;
        if (revenue !== null || cogs !== null) {
          netProfit = valOrZeroFallback(revenue) - valOrZeroFallback(cogs);
        }

        return {
          'SL : NO': getValByKeyFallback(row, 'SL : NO') ?? null,
          'Date': getValByKeyFallback(row, 'Date') ?? null,
          'PURPOSE': getValByKeyFallback(row, 'PURPOSE') ?? null,
          'Banking Partner': bankingPartner,
          'Type of Transaction': typeOfTransaction,
          'PAN CARD': getValByKeyFallback(row, 'PAN CARD') ?? null,
          'location': getValByKeyFallback(row, 'location') ?? null,
          'TRANSACTION ID': getValByKeyFallback(row, 'TRANSACTION ID') ?? null,
          'REMITTER NAME': getValByKeyFallback(row, 'REMITTER NAME') ?? null,
          'FCY': getValByKeyFallback(row, 'FCY') ?? null,
          'FCY AMOUNT': getValByKeyFallback(row, 'FCY AMOUNT') ?? null,
          'CLIENT RATE': getValByKeyFallback(row, 'CLIENT RATE') ?? null,
          'BILL AMOUNT': getValByKeyFallback(row, 'BILL AMOUNT') ?? null,
          'BOOKING RATE': getValByKeyFallback(row, 'BOOKING RATE') ?? null,
          'AMOUNT CREATED AS PER TXN': getValByKeyFallback(row, 'AMOUNT CREATED AS PER TXN') ?? null,
          'Amount received': getValByKeyFallback(row, 'Amount received') ?? null,
          'DIFFERENCE IN AMOUNT': getValByKeyFallback(row, 'DIFFERENCE IN AMOUNT') ?? null,
          'UTR NO': getValByKeyFallback(row, 'UTR NO') ?? null,
          'BENEFECIARY DETAILS': getValByKeyFallback(row, 'BENEFECIARY DETAILS') ?? null,
          'DESCREPANCIES': getValByKeyFallback(row, 'DESCREPANCIES') ?? null,
          'DOCS SUBMISSION': getValByKeyFallback(row, 'DOCS SUBMISSION') ?? null,
          'MARGIN': getValByKeyFallback(row, 'MARGIN') ?? null,
          'PROFIT': getValByKeyFallback(row, 'PROFIT') ?? null,
          'Total Markup': totalMarkup,
          'Total Fx Markup': totalFxMarkup,
          'Total Non-Fx Fees': totalNonFxFees,
          'Bank Fx Rate': bankFxRate,
          'Bank Non Fx Charges': bankNonFxCharges,
          'Bank Fx Margin': bankFxMargin,
          'Revenue': revenue,
          'COGS': cogs,
          'Net Profit': netProfit,
          id: normId,
          txnId: rawTxnId,
          isMatched: true,
          raw: row
        };
      });

      const parseManualDateFallback = (row: any): string | null => {
        const dayVal = row['Day'];
        const day = parseRawValFallback(dayVal);
        const monthVal = row['Month'];
        const yearVal = row['Year'];
        
        if (day !== null && monthVal !== null && yearVal !== null) {
          let mNum = Number(monthVal);
          if (isNaN(mNum)) {
            const mStr = String(monthVal).trim().toLowerCase();
            const monthMap: Record<string, number> = {
              jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
              may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, september: 9,
              oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
            };
            mNum = monthMap[mStr] || 1;
          }
          const yNum = Number(yearVal);
          if (!isNaN(yNum)) {
            return `${yNum}-${String(mNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          }
        }
        
        const dateVal = row['DATE'] || row['Date'];
        if (dateVal !== null && dateVal !== undefined) {
          const num = Number(dateVal);
          if (!isNaN(num) && num > 30000) {
            const date = new Date((num - 25569) * 86400 * 1000);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          }
          
          const dateStr = String(dateVal).trim();
          const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (dmyMatch) {
            const d = dmyMatch[1].padStart(2, '0');
            const m = dmyMatch[2].padStart(2, '0');
            const y = dmyMatch[3];
            return `${y}-${m}-${d}`;
          }
          
          const parsed = Date.parse(dateStr);
          if (!isNaN(parsed)) {
            return new Date(parsed).toISOString().split('T')[0];
          }
        }
        
        return null;
      };

      const getBankFxMarkupForManualFallback = (facName: string, category: string): number | null => {
        if (!facName) return null;
        const normFac = normalizePartnerName(facName);
        const normCategory = String(category || '').replace(/\s+/g, '').toUpperCase();
        
        for (const commRow of commercialsRaw || []) {
          const commPartner = normalizePartnerName(String(commRow['Banking Partner'] || ''));
          const commType = String(commRow['Type of Transaction'] || '').replace(/\s+/g, '').toUpperCase();
          
          if (commType === normCategory && commPartner) {
            if (normFac.includes(commPartner) || commPartner.includes(normFac)) {
              const fxMarginVal = commRow['Fx Margin '] || commRow['Fx Margin'];
              return parseRawValFallback(fxMarginVal);
            }
          }
        }
        return null;
      };

      const { manualTransactionsRaw } = get();
      const processedManualFallback = (manualTransactionsRaw || []).map((row: any) => {
        const facilitatorName = String(row['Facilitator Name'] || '').trim();
        const cleanFac = facilitatorName.toLowerCase();
        const isFlywire = cleanFac.includes('flywire payments corporation') || cleanFac.includes('flywire');
        const isEbix = cleanFac.includes('ebixcash world money') || cleanFac.includes('ebix');
        
        const vol = parseRawValFallback(row['VOL']);
        const saleRate = parseRawValFallback(row['SALE RATE']);
        const ibr = parseRawValFallback(row['IBR']);
        const amountInUSD = parseRawValFallback(row['Amount in $']);
        const vendorName = String(row['Vendor Name'] || '').trim();
        const vendorCode = String(row['Vendor'] || '').trim();
        const salesPerson = String(row['Sales Person'] || '').trim();
        const category = String(row['Transaction Category'] || '').trim();

        const isAuxilo = vendorCode.toLowerCase().includes('auxilo') || 
                         vendorName.toLowerCase().includes('auxilo') || 
                         salesPerson.toLowerCase().includes('auxilo');

        let totalMarkup: number | null = null;
        let totalFxMargin: number | null = null;
        let bankFxMarkup: number | null = null;
        let bankFxMargin: number | null = null;
        let revenue: number | null = null;
        let cogs: number | null = null;
        let netRevenue: number | null = null;

        if (isFlywire) {
          totalMarkup = null;
          totalFxMargin = null;
          bankFxMarkup = null;
          bankFxMargin = null;
          
          const usdToInrRate = saleRate || 83.0;
          revenue = 0.002 * valOrZeroFallback(amountInUSD) * usdToInrRate;
          cogs = 0;
          netRevenue = revenue;
        } else if (isEbix) {
          if (saleRate !== null && ibr !== null) {
            totalMarkup = saleRate - ibr;
          }
          if (totalMarkup !== null && vol !== null) {
            totalFxMargin = totalMarkup * vol;
          }
          bankFxMarkup = 0.2;
          if (vol !== null) {
            bankFxMargin = 0.2 * vol;
          }
          revenue = totalFxMargin;
          
          if (isAuxilo) {
            if (vol !== null) {
              cogs = 0.011 * vol;
            } else {
              cogs = 0;
            }
          } else {
            cogs = bankFxMargin;
          }
          
          if (revenue !== null && cogs !== null) {
            netRevenue = revenue - cogs;
          }
        } else {
          if (saleRate !== null && ibr !== null) {
            totalMarkup = saleRate - ibr;
          }
          if (totalMarkup !== null && vol !== null) {
            totalFxMargin = totalMarkup * vol;
          }
          
          bankFxMarkup = getBankFxMarkupForManualFallback(facilitatorName, category);
          
          if (bankFxMarkup !== null && vol !== null) {
            bankFxMargin = bankFxMarkup * vol;
          }
          revenue = totalFxMargin;
          cogs = bankFxMargin;
          
          if (revenue !== null && cogs !== null) {
            netRevenue = revenue - cogs;
          }
        }

        let purpose = '';
        if (category) {
          const catUpper = category.toUpperCase();
          if (catUpper === 'AD1') {
            purpose = 'AD 1 Transaction';
          } else if (catUpper === 'AD2') {
            purpose = 'AD 2 Transaction';
          } else {
            purpose = `${category} Transaction`;
          }
        }

        const txnDate = parseManualDateFallback(row);

        return {
          ...row,
          'Total Markup': totalMarkup,
          'Total Fx Margin': totalFxMargin,
          'Bank Fx Markup': bankFxMarkup,
          'Bank Fx Margin': bankFxMargin,
          'Revenue': revenue,
          'CoGS': cogs,
          'Net Revenue': netRevenue,
          'Purpose': purpose,
          'Txn Date': txnDate,
          'Date': txnDate,
          id: `${row['Vendor'] || ''}_${row['DATE'] || ''}_${vol || ''}_${row['REMITER NAME'] || row['Remiter Name'] || ''}`
        };
      });

      set({ processedData: processedFallback, processedIdfcData: processedIdfcFallback, processedManualData: processedManualFallback, isProcessing: false });
    }
  }
}));
