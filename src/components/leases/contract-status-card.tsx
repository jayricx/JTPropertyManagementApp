import Link from "next/link";
import { ArrowRightIcon, FileSignatureIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type ContractRecord, contractStatusLabels } from "@/lib/contracts";

/**
 * The entry point to the contract flow, sitting above the signatures card so
 * the two read as one story: a contract is what gets signed, and this says
 * where that document lives.
 */
export function ContractStatusCard({
  leaseId,
  open,
  signed,
}: {
  leaseId: string;
  /** A contract still in play — draft, sent, or opened. */
  open: ContractRecord | null;
  /** The newest contract both parties have signed. */
  signed: ContractRecord | null;
}) {
  const shown = open ?? signed;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileSignatureIcon className="size-5" />
            Contract
          </CardTitle>
          <CardDescription>
            {open
              ? `Version ${open.version} — ${contractStatusLabels[open.status].toLowerCase()}.`
              : signed
                ? `Version ${signed!.version} was signed by both parties.`
                : "A written agreement your tenant can read and sign, with the terms frozen at the moment it's sent."}
          </CardDescription>
        </div>
        {shown && (
          <Badge variant={shown.status === "completed" ? "default" : "secondary"}>
            v{shown.version}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <Button
          variant={open ? "outline" : "default"}
          size="sm"
          render={<Link href={`/leases/${leaseId}/contract`} />}
        >
          {open ? "Open contract" : signed ? "View signed contract" : "Prepare contract"}
          <ArrowRightIcon />
        </Button>
      </CardContent>
    </Card>
  );
}