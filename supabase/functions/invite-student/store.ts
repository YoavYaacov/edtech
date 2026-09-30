// Supabase-backed Store for invite-student. The service role key never leaves the Edge Function runtime.
import type { AuthUserState, ProvisionResult, Store } from "./handler.ts";

// deno-lint-ignore no-explicit-any
export function createStore(userClient: any, adminClient: any, anonClient: any): Store {
  return {
    async authenticate() {
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) return null;
      return { id: data.user.id };
    },

    async getProfile(userId: string) {
      const { data, error } = await adminClient.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (error || !data) return null;
      return { role: data.role ?? null };
    },

    async getOwnCourse(courseId: string, ownerId: string) {
      const { data, error } = await adminClient.from("courses").select("id, course_languages(programming_language)")
        .eq("id", courseId).eq("owner_id", ownerId).eq("is_archived", false).maybeSingle();
      if (error || !data) return null;
      return { id: data.id, languages: (data.course_languages ?? []).map((l: { programming_language: string }) => l.programming_language) };
    },

    async findAuthUser(email: string, teacherId: string): Promise<AuthUserState | null> {
      const { data, error } = await adminClient.rpc("admin_find_auth_user", { p_email: email, p_teacher_id: teacherId });
      if (error) throw new Error("lookup_failed");
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },

    async inviteUser(email: string, fullName: string, redirectTo: string) {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo });
      if (error || !data?.user) {
        const msg = (error?.message ?? "").toLowerCase();
        const code = error?.code ?? "";
        if (code === "email_exists" || msg.includes("already")) return { ok: false as const, kind: "exists" as const };
        return { ok: false as const, kind: "failed" as const };
      }
      return { ok: true as const, userId: data.user.id as string };
    },

    async sendRecovery(email: string, redirectTo: string) {
      const { error } = await anonClient.auth.resetPasswordForEmail(email, { redirectTo });
      return !error;
    },

    async provision(a): Promise<ProvisionResult> {
      const { error } = await adminClient.rpc("admin_provision_student", {
        p_teacher_id: a.teacherId, p_student_id: a.studentId, p_full_name: a.fullName,
        p_course_id: a.courseId, p_create_profile: a.createProfile, p_language: a.language,
      });
      if (!error) return { ok: true };
      // 23514 / 23503 / P0002 come from the enrollment / course side
      const enroll = a.courseId !== null && ["23514", "23503", "P0002"].includes(error.code ?? "");
      return { ok: false, code: enroll ? "enroll" : "link" };
    },

    async deleteUser(userId: string) {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      return !error;
    },
  };
}
