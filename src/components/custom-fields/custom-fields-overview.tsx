"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";
import {
  deleteCustomFieldDefinitionAction,
  moveCustomFieldDefinitionAction,
} from "@/app/(dashboard)/custom-fields/actions";
import { Button } from "@/components/ui/button";
import type { CustomFieldEntity } from "@/lib/custom-fields";

export interface DefinitionRow {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: string;
  required: boolean;
}

const ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  property: "Properties",
  lease: "Leases",
  tenant: "Tenants",
};

/**
 * The portfolio's custom-field definitions in one place, so an owner can see
 * (and prune) everything they've defined without hunting through records.
 * Adding a field happens in context, on the record itself.
 */
export function CustomFieldsOverview({
  definitions,
}: {
  definitions: DefinitionRow[];
}) {
  const router = useRouter();
  const entities: CustomFieldEntity[] = ["property", "lease", "tenant"];

  if (definitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No custom fields yet. Open a property, lease or tenant and use{" "}
        <strong>Add field</strong> — everyone in this portfolio gets it
        immediately.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {entities.map((entity) => {
        const rows = definitions.filter((d) => d.entity === entity);
        if (rows.length === 0) return null;
        return (
          <div key={entity}>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {ENTITY_LABELS[entity]}
            </p>
            <ul className="space-y-2">
              {rows.map((def, index) => (
                <li
                  key={def.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{def.label}</span>
                    {def.required && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        required
                      </span>
                    )}
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {def.type} · {def.key}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <ReorderButton
                      definitionId={def.id}
                      direction="up"
                      disabled={index === 0}
                    />
                    <ReorderButton
                      definitionId={def.id}
                      direction="down"
                      disabled={index === rows.length - 1}
                    />
                    <DeleteButton
                      definitionId={def.id}
                      label={def.label}
                      onDone={() => router.refresh()}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ReorderButton({
  definitionId,
  direction,
  disabled,
}: {
  definitionId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled || pending}
      aria-label={direction === "up" ? "Move up" : "Move down"}
      onClick={() =>
        startTransition(async () => {
          await moveCustomFieldDefinitionAction(definitionId, direction);
          router.refresh();
        })
      }
    >
      {direction === "up" ? <ArrowUpIcon /> : <ArrowDownIcon />}
    </Button>
  );
}

function DeleteButton({
  definitionId,
  label,
  onDone,
}: {
  definitionId: string;
  label: string;
  onDone: () => void;
}) {
  return (
    <form
      action={async () => {
        await deleteCustomFieldDefinitionAction(definitionId);
        onDone();
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        type="submit"
        aria-label={`Delete ${label}`}
        title={`Delete ${label}. Values already entered are kept, in case you add it back.`}
      >
        <Trash2Icon />
      </Button>
    </form>
  );
}