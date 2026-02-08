export interface ToastData {
  id: string;
  type: "success" | "error" | "warning";
  message: string;
}

interface Props {
  data: ToastData;
  onDismiss: (id: string) => void;
}

const styles: Record<string, string> = {
  success: "border-accent text-accent shadow-[0_0_15px_rgba(0,255,136,0.3)]",
  error: "border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]",
  warning: "border-yellow-500 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]",
};

const icons: Record<string, string> = {
  success: "\u2713",
  error: "\u2717",
  warning: "\u26A0",
};

export default function Toast({ data, onDismiss }: Props) {
  return (
    <div
      className={`bg-surface border-2 px-4 py-3 flex items-center gap-3 text-sm font-mono cursor-pointer animate-slideUp ${styles[data.type]}`}
      onClick={() => onDismiss(data.id)}
    >
      <span className="text-lg">{icons[data.type]}</span>
      <span>{data.message}</span>
    </div>
  );
}
