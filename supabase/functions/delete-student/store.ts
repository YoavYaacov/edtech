import type { Footprint, Store } from "./handler.ts";

// deno-lint-ignore no-explicit-any
export function createStore(userClient: any, adminClient: any): Store {
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
    async studentName(studentId: string) {
      const { data } = await adminClient.from("profiles").select("full_name").eq("id", studentId).maybeSingle();
      return data?.full_name ?? null;
    },
    async footprint(teacherId: string, studentId: string): Promise<Footprint> {
      const { data, error } = await adminClient.rpc("admin_student_footprint", { p_teacher_id: teacherId, p_student_id: studentId });
      if (error) throw new Error("footprint_failed");
      return data as Footprint;
    },
    async deleteUser(userId: string) {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      return !error;
    },
  };
}
