import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABELS,
  type FeatureRequestStatus,
} from "@/lib/feature-requests";

/** Status as a pill. Plain words — "Not planned" rather than "declined". */
export function RequestStatusBadge({
  status,
}: {
  status: FeatureRequestStatus;
}) {
  const variant =
    status === "shipped"
      ? "default"
      : status === "planned"
        ? "secondary"
        : status === "declined"
          ? "outline"
          : "outline";

  return <Badge variant={variant}>{STATUS_LABELS[status]}</Badge>;
}