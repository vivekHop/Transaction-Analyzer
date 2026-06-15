import React, { useMemo } from 'react';
import { useStore } from '../store';
import { motion } from 'framer-motion';

export function KPIDashboard() {
  const processedData = useStore(state => state.processedData);

  const kpis = useMemo(() => {
    let totalPaid = 0;
    let totalFx = 0;
    let totalNonFx = 0;
    let totalExRate = 0;
    let rateCount = 0;
    
    let matched = 0;
    let unmatched = 0;
    
    const facilitators = new Set<string>();

    processedData.forEach(tx => {
      const isAnyMatched = tx.isMatched || tx.isMatchedToIdfc;
      if (isAnyMatched) {
        matched++;
        if (tx.totalFxMarkup !== null) totalFx += tx.totalFxMarkup;
      } else {
        unmatched++;
      }
      
      if (tx.amountPaidINR !== null) totalPaid += tx.amountPaidINR;
      if (tx.totalNonFxFees !== null) totalNonFx += tx.totalNonFxFees;
      
      if (tx.exchangeRate !== null) {
        totalExRate += tx.exchangeRate;
        rateCount++;
      }
      
      if (tx.facilitator && tx.facilitator !== "Not Found") {
        facilitators.add(tx.facilitator);
      }
    });

    return [
      { label: 'Total Transactions', value: processedData.length.toLocaleString(), prefix: '' },
      { label: 'Matched', value: matched.toLocaleString(), prefix: '', color: 'text-success' },
      { label: 'Unmatched', value: unmatched.toLocaleString(), prefix: '', color: 'text-error' },
      { label: 'Total Paid (INR)', value: totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 }), prefix: '₹' },
      { label: 'Total FX Markup', value: totalFx.toLocaleString(undefined, { maximumFractionDigits: 0 }), prefix: '₹', color: 'text-highlight' },
      { label: 'Total Non-FX Fees', value: totalNonFx.toLocaleString(undefined, { maximumFractionDigits: 0 }), prefix: '₹' },
      { label: 'Avg Exchange Rate', value: rateCount ? (totalExRate / rateCount).toFixed(4) : 'N/A', prefix: '₹' },
      { label: 'Facilitators', value: facilitators.size.toString(), prefix: '' },
    ];
  }, [processedData]);

  return (
    <div className="grid grid-cols-4 xl:grid-cols-8 gap-4 shrink-0">
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="bg-surface border border-border rounded-xl p-4 flex flex-col hover:border-border/80 hover:bg-surface-elevated transition-colors group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary-accent/5 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110" />
          <span className="text-xs font-medium text-muted-text uppercase tracking-wider mb-2 relative z-10">{kpi.label}</span>
          <div className="flex items-baseline gap-1 relative z-10">
            {kpi.prefix && <span className="text-sm font-medium text-secondary-text">{kpi.prefix}</span>}
            <span className={`text-2xl font-bold ${kpi.color || 'text-primary-text'}`}>{kpi.value}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
