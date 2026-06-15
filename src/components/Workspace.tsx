import React from 'react';
import { QuerySidebar } from './QuerySidebar';
import { ResultsArea } from './ResultsArea';

export function Workspace() {
  return (
    <div className="flex-1 flex gap-6 overflow-hidden min-h-[500px]">
      <QuerySidebar />
      <div className="flex-1 bg-surface border border-border rounded-xl flex flex-col overflow-hidden">
        <ResultsArea />
      </div>
    </div>
  );
}
