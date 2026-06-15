import React from 'react';
import { useStore } from './store';
import { Navigation } from './components/Navigation';
import { KPIDashboard } from './components/KPIDashboard';
import { UploadSection } from './components/UploadSection';
import { Workspace } from './components/Workspace';
import { ErrorCenter } from './components/ErrorCenter';

function App() {
  const processedData = useStore(state => state.processedData);
  const hasData = processedData.length > 0;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <Navigation />
      
      <main className="flex-1 flex flex-col p-6 overflow-hidden">
        <ErrorCenter />
        
        {!hasData ? (
          <UploadSection />
        ) : (
          <div className="flex flex-col flex-1 gap-6 overflow-hidden">
            <KPIDashboard />
            <Workspace />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
