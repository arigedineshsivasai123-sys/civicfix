import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LandingPage } from './views/LandingPage';
import { CitizenDashboard } from './views/CitizenDashboard';
import { OfficerDashboard } from './views/OfficerDashboard';
import { ManagerDashboard } from './views/ManagerDashboard';
import { AdminDashboard } from './views/AdminDashboard';
import { SubmitGrievanceModal } from './components/SubmitGrievanceModal';
import { PublicTracker } from './components/PublicTracker';
import { CaseDetailModal } from './components/CaseDetailModal';
import { ReassignModal } from './components/ReassignModal';
import { DemoPersonaModal } from './components/DemoPersonaModal';
import { User, Grievance } from './types';
import { api, getStoredUser } from './api/client';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('portal');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('civicfix_demo_mode');
    return saved !== null ? saved === 'true' : true; // Default true for hackathon evaluation
  });

  // Modal states
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Grievance | null>(null);
  const [reassignCase, setReassignCase] = useState<Grievance | null>(null);
  const [trackInitialCaseId, setTrackInitialCaseId] = useState<string>('');

  // Toast / Status Message
  const [toast, setToast] = useState<{ type: 'info' | 'error' | 'success'; title: string; message: string } | null>(null);

  const showToast = (type: 'info' | 'error' | 'success', title: string, message: string) => {
    setToast({ type, title, message });
    setTimeout(() => {
      setToast(prev => (prev?.title === title ? null : prev));
    }, 6000);
  };

  const handleToggleDemoMode = (val: boolean) => {
    setIsDemoMode(val);
    localStorage.setItem('civicfix_demo_mode', String(val));
  };

  // Initialize Auth from existing token or default demo account
  useEffect(() => {
    const existing = getStoredUser();
    if (existing) {
      setCurrentUser(existing);
      api.getProfile().then(user => setCurrentUser(user)).catch(() => {});
    } else if (isDemoMode) {
      // Default to citizen demo account for seamless initial landing
      api.login('citizen@civicfix.gov', 'CivicFix2026!')
        .then(res => {
          setCurrentUser(res.user);
        })
        .catch(() => {});
    }
  }, []);

  const handleSelectCase = async (item: Grievance) => {
    try {
      const fullCase = await api.getGrievanceDetail(item.case_id);
      setSelectedCase(fullCase);
    } catch (err: any) {
      showToast('error', 'Case Detail Unavailable', err.message || 'Could not fetch case details.');
      setSelectedCase(item);
    }
  };

  // Direct case selection from notification with permission enforcement
  const handleSelectGrievanceById = async (caseId: string) => {
    try {
      const fullCase = await api.getGrievanceDetail(caseId);
      setSelectedCase(fullCase);
    } catch (err: any) {
      // If user lacks permission (e.g. 403), open public tracker instead and alert user
      if (err.message && (err.message.includes('permission') || err.message.includes('403') || err.message.includes('Access denied'))) {
        showToast(
          'info',
          'Private Details Restricted',
          `You do not have direct departmental permissions for ${caseId}. Opening public tracking status instead.`
        );
        setTrackInitialCaseId(caseId);
        setShowTrackModal(true);
      } else {
        showToast('error', 'Grievance Target Error', `Unable to open case ${caseId}: ${err.message}`);
      }
    }
  };

  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  const handleRefreshCurrentCase = async () => {
    if (!selectedCase) return;
    try {
      const refreshed = await api.getGrievanceDetail(selectedCase.case_id);
      setSelectedCase(refreshed);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDemoMode={isDemoMode}
        setIsDemoMode={handleToggleDemoMode}
        onOpenSubmitModal={() => setShowSubmitModal(true)}
        onOpenTrackModal={() => {
          setTrackInitialCaseId('');
          setShowTrackModal(true);
        }}
        onOpenDemoModal={() => setShowDemoModal(true)}
        onSelectGrievance={handleSelectGrievanceById}
        onAuthChange={(user) => setCurrentUser(user)}
        onNotificationMessage={(title, msg) => showToast('info', title, msg)}
      />

      {/* Floating Notification Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm p-4 rounded-2xl glass-dropdown border border-white/10 shadow-2xl animate-in slide-in-from-bottom-5 duration-200 text-left flex items-start gap-3">
          <div className="mt-0.5">
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Info className="w-4 h-4 text-cyan-400" />
            )}
          </div>
          <div className="flex-1 pr-2">
            <h5 className="text-xs font-bold text-slate-100">{toast.title}</h5>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full">
        {activeTab === 'portal' && (
          <LandingPage
            onOpenSubmit={() => setShowSubmitModal(true)}
            onOpenTrack={() => {
              setTrackInitialCaseId('');
              setShowTrackModal(true);
            }}
            onSelectCase={handleSelectCase}
          />
        )}

        {activeTab === 'citizen' && currentUser && (
          <CitizenDashboard
            currentUser={currentUser}
            onOpenSubmit={() => setShowSubmitModal(true)}
            onSelectCase={handleSelectCase}
            refreshKey={dataRefreshKey}
          />
        )}

        {activeTab === 'officer' && currentUser && (
          <OfficerDashboard
            currentUser={currentUser}
            onSelectCase={handleSelectCase}
            refreshKey={dataRefreshKey}
          />
        )}

        {activeTab === 'manager' && currentUser && (
          <ManagerDashboard
            currentUser={currentUser}
            onSelectCase={handleSelectCase}
            onOpenReassign={(c) => setReassignCase(c)}
            refreshKey={dataRefreshKey}
          />
        )}

        {activeTab === 'admin' && currentUser && (
          <AdminDashboard
            currentUser={currentUser}
          />
        )}

        {activeTab === 'analytics' && currentUser && (
          <AdminDashboard
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Modals */}
      <SubmitGrievanceModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onSuccess={(caseId) => {
          setDataRefreshKey(k => k + 1);
          api.trackPublicGrievance(caseId).then(c => setSelectedCase(c)).catch(() => {});
        }}
      />

      <PublicTracker
        isOpen={showTrackModal}
        initialCaseId={trackInitialCaseId}
        onClose={() => setShowTrackModal(false)}
      />

      {selectedCase && (
        <CaseDetailModal
          isOpen={!!selectedCase}
          caseItem={selectedCase}
          currentUser={currentUser}
          onClose={() => setSelectedCase(null)}
          onRefresh={() => {
            handleRefreshCurrentCase();
            setDataRefreshKey(k => k + 1);
          }}
          onOpenReassign={(c) => {
            setReassignCase(c);
          }}
        />
      )}

      {reassignCase && (
        <ReassignModal
          isOpen={!!reassignCase}
          caseItem={reassignCase}
          onClose={() => setReassignCase(null)}
          onSuccess={(msg) => {
            setDataRefreshKey(k => k + 1);
            handleRefreshCurrentCase();
            if (msg) showToast('success', 'Case Reassigned', msg);
          }}
        />
      )}

      {/* Dedicated Demo Persona Switcher Modal */}
      <DemoPersonaModal
        isOpen={showDemoModal}
        onClose={() => setShowDemoModal(false)}
        currentUser={currentUser}
        onPersonaAuthenticated={(user, roleTab) => {
          setCurrentUser(user);
          setActiveTab(roleTab);
          showToast('success', 'Authenticated Persona', `Signed in as ${user.name} (${user.role}).`);
        }}
        onExitDemoMode={async () => {
          await api.logout();
          setCurrentUser(null);
          setActiveTab('portal');
          setShowDemoModal(false);
          showToast('info', 'Signed Out', 'Exited demo mode.');
        }}
      />
    </div>
  );
};

export default App;
