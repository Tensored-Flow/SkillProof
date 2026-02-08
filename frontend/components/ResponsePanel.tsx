import { useApp } from "@/pages/_app";
import { useState } from "react";

export default function ResponsePanel() {
  const { responseData } = useApp();
  const [copied, setCopied] = useState(false);

  const json = responseData
    ? JSON.stringify(responseData, null, 2)
    : "// No data yet\n// Perform an action to see the response";

  function copy() {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-widest text-muted">
          Response Data
        </h3>
        <button
          onClick={copy}
          className="text-xs uppercase tracking-widest px-2 py-1 border border-border text-muted hover:text-accent hover:border-accent transition-colors"
        >
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>
      <pre className="flex-1 bg-bg border-2 border-border p-4 text-xs text-accent overflow-auto whitespace-pre-wrap break-all">
        {json}
      </pre>
    </div>
  );
}
