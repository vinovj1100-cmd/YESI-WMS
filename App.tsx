import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { seedDatabase } from '@/lib/db';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import OfflineIndicator from '@/components/OfflineIndicator';
import InstallPrompt from '@/components/InstallPrompt';
import CommandPalette from '@/components/CommandPalette';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import InboundReceiving from '@/pages/InboundReceiving';
import InventoryHub from '@/pages/InventoryHub';
import PickPack from '@/pages/PickPack';
import Returns from '@/pages/Returns';
import PDFSequencer from '@/pages/PDFSequencer';
import Auditor from '@/pages/Auditor';
import BulkConverter from '@/pages/BulkConverter';
import Templates from '@/pages/Templates';
import Memory from '@/pages/Memory';
import Settings from '@/pages/Settings';
import UserManagement from '@/pages/UserManagement';
import CycleCount from '@/pages/CycleCount';
import Analytics from '@/pages/Analytics';
import Replenishment from '@/pages/Replenishment';
import QCManagement from '@/pages/QCManagement';
import SIMManager from '@/pages/SIMManager';
import GuardianDashboard from '@/pages/GuardianDashboard';
import PostingTracker from '@/pages/PostingTracker';
import Shipping from '@/pages/Shipping';
import LaborManagement from '@/pages/LaborManagement';
import IntegrationHub from '@/pages/IntegrationHub';
import BarcodeScanner from '@/pages/BarcodeScanner';
import LocationBarcodeGenerator from '@/pages/LocationBarcodeGenerator';
import PutawayManagement from '@/pages/PutawayManagement';
import SerialTracking from '@/pages/SerialTracking';
import BatchPickCenter from '@/pages/BatchPickCenter';
import DockManagement from '@/pages/DockManagement';
import OzonSheetsHub from '@/pages/OzonSheetsHub';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-void">
        <div className="w-8 h-8 border-2 border-accent-sky border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inbound" element={<InboundReceiving />} />
        <Route path="inventory" element={<InventoryHub />} />
        <Route path="pick-pack" element={<PickPack />} />
        <Route path="returns" element={<Returns />} />
        <Route path="pdf-sequencer" element={<PDFSequencer />} />
        <Route path="auditor" element={<Auditor />} />
        <Route path="bulk-convert" element={<BulkConverter />} />
        <Route path="templates" element={<Templates />} />
        <Route path="memory" element={<Memory />} />
        <Route path="cycle-count" element={<CycleCount />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="replenishment" element={<Replenishment />} />
        <Route path="qc" element={<QCManagement />} />
        <Route path="sim-manager" element={<SIMManager />} />
        <Route path="guardian" element={<GuardianDashboard />} />
        <Route path="posting-tracker" element={<PostingTracker />} />
        <Route path="barcode-scanner" element={<BarcodeScanner />} />
        <Route path="barcode-generator" element={<LocationBarcodeGenerator />} />
        <Route path="shipping" element={<Shipping />} />
        <Route path="labor" element={<LaborManagement />} />
        <Route path="integrations" element={<IntegrationHub />} />
        <Route path="ozon-sheets" element={<OzonSheetsHub />} />
        <Route path="putaway" element={<PutawayManagement />} />
        <Route path="serial-tracking" element={<SerialTracking />} />
        <Route path="batch-pick" element={<BatchPickCenter />} />
        <Route path="dock" element={<DockManagement />} />
        <Route path="settings" element={<Settings />} />
        <Route path="users" element={<UserManagement />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedDatabase().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-accent-sky border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-secondary uppercase tracking-widest">Initializing WMS...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <CommandPalette />
      <OfflineIndicator />
      <InstallPrompt />
      <AppRoutes />
    </AuthProvider>
  );
}
