import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = process.env.REACT_APP_SUPABASE_URL      || "";
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── LOGIN — via fonction SQL sécurisée (bcrypt côté Supabase) ───────────────
export async function loginUser(login, password) {
  const cleanLogin = (login || "").trim().toLowerCase();
  // Appelle la fonction PostgreSQL login_user() qui gère bcrypt + migration
  const { data, error } = await supabase
    .rpc("login_user", { p_email: cleanLogin, p_password: password });

  if (error || !data || data.length === 0) {
    // Fallback comparaison directe (avant migration SQL), insensible à la casse
    const { data: d2, error: e2 } = await supabase
      .from("users")
      .select("*")
      .ilike("email", cleanLogin)
      .eq("password", password)
      .single();
    if (e2 || !d2) return null;
    if (d2.archived === true) return null;
    return d2;
  }
  return data[0];
}

// ─── USERS ────────────────────────────────────────────────────────────────────
export async function fetchUsers() {
  const { data, error } = await supabase.from("users").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function createUser(user) {
  const { data, error } = await supabase.from("users").insert([user]).select().single();
  if (error) throw error;
  return data;
}

export async function updateUser(userId, updates) {
  const { data, error } = await supabase.from("users").update(updates).eq("id", userId).select().single();
  if (error) throw error;
  return data;
}

export async function updateUserSolde(userId, solde) {
  const { error } = await supabase.from("users").update({ solde_conges: solde }).eq("id", userId);
  if (error) throw error;
}

// ─── REQUESTS ─────────────────────────────────────────────────────────────────
export async function fetchRequests() {
  const { data, error } = await supabase
    .from("requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createRequest(req) {
  const { data, error } = await supabase.from("requests").insert([req]).select().single();
  if (error) throw error;
  return data;
}

export async function updateRequest(id, status, comment, absenceMotif = "") {
  const { data, error } = await supabase
    .from("requests")
    .update({ status, comment, absence_motif: absenceMotif, updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRequest(id) {
  const { error } = await supabase.from("requests").delete().eq("id", id);
  if (error) throw error;
}

export async function editRequest(id, dbFields) {
  const { data, error } = await supabase
    .from("requests").update(dbFields).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// ─── OVERTIME (heures récupérables) ───────────────────────────────────────────
export async function fetchOvertime() {
  const { data, error } = await supabase
    .from("overtime").select("*").order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createOvertime(entry) {
  const { data, error } = await supabase.from("overtime").insert([entry]).select().single();
  if (error) throw error;
  return data;
}

export async function deleteOvertime(id) {
  const { error } = await supabase.from("overtime").delete().eq("id", id);
  if (error) throw error;
}

// ─── PASSWORD (self-service, cf. change_password.sql — bcrypt via pgcrypto) ──
export async function changePassword(userId, newPassword) {
  const { error } = await supabase
    .rpc("change_password", { p_user_id: userId, p_new_password: newPassword });
  if (error) throw error;
}

// ─── AUDIT LOG (cf. fix_audit.sql — trigger fn_audit_requests SECURITY DEFINER) ─
export async function fetchAuditLog(limit = 200) {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
