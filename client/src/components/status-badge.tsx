import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VoucherStatus, BatchStatus } from "@shared/schema";

interface StatusBadgeProps {
  status: VoucherStatus | BatchStatus | string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  unposted: {
    label: "Unposted",
    className: "status-unposted",
  },
  posted: {
    label: "Posted",
    className: "status-posted",
  },
  deposited: {
    label: "Deposited",
    className: "status-deposited",
  },
  cancelled: {
    label: "Cancelled",
    className: "status-cancelled",
  },
  completed: {
    label: "Completed",
    className: "status-deposited",
  },
  pending: {
    label: "Pending",
    className: "status-unposted",
  },
  sent: {
    label: "Posted",
    className: "status-posted",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="secondary"
      className={cn("font-medium no-default-hover-elevate no-default-active-elevate", config.className, className)}
      data-testid={`status-badge-${status}`}
    >
      {config.label}
    </Badge>
  );
}
