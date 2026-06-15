self.onmessage = (e: MessageEvent) => {
  const { transactionsRaw, bookingsRaw, commercialsRaw, idfcRaw, manualTransactionsRaw } = e.data;

  const normalizeId = (id: string): string => {
    if (!id) return '';
    return String(id).trim().toUpperCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[\t\r\n]/g, '').replace(/\s+/g, ' ');
  };

  const parseRawVal = (val: any): number | null => {
    if (val == null) return null;
    if (typeof val === 'number') return val;
    const str = String(val).trim().toUpperCase();
    if (str === 'N/A' || str === '' || str === 'NULL' || str === 'UNDEFINED') return null;
    const cleanStr = str.replace(/,/g, '');
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? null : parsed;
  };

  const valOrZero = (val: number | null | undefined): number => {
    return val ?? 0;
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

  const getValByKey = (row: any, key: string) => {
    if (!row) return null;
    const trimmedKey = key.trim().toLowerCase();
    const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === trimmedKey);
    return foundKey ? row[foundKey] : null;
  };

  // Create bookings map
  const bookingsMap = new Map<string, any>();
  for (const b of bookingsRaw) {
    if (b['TXN ID']) {
      bookingsMap.set(normalizeId(b['TXN ID']), b);
    }
  }

  // Create IDFC IDs set
  const idfcIdsSet = new Set<string>();
  for (const row of idfcRaw || []) {
    const txId = getValByKey(row, 'TRANSACTION ID');
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

  const processed = transactionsRaw.map((t: any) => {
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

    let exchangeRate = parseRawVal(exchangeRateVal);
    let bookingRate = parseRawVal(bookingRateVal);
    let foreignCurrencyAmountReceived = parseRawVal(foreignCurrencyVal);
    let amountPaidINR = parseRawVal(amountPaidINRVal);

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
        totalMarkup = valOrZero(exchangeRate) - valOrZero(bookingRate);
      }
      if (totalMarkup !== null || foreignCurrencyAmountReceived !== null) {
        totalFxMarkup = valOrZero(totalMarkup) * valOrZero(foreignCurrencyAmountReceived);
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

    // If at least one fee component is present, calculate.
    if (hopFees != null || bankProcessingFees != null || nostroCharges != null) {
      const hf = valOrZero(parseRawVal(hopFees));
      const bpf = valOrZero(parseRawVal(bankProcessingFees));
      const nc = valOrZero(parseRawVal(nostroCharges));
      const pca = valOrZero(parseRawVal(promoCodeApplied));
      const hcu = valOrZero(parseRawVal(hopCoinsUsed));

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
        bankFxRate = parseRawVal(fxMarginVal);

        const isUSD = String(t['Currency'] || '').trim().toUpperCase() === 'USD';
        const nonFxVal = commRow[isUSD ? 'Non FX (USD)' : 'Non FX (Others)'];
        bankNonFxCharges = parseRawVal(nonFxVal);

        if (bankFxRate !== null || foreignCurrencyAmountReceived !== null) {
          bankFxMargin = valOrZero(bankFxRate) * valOrZero(foreignCurrencyAmountReceived);
        }
      }
    }

    let revenue: number | null = null;
    if (totalFxMarkup !== null || totalNonFxFees !== null || bankFxMargin !== null) {
      revenue = valOrZero(totalFxMarkup) + valOrZero(totalNonFxFees) + valOrZero(bankFxMargin);
    }

    let cogs: number | null = null;
    if (bankFxMargin !== null || bankNonFxCharges !== null) {
      cogs = valOrZero(bankFxMargin) + valOrZero(bankNonFxCharges);
    }

    let netProfit: number | null = null;
    if (revenue !== null || cogs !== null) {
      netProfit = valOrZero(revenue) - valOrZero(cogs);
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

    const merged_matched_T_T = mergeRow(true, true);
    const merged_matched_T_F = mergeRow(true, false);
    const merged_matched_F_T = mergeRow(false, true);
    const merged_matched_F_F = mergeRow(false, false);

    const merged_all_T = mergeRow(true, false);
    const merged_all_F = mergeRow(false, false);

    return {
      ...baseObj,
      everestRaw: t,
      bookingsRaw: b,
      merged_matched_T_T,
      merged_matched_T_F,
      merged_matched_F_T,
      merged_matched_F_F,
      merged_all_T,
      merged_all_F
    };
  });

  const processedIdfc = (idfcRaw || []).map((row: any) => {
    const rawTxnId = getValByKey(row, 'TRANSACTION ID') || '';
    const normId = normalizeId(String(rawTxnId));
    const evRow = everestMap.get(normId);
    
    const purpose = getValByKey(row, 'PURPOSE') || '';
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
        bankFxRate = parseRawVal(fxMarginVal);
        
        const fcy = getValByKey(row, 'FCY');
        const isUSD = String(fcy || '').trim().toUpperCase() === 'USD';
        const nonFxVal = commRow[isUSD ? 'Non FX (USD)' : 'Non FX (Others)'];
        bankNonFxCharges = parseRawVal(nonFxVal);
      }
    }

    const clientRateVal = getValByKey(row, 'CLIENT RATE');
    const bookingRateVal = getValByKey(row, 'BOOKING RATE');
    const fcyAmountVal = getValByKey(row, 'FCY AMOUNT');
    const billAmountVal = getValByKey(row, 'BILL AMOUNT');

    const exchangeRate = parseRawVal(clientRateVal);
    const bookingRate = parseRawVal(bookingRateVal);
    const foreignCurrencyAmountReceived = parseRawVal(fcyAmountVal);
    const amountPaidINR = parseRawVal(billAmountVal);

    let totalMarkup: number | null = null;
    let totalFxMarkup: number | null = null;

    if (exchangeRate !== null || bookingRate !== null) {
      totalMarkup = valOrZero(exchangeRate) - valOrZero(bookingRate);
    }
    if (totalMarkup !== null || foreignCurrencyAmountReceived !== null) {
      totalFxMarkup = valOrZero(totalMarkup) * valOrZero(foreignCurrencyAmountReceived);
    }

    if (bankFxRate !== null || foreignCurrencyAmountReceived !== null) {
      bankFxMargin = valOrZero(bankFxRate) * valOrZero(foreignCurrencyAmountReceived);
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
        const hf = valOrZero(parseRawVal(hopFees));
        const bpf = valOrZero(parseRawVal(bankProcessingFees));
        const nc = valOrZero(parseRawVal(nostroCharges));
        const pca = valOrZero(parseRawVal(promoCodeApplied));
        const hcu = valOrZero(parseRawVal(hopCoinsUsed));

        const sumFees = hf + bpf + nc;
        const discount = pca + (hcu / 2);
        totalNonFxFees = (sumFees - discount) / 1.18;
      }
    }

    let revenue: number | null = null;
    if (totalFxMarkup !== null || totalNonFxFees !== null || bankFxMargin !== null) {
      revenue = valOrZero(totalFxMarkup) + valOrZero(totalNonFxFees) + valOrZero(bankFxMargin);
    }

    let cogs: number | null = null;
    if (bankFxMargin !== null || bankNonFxCharges !== null) {
      cogs = valOrZero(bankFxMargin) + valOrZero(bankNonFxCharges);
    }

    let netProfit: number | null = null;
    if (revenue !== null || cogs !== null) {
      netProfit = valOrZero(revenue) - valOrZero(cogs);
    }

    return {
      'SL : NO': getValByKey(row, 'SL : NO') ?? null,
      'Date': getValByKey(row, 'Date') ?? null,
      'PURPOSE': getValByKey(row, 'PURPOSE') ?? null,
      'Banking Partner': bankingPartner,
      'Type of Transaction': typeOfTransaction,
      'PAN CARD': getValByKey(row, 'PAN CARD') ?? null,
      'location': getValByKey(row, 'location') ?? null,
      'TRANSACTION ID': getValByKey(row, 'TRANSACTION ID') ?? null,
      'REMITTER NAME': getValByKey(row, 'REMITTER NAME') ?? null,
      'FCY': getValByKey(row, 'FCY') ?? null,
      'FCY AMOUNT': getValByKey(row, 'FCY AMOUNT') ?? null,
      'CLIENT RATE': getValByKey(row, 'CLIENT RATE') ?? null,
      'BILL AMOUNT': getValByKey(row, 'BILL AMOUNT') ?? null,
      'BOOKING RATE': getValByKey(row, 'BOOKING RATE') ?? null,
      'AMOUNT CREATED AS PER TXN': getValByKey(row, 'AMOUNT CREATED AS PER TXN') ?? null,
      'Amount received': getValByKey(row, 'Amount received') ?? null,
      'DIFFERENCE IN AMOUNT': getValByKey(row, 'DIFFERENCE IN AMOUNT') ?? null,
      'UTR NO': getValByKey(row, 'UTR NO') ?? null,
      'BENEFECIARY DETAILS': getValByKey(row, 'BENEFECIARY DETAILS') ?? null,
      'DESCREPANCIES': getValByKey(row, 'DESCREPANCIES') ?? null,
      'DOCS SUBMISSION': getValByKey(row, 'DOCS SUBMISSION') ?? null,
      'MARGIN': getValByKey(row, 'MARGIN') ?? null,
      'PROFIT': getValByKey(row, 'PROFIT') ?? null,
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

  // 3. Process Manual Transactions
  const parseManualDate = (row: any): string | null => {
    const dayVal = row['Day'];
    const day = parseRawVal(dayVal);
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

  const getBankFxMarkupForManual = (facName: string, category: string): number | null => {
    if (!facName) return null;
    const normFac = normalizePartnerName(facName);
    const normCategory = String(category || '').replace(/\s+/g, '').toUpperCase();
    
    for (const commRow of commercialsRaw || []) {
      const commPartner = normalizePartnerName(String(commRow['Banking Partner'] || ''));
      const commType = String(commRow['Type of Transaction'] || '').replace(/\s+/g, '').toUpperCase();
      
      if (commType === normCategory && commPartner) {
        if (normFac.includes(commPartner) || commPartner.includes(normFac)) {
          const fxMarginVal = commRow['Fx Margin '] || commRow['Fx Margin'];
          return parseRawVal(fxMarginVal);
        }
      }
    }
    return null;
  };

  const processedManual = (manualTransactionsRaw || []).map((row: any) => {
    const facilitatorName = String(row['Facilitator Name'] || '').trim();
    const cleanFac = facilitatorName.toLowerCase();
    const isFlywire = cleanFac.includes('flywire payments corporation') || cleanFac.includes('flywire');
    const isEbix = cleanFac.includes('ebixcash world money') || cleanFac.includes('ebix');
    
    const vol = parseRawVal(row['VOL']);
    const saleRate = parseRawVal(row['SALE RATE']);
    const ibr = parseRawVal(row['IBR']);
    const amountInUSD = parseRawVal(row['Amount in $']);
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
      revenue = 0.002 * valOrZero(amountInUSD) * usdToInrRate;
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
      
      bankFxMarkup = getBankFxMarkupForManual(facilitatorName, category);
      
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

    const txnDate = parseManualDate(row);

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

  self.postMessage({ processed, processedIdfc, processedManual });
};
