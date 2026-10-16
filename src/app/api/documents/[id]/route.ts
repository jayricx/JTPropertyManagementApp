import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { documents, maintenanceRequests, tenants } from "@/db/schema";
import { canAccessLease, canAccessProperty, canAccessUnit } from "@/lib/access";
import {
  attachmentKind,
  INLINE_IMAGE_TYPES,
  sanitizeFileName,
} from "@/lib/attachments";
import { isUuid } from "@/lib/utils";

/**
 * Download (or inline-render) an attachment. Bytes live in Postgres today
 * (see `src/lib/attachments.ts`); once objects move to R2/S3 the `data`
 * column goes null and `url` carries the object key.
 *
 * Images are served inline so they can be used as thumbnails; everything
 * else is always an attachment, so an uploaded file can never execute on
 * the app's origin.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return new Response("Not found", { status: 404 });

  // Whoever can reach the parent record may fetch the file; uploader-only
  // rows (no lease/unit/property yet) stay private to their author.
  let allowed = doc.userId === userId;
  if (doc.maintenanceRequestId) {
    // The tenant who reported the issue can always see what they attached,
    // even after their lease (and with it the unit) has moved on.
    const [link] = await db
      .select({ accountId: tenants.accountId })
      .from(maintenanceRequests)
      .innerJoin(tenants, eq(maintenanceRequests.tenantId, tenants.id))
      .where(eq(maintenanceRequests.id, doc.maintenanceRequestId))
      .limit(1);
    allowed = allowed || (link?.accountId === userId && link.accountId !== null);
    if (!allowed && doc.unitId) allowed = await canAccessUnit(userId, doc.unitId);
  } else if (doc.leaseId) {
    allowed = await canAccessLease(userId, doc.leaseId);
  } else if (doc.unitId) {
    allowed = await canAccessUnit(userId, doc.unitId);
  } else if (doc.propertyId) {
    allowed = await canAccessProperty(userId, doc.propertyId);
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });

  // Object-storage rows: hand off to wherever the file lives now.
  if (!doc.data) {
    if (doc.url.startsWith("/api/documents/")) {
      return new Response("File content is unavailable", { status: 410 });
    }
    return Response.redirect(doc.url, 302);
  }

  const name = sanitizeFileName(doc.name);
  // RFC 5987 keeps non-ASCII names intact for the download header.
  const encoded = encodeURIComponent(name).replace(/['()]/g, escape);
  const inline =
    INLINE_IMAGE_TYPES.has(doc.type ?? "") &&
    new URL(request.url).searchParams.get("download") !== "1";
  const bytes = Buffer.from(doc.data, "base64");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.type ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "X-Attachment-Kind": attachmentKind(doc.type),
      "Cache-Control": "private, max-age=300",
    },
  });
}