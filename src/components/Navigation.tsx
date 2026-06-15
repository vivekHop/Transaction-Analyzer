import React from 'react';
import { useStore } from '../store';
import { Shield, RefreshCw, Activity } from 'lucide-react';

export function Navigation() {
  const clearSession = useStore(state => state.clearSession);

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-accent/10 text-primary-accent">
          <Activity size={20} />
        </div>
        <h1 className="text-xl font-semibold text-primary-text tracking-tight">Remittance Analytics Copilot</h1>
        <span className="px-2.5 py-1 text-xs font-medium bg-secondary-accent/10 text-secondary-accent rounded-full border border-secondary-accent/20">
          PROD
        </span>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm text-muted-text">
          <Shield size={16} className="text-success" />
          <span>Session Only</span>
          <span className="w-1 h-1 rounded-full bg-border mx-1" />
          <span>Data Never Stored</span>
        </div>
        <button 
          onClick={clearSession}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-error hover:bg-error/10 rounded-lg transition-colors border border-transparent hover:border-error/20"
        >
          <RefreshCw size={16} />
          Reset Session
        </button>
      </div>
    </header>
  );
}
