export function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'danger' | 'amber' | 'success';
}) {
  const toneClasses: Record<string, string> = {
    default: 'text-navy-900',
    danger: 'text-danger-500',
    amber: 'text-amber-500',
    success: 'text-success-500',
  };

  return (
    <div className="card px-4 py-3.5">
      <p className="label mb-1.5">{label}</p>
      <p className={`font-display text-2xl font-semibold ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}
