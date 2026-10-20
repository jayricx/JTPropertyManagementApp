"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { contactMessages, users } from "@/db/schema";

export async function markContactRepliedAction(id: string): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  const [account] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!account?.isAdmin) return { ok: false };

  await db
    .update(contactMessages)
    .set({ status: "replied", repliedAt: new Date() })
    .where(eq(contactMessages.id, id));
  revalidatePath("/admin/contact");
  return { ok: true };
}