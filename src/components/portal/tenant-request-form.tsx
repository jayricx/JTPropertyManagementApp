"use client";

import { useState, useTransition, type FormEvent } from "react";
import { WrenchIcon } from "lucide-react";
import { createTenantRequestAction } from "@/app/(tenant)/portal/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  maintenancePriorities,
  maintenancePriorityLabels,
} from "@/lib/validations";

export function TenantRequestForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("description", description);
      formData.set("priority", priority);
      const result = await createTenantRequestAction(null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      // The portal revalidates — clear the form for the next report.
      setTitle("");
      setDescription("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="request-title"
            className="text-sm font-medium leading-none"
          >
            What&apos;s the problem?
          </label>
          <Input
            id="request-title"
            placeholder="e.g. Leaking kitchen faucet"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={255}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="request-description"
            className="text-sm font-medium leading-none"
          >
            Details{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="request-description"
            placeholder="Describe where it is and when it happens…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium leading-none">Priority</label>
          <Select
            items={maintenancePriorities.map((p) => ({
              value: p,
              label: maintenancePriorityLabels[p],
            }))}
            value={priority}
            onValueChange={(v) => setPriority(v ?? "medium")}
          >
            <SelectTrigger className="w-full" aria-label="Priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {maintenancePriorities.map((p) => (
                <SelectItem key={p} value={p}>
                  {maintenancePriorityLabels[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            <WrenchIcon />
            {pending ? "Sending…" : "Report issue"}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
