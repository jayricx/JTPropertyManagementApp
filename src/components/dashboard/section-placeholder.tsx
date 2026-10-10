import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface SectionPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function SectionPlaceholder({ icon: Icon, title, description }: SectionPlaceholderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Full CRUD for this section ships in the next milestone. The database
          table is already defined in the schema, so the API can be built on
          top of it directly.
        </p>
      </CardContent>
    </Card>
  );
}
