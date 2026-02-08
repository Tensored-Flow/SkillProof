import Link from "next/link";
import { useRouter } from "next/router";
import { useApp } from "@/pages/_app";

const COSTON2_CHAIN_ID = "0x72";

export default function TopBar() {
  const { demoMode, setDemoMode, wallet, setWallet, showToast } = useApp();
  const router = useRouter();

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/issuer", label: "Issuer" },
    { href: "/user", label: "User" },
    { href: "/verify", label: "Verify" },
  ];

  async function connectWallet() {
    const eth = (window as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth) {
      showToast({ type: "error", message: "MetaMask not found" });
      return;
    }
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setWallet(accounts[0]);

      // Check network
      const chainId = (await eth.request({ method: "eth_chainId" })) as string;
      if (chainId !== COSTON2_CHAIN_ID) {
        showToast({ type: "warning", message: "Please switch to Flare Coston2" });
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: COSTON2_CHAIN_ID }],
          });
        } catch {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: COSTON2_CHAIN_ID,
                chainName: "Flare Coston2",
                nativeCurrency: { name: "C2FLR", symbol: "C2FLR", decimals: 18 },
                rpcUrls: ["https://coston2-api.flare.network/ext/C/rpc"],
                blockExplorerUrls: ["https://coston2-explorer.flare.network"],
              },
            ],
          });
        }
      }
      showToast({ type: "success", message: "Wallet connected" });
    } catch {
      showToast({ type: "error", message: "Connection failed" });
    }
  }

  return (
    <header className="border-b-2 border-border bg-bg px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-accent font-bold text-lg tracking-widest uppercase hover:text-white transition-colors">
          SkillProof
        </Link>
        <nav className="flex gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-xs uppercase tracking-widest px-3 py-1.5 border-2 transition-colors ${
                router.pathname === item.href
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-white hover:border-border"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* Network badge */}
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          Flare Coston2
        </div>

        {/* Demo mode toggle */}
        <button
          onClick={() => setDemoMode(!demoMode)}
          className={`text-xs uppercase tracking-widest px-3 py-1.5 border-2 transition-colors ${
            demoMode
              ? "border-pink text-pink"
              : "border-accent text-accent"
          }`}
        >
          {demoMode ? "Demo Mode" : "Live Mode"}
        </button>

        {/* Wallet button */}
        <button
          onClick={wallet ? () => setWallet(null) : connectWallet}
          className="text-xs uppercase tracking-widest px-3 py-1.5 border-2 border-border text-white hover:border-accent transition-colors"
        >
          {wallet
            ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
            : "Connect Wallet"}
        </button>
      </div>
    </header>
  );
}
