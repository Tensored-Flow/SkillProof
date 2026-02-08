import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useState, useCallback, createContext, useContext } from "react";
import TopBar from "@/components/TopBar";
import ResponsePanel from "@/components/ResponsePanel";
import Toast, { ToastData } from "@/components/Toast";

interface AppContextType {
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  wallet: string | null;
  setWallet: (v: string | null) => void;
  responseData: unknown;
  setResponseData: (v: unknown) => void;
  showToast: (toast: Omit<ToastData, "id">) => void;
}

export const AppContext = createContext<AppContextType>({} as AppContextType);
export const useApp = () => useContext(AppContext);

export default function App({ Component, pageProps }: AppProps) {
  const [demoMode, setDemoMode] = useState(true);
  const [wallet, setWallet] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<unknown>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const showToast = useCallback((toast: Omit<ToastData, "id">) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <AppContext.Provider
      value={{
        demoMode,
        setDemoMode,
        wallet,
        setWallet,
        responseData,
        setResponseData,
        showToast,
      }}
    >
      <div className="min-h-screen bg-bg font-mono flex flex-col">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 lg:p-8">
            <Component {...pageProps} />
          </main>
          <aside className="hidden lg:block w-[380px] border-l-2 border-border overflow-y-auto">
            <ResponsePanel />
          </aside>
        </div>
      </div>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} data={t} onDismiss={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))} />
        ))}
      </div>
    </AppContext.Provider>
  );
}
