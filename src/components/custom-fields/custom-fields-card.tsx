"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import {
  createCustomFieldDefinitionAction,
  saveCustomFieldValuesAction,
  type ActionState,
} from "@/app/(dashboard)/custom-fields/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOM_FIELD_TYPES,
  customFieldInputName,
  type CustomFieldDefinition,
  type CustomFieldEntity,
  type CustomFieldType,
} from "@/lib/custom-fields";

const ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  property: "property",
  lease: "lease",
  tenant: "tenant",
};

/** Turn "Gate code" into `gate_code` — editable, but a sane starting point. */
function suggestKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

interface CustomFieldsCardProps {
  entity: CustomFieldEntity;
  targetId: string;
  definitions: CustomFieldDefinition[];
  values: Record<string, string>;
  /** Owner or co-owner: the values are editable. */
  canEdit: boolean;
  /** Portfolio owner only: may add/rename/remove field definitions. */
  canDefine: boolean;
}

/**
 * The custom fields of one record. Values sit right on the page the owner is
 * already on (property, lease, tenant) rather than behind a settings maze.
 * Adding a *definition* is an owner-only affordance; a co-owner sees the same
 * fields and can fill them in.
 */
export function CustomFieldsCard({
  entity,
  targetId,
  definitions,
  values,
  canEdit,
  canDefine,
}: CustomFieldsCardProps) {
  // Nothing defined and nobody who could define: render nothing at all rather
  // than an empty card a solo owner would have to understand.
  if (definitions.length === 0 && !canDefine) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Custom fields</CardTitle>
            <CardDescription>
              {definitions.length === 0
                ? `Extra details you keep on every ${ENTITY_LABELS[entity]}.`
                : `${definitions.length} field${definitions.length === 1 ? "" : "s"} shared with everyone in this portfolio.`}
            </CardDescription>
          </div>
          {canDefine && (
            <AddFieldDialog entity={entity} anchorId={targetId} />
          )}
        </div>
      </CardHeader>
      {definitions.length > 0 && (
        <CardContent>
          {canEdit ? (
            <CustomFieldValuesForm
              entity={entity}
              targetId={targetId}
              definitions={definitions}
              values={values}
            />
          ) : (
            <CustomFieldValuesReadOnly
              definitions={definitions}
              values={values}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function CustomFieldValuesForm({
  entity,
  targetId,
  definitions,
  values,
}: {
  entity: CustomFieldEntity;
  targetId: string;
  definitions: CustomFieldDefinition[];
  values: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveCustomFieldValuesAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="targetId" value={targetId} />

      {definitions.map((def) => (
        <FieldInput key={def.id} def={def} value={values[def.key] ?? ""} />
      ))}

      {state?.error && (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save fields"}
      </Button>
    </form>
  );
}

function CustomFieldValuesReadOnly({
  definitions,
  values,
}: {
  definitions: CustomFieldDefinition[];
  values: Record<string, string>;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {definitions.map((def) => (
        <div key={def.id}>
          <dt className="text-xs text-muted-foreground">{def.label}</dt>
          <dd className="text-sm">
            {formatValue(def, values[def.key] ?? "") || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatValue(def: CustomFieldDefinition, value: string): string {
  if (!value) return "";
  if (def.type === "checkbox") return value === "true" ? "Yes" : "No";
  return value;
}

/** One input, rendered from the definition's type. */
function FieldInput({
  def,
  value,
}: {
  def: CustomFieldDefinition;
  value: string;
}) {
  const name = customFieldInputName(def.key);
  const id = `cf-${def.key}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {def.label}
        {def.required && def.type !== "checkbox" && (
          <span className="text-destructive"> *</span>
        )}
      </Label>

      {def.type === "textarea" && (
        <Textarea id={id} name={name} rows={3} defaultValue={value} />
      )}

      {def.type === "select" && (
        <SelectField def={def} value={value} name={name} id={id} />
      )}

      {def.type === "checkbox" && (
        <input
          id={id}
          type="checkbox"
          name={name}
          value="true"
          defaultChecked={value === "true"}
          className="size-4 rounded border-input"
        />
      )}

      {(def.type === "text" ||
        def.type === "number" ||
        def.type === "date" ||
        def.type === "email" ||
        def.type === "phone") && (
        <Input
          id={id}
          name={name}
          defaultValue={value}
          type={
            def.type === "number"
              ? "number"
              : def.type === "date"
                ? "date"
                : def.type === "email"
                  ? "email"
                  : "text"
          }
          inputMode={
            def.type === "phone" ? "tel" : def.type === "number" ? "decimal" : undefined
          }
        />
      )}
    </div>
  );
}

/**
 * Base UI's Select doesn't post a form value, so the choice is held in state
 * and mirrored into a hidden input that the submit actually reads.
 */
function SelectField({
  def,
  value,
  name,
  id,
}: {
  def: CustomFieldDefinition;
  value: string;
  name: string;
  id: string;
}) {
  const [selected, setSelected] = useState(value);

  return (
    <>
      <input type="hidden" name={name} value={selected} readOnly />
      <Select
        items={def.options.map((o) => ({ value: o, label: o }))}
        value={selected || null}
        onValueChange={(v) => setSelected(v ?? "")}
      >
        <SelectTrigger className="w-full" id={id}>
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectContent>
          {def.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

/** Owner-only: add a definition to the portfolio for this entity. */
function AddFieldDialog({
  entity,
  anchorId,
}: {
  entity: CustomFieldEntity;
  anchorId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCustomFieldDefinitionAction,
    null,
  );

  function close() {
    setOpen(false);
    setLabel("");
    setKey("");
    setType("text");
    setRequired(false);
    setOptions("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PlusIcon />
        Add field
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a custom field</DialogTitle>
          <DialogDescription>
            It appears on every {ENTITY_LABELS[entity]} in this portfolio —
            yours and your co-owners&apos;.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="entity" value={entity} />
          <input type="hidden" name="anchorId" value={anchorId} />

          <div className="space-y-2">
            <Label htmlFor="cf-label">Label</Label>
            <Input
              id="cf-label"
              name="label"
              placeholder="Gate code"
              required
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!key) setKey(suggestKey(e.target.value));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-key">Storage key</Label>
            <Input
              id="cf-key"
              name="key"
              placeholder="gate_code"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers and underscores. It never changes once
              saved, so your data stays attached.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-type">Field type</Label>
            <Select
              items={CUSTOM_FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              value={type}
              onValueChange={(v) => setType((v ?? "text") as CustomFieldType)}
            >
              <input type="hidden" name="type" value={type} readOnly />
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "select" && (
            <div className="space-y-2">
              <Label htmlFor="cf-options">Choices</Label>
              <Input
                id="cf-options"
                name="options"
                placeholder="Yes, No, Maybe"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma separated.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="required"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Required
          </label>

          {state?.error && (
            <p className="text-sm font-medium text-destructive">{state.error}</p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}