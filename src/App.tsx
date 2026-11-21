import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DataProvider } from './state/data';
import { UIProvider } from './state/ui';
import { ConfirmHost, Splash, Toaster } from './ui';
import { Layout } from './features/shell/Layout';
import { PinGate } from './features/shell/PinGate';
import { TxnModalHost } from './features/txn/TxnModalHost';
import { Dashboard } from './features/dashboard/Dashboard';
import { DayCloseList } from './features/dayclose/DayCloseList';
import { DayCloseForm } from './features/dayclose/DayCloseForm';
import { TxnList } from './features/txn/TxnList';
import { Contacts } from './features/contacts/Contacts';
import { ContactDetail } from './features/contacts/ContactDetail';
import { MethodDetail } from './features/contacts/MethodDetail';
import { Accounts } from './features/accounts/Accounts';
import { AccountDetail } from './features/accounts/AccountDetail';
import { StatementImport } from './features/accounts/StatementImport';
import { Reports } from './features/reports/Reports';
import { Settings } from './features/settings/Settings';
import { MobileMenu } from './features/shell/MobileMenu';
import { UpdateBanner } from './features/shell/UpdateBanner';

export default function App() {
  return (
    <UIProvider>
      <DataProvider fallback={<Splash />}>
        <PinGate>
          <HashRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/gun-sonu" element={<DayCloseList />} />
                <Route path="/gun-sonu/:date" element={<DayCloseForm />} />
                <Route path="/hareketler" element={<TxnList />} />
                <Route path="/cariler" element={<Contacts />} />
                <Route path="/cariler/kisi/:id" element={<ContactDetail />} />
                <Route path="/cariler/odeme-tipi/:id" element={<MethodDetail />} />
                <Route path="/hesaplar" element={<Accounts />} />
                <Route path="/hesaplar/:id" element={<AccountDetail />} />
                <Route path="/hesaplar/:id/ekstre" element={<StatementImport />} />
                <Route path="/raporlar" element={<Reports />} />
                <Route path="/ayarlar" element={<Settings />} />
                <Route path="/menu" element={<MobileMenu />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
            <TxnModalHost />
          </HashRouter>
        </PinGate>
        <UpdateBanner />
        <ConfirmHost />
        <Toaster />
      </DataProvider>
    </UIProvider>
  );
}
