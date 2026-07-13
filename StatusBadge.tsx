interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  'Pending': 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
  'Shipped': 'bg-accent-green/20 text-accent-green border-accent-green/30',
  'Returned': 'bg-accent-red/20 text-accent-red border-accent-red/30',
  'Cancelled': 'bg-white/10 text-text-secondary border-white/10',
  'In Stock': 'bg-accent-green/20 text-accent-green border-accent-green/30',
  'Low Stock': 'bg-accent-red/20 text-accent-red border-accent-red/30',
  'Online': 'bg-accent-green/20 text-accent-green border-accent-green/30',
  'Offline': 'bg-accent-red/20 text-accent-red border-accent-red/30',
  'QCHold': 'bg-accent-red/20 text-accent-red border-accent-red/30',
  'CrossDock': 'bg-accent-sky/20 text-accent-sky border-accent-sky/30',
  'hold': 'bg-accent-red/20 text-accent-red border-accent-red/30',
  'released': 'bg-accent-green/20 text-accent-green border-accent-green/30',
  'rejected': 'bg-white/10 text-text-secondary border-white/10',
  'passed': 'bg-accent-green/20 text-accent-green border-accent-green/30',
  'failed': 'bg-accent-red/20 text-accent-red border-accent-red/30',
  'normal': 'bg-white/10 text-text-secondary border-white/10',
  'high': 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
  'urgent': 'bg-accent-red/20 text-accent-red border-accent-red/30',
  'critical': 'bg-accent-red/20 text-accent-red border-accent-red/30',
  'warning': 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
  'open': 'bg-accent-green/20 text-accent-green border-accent-green/30',
  'picking': 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
  'completed': 'bg-accent-green/20 text-accent-green border-accent-green/30',
  'in_progress': 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
  'out_of_stock': 'bg-accent-red/20 text-accent-red border-accent-red/30',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] || 'bg-white/10 text-text-secondary border-white/10';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border ${style}`}>
      {status}
    </span>
  );
}
