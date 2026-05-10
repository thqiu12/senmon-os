import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Friendly placeholder shown instead of an empty list.
 * Default icon is a generic "inbox" glyph; override for context.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={`bg-white rounded-xl border border-gray-200 px-6 py-12 text-center ${className}`}
    >
      <div className="mx-auto w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-2xl mb-4 text-gray-400">
        {icon ?? "📭"}
      </div>
      <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
