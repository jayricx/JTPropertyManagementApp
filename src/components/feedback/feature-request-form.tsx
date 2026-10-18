"use client";

import { useActionState, useState } from "react";
import { LightbulbIcon } from "lucide-react";
import {
  createFeatureRequestAction,
  type ActionState,
} from "@/app/(dashboard)/feedback/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { FEATURE_REQUEST_CATEGORIES } from "@/lib/feature-requests";

/**
 * Ask for something that doesn't exist yet. The prompt asks for the problem
 * rather than the solution, because "I want a button that does X" is much
 * harder to triage than "here's what I was trying to do and where it broke".
 */
export function FeatureRequestForm({ openSlots }: { openSlots: number }) {
  const [category, setCategory] = useState("other");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createFeatureRequestAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LightbulbIcon className="size-4" />
          Share an idea
        </CardTitle>
        <CardDescription>
          Tell us what you were trying to do and where it got in the way. We
          read every one, and we&apos;ll email you when its status changes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {openSlots <= 0 ? (
          <p className="text-sm text-muted-foreground">
            You have three requests open. We&apos;ll come back to those first —
            once one is closed you can send another.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="request-category">Where is it about?</Label>
              <Select
                items={FEATURE_REQUEST_CATEGORIES.map((c) => ({
                  value: c.value,
                  label: c.label,
                }))}
                value={category}
                onValueChange={(v) => setCategory(v ?? "other")}
              >
                <SelectTrigger className="w-full" id="request-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_REQUEST_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Base UI's Select doesn't post a form value itself. */}
              <input type="hidden" name="category" value={category} readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-title">Short title</Label>
              <Input
                id="request-title"
                name="title"
                required
                maxLength={200}
                placeholder="e.g. Let me mark a unit as rented mid-month"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-details">
                What were you trying to do?
              </Label>
              <Textarea
                id="request-details"
                name="details"
                required
                rows={5}
                maxLength={2000}
                placeholder="A tenant moved in on the 15th. Right now I'd have to create a lease and manually edit the statement to make the prorated rent come out right — is there a way to do that?"
              />
              <p className="text-xs text-muted-foreground">
                Two or three sentences is plenty. Screenshots aren&apos;t
                needed — describe the step that didn&apos;t exist for you.
              </p>
            </div>

            {state?.error && (
              <p className="text-sm font-medium text-destructive">
                {state.error}
              </p>
            )}

            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}