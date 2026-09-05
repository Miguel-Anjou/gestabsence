import { useState, useEffect, useCallback } from "react";
import {
  fetchUsers, fetchRequests, loginUser,
  createRequest, updateRequest, editRequest, deleteRequest, createUser, updateUser,
  fetchOvertime, createOvertime, deleteOvertime,
  changePassword,
  supabase,
} from "./supabase";
import Login from "./Login";
import EmployeeDashboard from "./EmployeeDashboard";
import ManagerDashboard from "./ManagerDashboard";
import { Avatar } from "./components";
import { INITIAL_USERS, INITIAL_REQUESTS, INITIAL_OVERTIME, effectiveManagedDepts } from "./data";
import AdminPanel from "./AdminPanel";
import NotificationBell from "./NotificationBell";
import { dispatchNotification, checkN1Expiry } from "./notifications";

const SUPABASE_CONFIGURED =
  process.env.REACT_APP_SUPABASE_URL &&
  process.env.REACT_APP_SUPABASE_URL.startsWith("https://");

const DEFAULT_SETTINGS = { company: "Mon Entreprise", resetDate: "06-01", rttDefault: 0, emailNotif: false, emailProvider: "outlook", emailFrom: "", emailService: "", emailTemplate: "", emailPublicKey: "", emailDomain: "" };

function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function App() {
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [overtime, setOvertime] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [closures, setClosures] = useState(() => lsGet("gestabsence_closures", []));
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...lsGet("gestabsence_settings", {}) }));
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  const [sideOpen, setSideOpen] = useState(typeof window !== "undefined" ? window.innerWidth > 900 : true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [pwdError, setPwdError] = useState("");
  const [forcePwdNext, setForcePwdNext] = useState("");
  const [forcePwdConfirm, setForcePwdConfirm] = useState("");
  const [forcePwdError, setForcePwdError] = useState("");

  // Garde currentUser synchronisé avec l'état users (pour voir les soldes mis à jour en temps réel)
  const currentUserFresh = currentUser ? (users.find(u => u.id === currentUser.id) || currentUser) : null;

  // ─── Normalisation snake_case → camelCase ─────────────────────────────────
  const normalizeUsers = (rows) =>
    rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      password: u.password,
      role: u.role,
      department: u.department,
      managedDepts: u.managed_depts || u.managedDepts || [],
      avatar: u.avatar,
      soldeConges:     u.solde_conges      ?? u.soldeConges      ?? 25,
      soldeRTT:        u.solde_rtt         ?? u.soldeRTT         ?? 0,
      soldeHeures:     u.solde_heures      ?? u.soldeHeures      ?? 0,
      horaire:         u.horaire           || { L:8, M:8, Me:8, J:8, V:8, S:0, D:0 },
      managedUserIds:  u.managed_user_ids  ?? u.managedUserIds   ?? [],
      soldeN1:         u.solde_n1          ?? u.soldeN1          ?? 0,
      archived:        u.archived          === true ? true : false,
      mustChangePassword: u.must_change_password ?? u.mustChangePassword ?? false,
      canRtt:          u.can_rtt          !== undefined ? u.can_rtt          : (u.canRtt          !== undefined ? u.canRtt          : true),
      canRecuperation: u.can_recuperation !== undefined ? u.can_recuperation : (u.canRecuperation !== undefined ? u.canRecuperation : true),
    }));

  const normalizeRequests = (rows) =>
    rows.map(r => ({
      id: r.id,
      userId: r.user_id ?? r.userId,
      type: r.type,
      subType: r.sub_type ?? r.subType ?? "full",
      startDate: r.start_date ?? r.startDate,
      endDate: r.end_date ?? r.endDate,
      days: r.days,
      reason: r.reason,
      status: r.status,
      comment: r.comment || "",
      absenceMotif: r.absence_motif ?? r.absenceMotif ?? "",
      heureDebut: r.heure_debut ?? r.heureDebut ?? "",
      heureFin: r.heure_fin ?? r.heureFin ?? "",
      durationMinutes: r.duration_minutes ?? r.durationMinutes ?? null,
      createdAt: (r.created_at ?? r.createdAt ?? "").split("T")[0],
      chefValidatedBy: r.chef_validated_by ?? r.chefValidatedBy ?? null,
      validatedBy:     r.validated_by     ?? r.validatedBy     ?? null,
      validatedAt:     r.validated_at     ?? r.validatedAt     ?? null,
    }));

  const normalizeOvertime = (rows) =>
    rows.map(o => ({
      id:         o.id,
      userId:     o.user_id     ?? o.userId,
      date:       o.date,
      hours:      o.hours,
      reason:     o.reason      || "",
      createdBy:  o.created_by  ?? o.createdBy  ?? null,
      isRecovery: o.is_recovery ?? o.isRecovery ?? false,
      createdAt:  (o.created_at ?? o.createdAt  ?? "").split("T")[0],
    }));

  // ─── Détection mobile ─────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSideOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ─── Persistance localStorage ─────────────────────────────────────────────
  useEffect(() => { if (!loading) lsSet("gestabsence_settings", settings); }, [settings, loading]);
  useEffect(() => { if (!loading) lsSet("gestabsence_closures", closures); }, [closures, loading]);
  useEffect(() => { if (!loading) lsSet("gestabsence_overtime", overtime); }, [overtime, loading]);
  useEffect(() => { if (!SUPABASE_CONFIGURED && !loading) lsSet("gestabsence_users", users); }, [users, loading]);
  useEffect(() => { if (!SUPABASE_CONFIGURED && !loading) lsSet("gestabsence_requests", requests); }, [requests, loading]);

  // ─── Chargement ───────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!SUPABASE_CONFIGURED) {
      setUsers(lsGet("gestabsence_users", INITIAL_USERS));
      setRequests(lsGet("gestabsence_requests", INITIAL_REQUESTS));
      setOvertime(lsGet("gestabsence_overtime", INITIAL_OVERTIME));
      setLoading(false);
      return;
    }
    try {
      const [u, r, ot] = await Promise.all([fetchUsers(), fetchRequests(), fetchOvertime()]);
      setUsers(normalizeUsers(u));
      setRequests(normalizeRequests(r));
      setOvertime(normalizeOvertime(ot));
    } catch (e) {
      console.error("Supabase error:", e);
      setDbError(true);
      setUsers(INITIAL_USERS);
      setRequests(INITIAL_REQUESTS);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Alerte N-1 expirante ─────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || loading) return;
    checkN1Expiry(currentUserFresh || currentUser, addNotification);
  }, [currentUser?.id, loading]); // eslint-disable-line

  // ─── Temps réel ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    // Debounce : regroupe les événements users en rafale (import paie) en un seul fetchUsers
    let usersTimer = null;
    const channel = supabase
      .channel("db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, () => {
        fetchRequests().then(r => setRequests(normalizeRequests(r))).catch(() => {});
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => {
        clearTimeout(usersTimer);
        usersTimer = setTimeout(() => {
          fetchUsers().then(u => setUsers(normalizeUsers(u))).catch(() => {});
        }, 800);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "overtime" }, () => {
        fetchOvertime().then(ot => setOvertime(normalizeOvertime(ot))).catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); clearTimeout(usersTimer); };
  }, []); // eslint-disable-line

  // ─── Auth ─────────────────────────────────────────────────────────────────
  const handleLogin = async ({ email, password }) => {
    if (SUPABASE_CONFIGURED) {
      const dbUser = await loginUser(email, password);
      if (dbUser) {
        setCurrentUser(normalizeUsers([dbUser])[0]);
        return true;
      }
      return false;
    } else {
      const u = users.find(x =>
        x.email === email &&
        (x.password === password) &&
        x.archived !== true
      );
      if (u) { setCurrentUser(u); return true; }
      return false;
    }
  };

  // ─── Actions ──────────────────────────────────────────────────────────────

  // Vérifie si une demande chevauche une demande existante active pour le même salarié
  const checkOverlap = (reqData) => {
    const { userId, startDate, endDate } = reqData;
    const end = endDate || startDate;
    return requests.some(r =>
      r.userId === userId &&
      (r.status === "pending" || r.status === "chef_approved" || r.status === "approved") &&
      r.startDate <= end &&
      (r.endDate || r.startDate) >= startDate
    );
  };

  const handleAddRequest = async (reqData) => {
    if (checkOverlap(reqData)) {
      alert("⚠️ Ce salarié a déjà une demande en cours sur ces dates (en attente ou approuvée). Veuillez choisir d'autres dates.");
      return;
    }
    // Le solde est géré côté Supabase par un trigger (déduction à la validation,
    // recrédit si refus). On ne touche plus au solde ici pour éviter le double comptage.
    if (SUPABASE_CONFIGURED) {
      try {
        const inserted = await createRequest({
          id: `r${Date.now()}`,
          user_id: reqData.userId,
          type: reqData.type,
          sub_type: reqData.subType || "full",
          start_date: reqData.startDate,
          end_date: reqData.endDate,
          days: reqData.days,
          reason: reqData.reason,
          absence_motif: reqData.absenceMotif || "",
          status: reqData.status || "pending",
          comment: reqData.comment || "",
          heure_debut: reqData.heureDebut || "",
          heure_fin: reqData.heureFin || "",
          duration_minutes: reqData.durationMinutes ?? null,
          created_at: new Date().toISOString(),
        });
        const insertedNorm = normalizeRequests([inserted])[0];
        setRequests(prev => [insertedNorm, ...prev]);
        if (insertedNorm.status !== "approved") {
          const empMgrs = users.filter(u => {
            if (u.id === currentUser?.id) return false;
            if (u.role === "manager" || u.role === "admin") {
              return effectiveManagedDepts(u).includes(currentUser?.department);
            }
            if (u.role === "teamleader") {
              // Chef d'équipe : notifié seulement si le salarié est dans son équipe assignée
              // ou dans son département si managedDepts est configuré
              const inTeam = u.managedUserIds?.includes(currentUser?.id);
              const inDept = u.managedDepts?.length > 0 && u.managedDepts.includes(currentUser?.department);
              return inTeam || inDept;
            }
            return false;
          });
          dispatchNotification({ action: "submitted", request: insertedNorm, employee: currentUser, actor: currentUser, managers: empMgrs, settings, addNotification });
        }
      } catch (e) { console.error(e); }
    } else {
        const newLocalReq = {
        ...reqData,
        id: `r${Date.now()}`,
        createdAt: new Date().toISOString().split("T")[0],
        comment: reqData.comment || "",
      };
      setRequests(prev => [newLocalReq, ...prev]);
      if (newLocalReq.status !== "approved") {
        const empMgrs = users.filter(u => {
          if (u.id === currentUser?.id) return false;
          if (u.role === "manager" || u.role === "admin") {
            return effectiveManagedDepts(u).includes(currentUser?.department);
          }
          if (u.role === "teamleader") {
            const inTeam = u.managedUserIds?.includes(currentUser?.id);
            const inDept = u.managedDepts?.length > 0 && u.managedDepts.includes(currentUser?.department);
            return inTeam || inDept;
          }
          return false;
        });
        dispatchNotification({ action: "submitted", request: newLocalReq, employee: currentUser, actor: currentUser, managers: empMgrs, settings, addNotification });
      }
    }
  };

  // Calcule la variation de solde à appliquer selon l'action et le type de demande
  const computeSoldeUpdate = (user, req, action) => {
    if (!user || !req) return null;
    const days = req.days || 0;
    if (action === "approved") {
      if (["conge", "conge_sans_solde", "conge_exceptionnel"].includes(req.type)) {
        // Déduire N-1 en priorité avant le 31 mai, puis le solde N
        const now = new Date();
        const may31 = new Date(now.getFullYear(), 4, 31);
        const n1 = user.soldeN1 || 0;
        const useN1 = n1 > 0 && now <= may31;
        if (useN1) {
          const fromN1 = Math.min(n1, days);
          const fromN  = Math.max(0, days - fromN1);
          return {
            soldeN1:     Math.max(0, n1 - fromN1),
            soldeConges: Math.max(0, (user.soldeConges || 0) - fromN),
          };
        }
        return { soldeConges: Math.max(0, (user.soldeConges || 0) - days) };
      }
      if (req.type === "rtt")
        return { soldeRTT: Math.max(0, (user.soldeRTT || 0) - days) };
      if (req.type === "recuperation") {
        const h = req.durationMinutes ? req.durationMinutes / 60 : days;
        return { soldeHeures: Math.max(0, (user.soldeHeures || 0) - h) };
      }
    }
    return null;
  };

  const handleUpdateRequest = async (reqId, action, comment, absenceMotif = "", fullData = null) => {
    setSaving(true);
    const req = requests.find(r => r.id === reqId);
    const actorRole = currentUser?.role;

    const needsDoubleValidation = ["conge","conge_sans_solde","conge_exceptionnel","rtt","recuperation"].includes(req?.type);
    // Bloquer un TL de re-valider une demande déjà en chef_approved
    if (actorRole === "teamleader" && req?.status === "chef_approved") {
      setSaving(false);
      return;
    }
    if (action === "approved" && actorRole === "teamleader" && needsDoubleValidation) {
      action = "chef_approved";
      fullData = { ...(fullData || {}), chefValidatedBy: currentUser?.id };
    }

    if (SUPABASE_CONFIGURED) {
      try {
        const updated = await updateRequest(reqId, action, comment, absenceMotif, fullData?.chefValidatedBy, (action === "approved" || action === "rejected") ? currentUser?.id : null);
        setRequests(prev => prev.map(r => r.id === reqId
          ? { ...normalizeRequests([updated])[0], ...(fullData || {}) }
          : r));
        const empUser = users.find(u => u.id === req?.userId);
        // Mise à jour explicite du solde (ne pas dépendre uniquement d'un trigger SQL)
        const soldeUpdate = computeSoldeUpdate(empUser, req, action);
        if (soldeUpdate && empUser) {
          const dbFields = {};
          if (soldeUpdate.soldeConges  !== undefined) dbFields.solde_conges  = soldeUpdate.soldeConges;
          if (soldeUpdate.soldeRTT     !== undefined) dbFields.solde_rtt     = soldeUpdate.soldeRTT;
          if (soldeUpdate.soldeHeures  !== undefined) dbFields.solde_heures  = soldeUpdate.soldeHeures;
          if (soldeUpdate.soldeN1      !== undefined) dbFields.solde_n1      = soldeUpdate.soldeN1;
          await updateUser(empUser.id, dbFields).catch(e => console.error("solde update:", e));
          setUsers(prev => prev.map(u => u.id === empUser.id ? { ...u, ...soldeUpdate } : u));
        }
        const allMgrs = users.filter(u => (u.role === "manager" || u.role === "admin") && effectiveManagedDepts(u).includes(empUser?.department));
        dispatchNotification({ action, request: {...req, comment}, employee: empUser, actor: currentUser, managers: allMgrs, settings, addNotification });
      } catch (e) { console.error(e); } finally { setSaving(false); }
    } else {
      const now = new Date().toISOString();
      setRequests(prev => prev.map(r => r.id === reqId ? {
        ...r, status: action, comment, absenceMotif, ...(fullData||{}),
        ...(action === "approved" || action === "rejected" ? { validatedBy: currentUser?.id, validatedAt: now } : {}),
      } : r));
      const empUser2 = users.find(u => u.id === req?.userId);
      const soldeUpdate2 = computeSoldeUpdate(empUser2, req, action);
      if (soldeUpdate2 && empUser2) {
        setUsers(prev => prev.map(u => u.id === req.userId ? { ...u, ...soldeUpdate2 } : u));
      }
      const allMgrs = users.filter(u => (u.role === "manager" || u.role === "admin") && u.managedDepts?.includes(empUser2?.department));
      dispatchNotification({ action, request: {...req, comment}, employee: empUser2, actor: currentUser, managers: allMgrs, settings, addNotification });
      setSaving(false);
    }
  };

  const handleUpdateUser = async (userId, updates) => {
    // Si mot de passe changé par un tiers, forcer le changement à la prochaine connexion
    const enriched = updates.password
      ? { ...updates, mustChangePassword: true }
      : updates;
    // Optimistic update immédiat
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...enriched } : u));
    // Persistance Supabase si configuré
    if (SUPABASE_CONFIGURED) {
      try {
        // Convertir camelCase → snake_case pour Supabase
        const dbUpdates = {};
        if (updates.name        !== undefined) dbUpdates.name            = updates.name;
        if (updates.email       !== undefined) dbUpdates.email           = updates.email;
        if (updates.role        !== undefined) dbUpdates.role            = updates.role;
        if (updates.department  !== undefined) dbUpdates.department      = updates.department;
        if (updates.soldeConges !== undefined) dbUpdates.solde_conges    = updates.soldeConges;
        if (updates.soldeRTT    !== undefined) dbUpdates.solde_rtt       = updates.soldeRTT;
        if (updates.soldeHeures !== undefined) dbUpdates.solde_heures    = updates.soldeHeures;
        if (updates.archived    !== undefined) dbUpdates.archived        = updates.archived;
        if (updates.horaire     !== undefined) dbUpdates.horaire         = updates.horaire;
        if (updates.managedDepts    !== undefined) dbUpdates.managed_depts     = updates.managedDepts;
        if (updates.managedUserIds  !== undefined) dbUpdates.managed_user_ids  = updates.managedUserIds;
        if (updates.canRtt          !== undefined) dbUpdates.can_rtt           = updates.canRtt;
        if (updates.canRecuperation !== undefined) dbUpdates.can_recuperation  = updates.canRecuperation;
        if (updates.soldeN1         !== undefined) dbUpdates.solde_n1          = updates.soldeN1;
        // Changement de mot de passe : passe par changePassword (bcrypt) + force changement
        if (updates.password) {
          await changePassword(userId, updates.password).catch(e => console.error("changePassword:", e));
          dbUpdates.must_change_password = true;
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, mustChangePassword: true } : u));
        }
        if (Object.keys(dbUpdates).length > 0) await updateUser(userId, dbUpdates);
      } catch (e) { console.error("updateUser error:", e); }
    }
  };

  const handleResetSoldes = async () => {
    const rttDefault = settings?.rttDefault || 0;
    const updated = users.map(u => {
      if (u.role !== "employee" && u.role !== "manager" && u.role !== "teamleader") return u;
      return { ...u, soldeConges: 25, soldeRTT: rttDefault };
    });
    setUsers(updated);
    if (SUPABASE_CONFIGURED) {
      await Promise.all(
        updated
          .filter(u => u.role === "employee" || u.role === "manager" || u.role === "teamleader")
          .map(u => updateUser(u.id, { solde_conges: 25, solde_rtt: rttDefault }).catch(e => console.error("reset solde:", e)))
      );
    }
  };

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
  };

  const addNotification = (notif) => {
    setNotifications(prev => [notif, ...prev].slice(0, 50)); // max 50 notifs
  };

  const handleMarkRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? {...n, read: true} : n));
  };

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({...n, read: true})));
  };

  const handleForcedChangePassword = async () => {
    if (!forcePwdNext || !forcePwdConfirm) { setForcePwdError("Tous les champs sont obligatoires."); return; }
    if (forcePwdNext.length < 8) { setForcePwdError("Le mot de passe doit comporter au moins 8 caractères."); return; }
    if (forcePwdNext !== forcePwdConfirm) { setForcePwdError("Les deux mots de passe ne correspondent pas."); return; }
    try {
      if (SUPABASE_CONFIGURED) {
        await changePassword(currentUser.id, forcePwdNext);
      } else {
        setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, password: forcePwdNext, mustChangePassword: false } : u));
      }
      setCurrentUser(prev => ({ ...prev, mustChangePassword: false }));
      setForcePwdNext("");
      setForcePwdConfirm("");
      setForcePwdError("");
    } catch (e) {
      setForcePwdError("Erreur lors de la modification. Réessayez.");
    }
  };

  const handleAddClosure = (closure) => setClosures(prev => [...prev, closure]);
  const handleDeleteClosure = (id) => setClosures(prev => prev.filter(c => c.id !== id));

  const handleChangePassword = async () => {
    const { current, next, confirm } = pwdForm;
    if (!current || !next || !confirm) { setPwdError("Tous les champs sont obligatoires."); return; }
    if (next.length < 6) { setPwdError("Le nouveau mot de passe doit comporter au moins 6 caractères."); return; }
    if (next !== confirm) { setPwdError("Les deux nouveaux mots de passe ne correspondent pas."); return; }
    // Vérifier l'ancien mot de passe
    const ok = await loginUser(currentUser.email, current).catch(() => null);
    if (!ok) { setPwdError("Mot de passe actuel incorrect."); return; }
    try {
      if (SUPABASE_CONFIGURED) {
        await changePassword(currentUser.id, next);
      } else {
        setUsers(prev => prev.map(u => u.id === currentUser.id ? { ...u, password: next } : u));
      }
      setPwdForm({ current: "", next: "", confirm: "" });
      setPwdError("");
      setShowPwdModal(false);
      alert("✅ Mot de passe modifié avec succès.");
    } catch (e) {
      setPwdError("Erreur lors de la modification. Réessayez.");
    }
  };

  const handleAddRecovery = async (recData) => {
    const dbEntry = {
      id:          `ot${Date.now()}`,
      user_id:     recData.userId,
      date:        recData.date,
      hours:       recData.hours,
      reason:      recData.reason || "Récupération HR",
      created_by:  recData.createdBy || null,
      is_recovery: true,
    };
    if (SUPABASE_CONFIGURED) {
      try {
        const saved = await createOvertime(dbEntry);
        setOvertime(prev => [normalizeOvertime([saved])[0], ...prev]);
      } catch (e) { console.error("createOvertime:", e); return; }
    } else {
      setOvertime(prev => [{ ...recData, id: dbEntry.id, isRecovery: true, createdAt: new Date().toISOString().split("T")[0] }, ...prev]);
    }
    setUsers(prev => prev.map(u =>
      u.id === recData.userId ? { ...u, soldeHeures: Math.max(0, (u.soldeHeures || 0) - recData.hours) } : u
    ));
    if (SUPABASE_CONFIGURED) {
      const emp = users.find(u => u.id === recData.userId);
      if (emp) updateUser(recData.userId, { solde_heures: Math.max(0, (emp.soldeHeures || 0) - recData.hours) }).catch(() => {});
    }
  };

  const handleEditRequest = async (reqId, updates) => {
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, ...updates } : r));
    if (SUPABASE_CONFIGURED) {
      try {
        const dbFields = {};
        if (updates.status !== undefined) dbFields.status = updates.status;
        if (updates.type !== undefined) dbFields.type = updates.type;
        if (updates.reason !== undefined) dbFields.reason = updates.reason;
        if (updates.comment !== undefined) dbFields.comment = updates.comment;
        if (updates.absenceMotif !== undefined) dbFields.absence_motif = updates.absenceMotif;
        if (updates.startDate !== undefined) dbFields.start_date = updates.startDate;
        if (updates.endDate !== undefined) dbFields.end_date = updates.endDate;
        if (updates.days !== undefined) dbFields.days = updates.days;
        if (updates.subType !== undefined) dbFields.sub_type = updates.subType;
        if (updates.heureDebut !== undefined) dbFields.heure_debut = updates.heureDebut;
        if (updates.heureFin !== undefined) dbFields.heure_fin = updates.heureFin;
        if (updates.durationMinutes !== undefined) dbFields.duration_minutes = updates.durationMinutes;
        if (Object.keys(dbFields).length > 0) await editRequest(reqId, dbFields);
      } catch (e) { console.error("editRequest:", e); }
    }
  };

  const handleDeleteRequest = async (req) => {
    if (!window.confirm("Supprimer cette demande ? Cette action est irréversible.")) return;
    const reqId = req?.id || req;
    if (SUPABASE_CONFIGURED) {
      try { await deleteRequest(reqId); } catch (e) { console.error(e); return; }
    }
    setRequests(prev => prev.filter(r => r.id !== reqId));
  };

  const handleAddOvertime = async (otData) => {
    const dbEntry = {
      id:          `ot${Date.now()}`,
      user_id:     otData.userId,
      date:        otData.date,
      hours:       otData.hours,
      reason:      otData.reason || "",
      created_by:  otData.createdBy || null,
      is_recovery: false,
    };
    if (SUPABASE_CONFIGURED) {
      try {
        const saved = await createOvertime(dbEntry);
        setOvertime(prev => [normalizeOvertime([saved])[0], ...prev]);
      } catch (e) { console.error("createOvertime:", e); return; }
    } else {
      setOvertime(prev => [{ ...otData, id: dbEntry.id, isRecovery: false, createdAt: new Date().toISOString().split("T")[0] }, ...prev]);
    }
    setUsers(prev => prev.map(u =>
      u.id === otData.userId ? { ...u, soldeHeures: (u.soldeHeures || 0) + otData.hours } : u
    ));
    if (SUPABASE_CONFIGURED) {
      const emp = users.find(u => u.id === otData.userId);
      if (emp) updateUser(otData.userId, { solde_heures: (emp.soldeHeures || 0) + otData.hours }).catch(() => {});
    }
  };

  const handleDeleteOvertime = async (otId, userId, hours, isRecovery) => {
    if (SUPABASE_CONFIGURED) {
      try { await deleteOvertime(otId); } catch (e) { console.error("deleteOvertime:", e); }
    }
    setOvertime(prev => prev.filter(o => o.id !== otId));
    const newSolde = (() => {
      const emp = users.find(u => u.id === userId);
      if (!emp) return null;
      return isRecovery
        ? (emp.soldeHeures || 0) + hours
        : Math.max(0, (emp.soldeHeures || 0) - hours);
    })();
    setUsers(prev => prev.map(u => u.id !== userId ? u : { ...u, soldeHeures: newSolde ?? u.soldeHeures }));
    if (SUPABASE_CONFIGURED && newSolde !== null) {
      updateUser(userId, { solde_heures: newSolde }).catch(() => {});
    }
  };

  const handleAddUser = async (userData) => {
    const avatar = userData.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    if (SUPABASE_CONFIGURED) {
      try {
        const inserted = await createUser({
          name: userData.name,
          email: userData.email,
          password: userData.password,
          role: userData.role,
          department: userData.department,
          managed_depts: userData.managedDepts || [],
          avatar,
          solde_conges:    userData.soldeConges  ?? 25,
          solde_rtt:       userData.soldeRTT     ?? 0,
          solde_heures:    userData.soldeHeures  ?? 0,
          horaire:         userData.horaire      || { L:8, M:8, Me:8, J:8, V:8, S:0, D:0 },
          can_rtt:         userData.canRtt          !== false,
          can_recuperation: userData.canRecuperation !== false,
          must_change_password: userData.role !== "admin",
        });
        setUsers(prev => [...prev, normalizeUsers([inserted])[0]]);
      } catch (e) { console.error(e); }
    } else {
      setUsers(prev => [...prev, {
        ...userData, id: `u${Date.now()}`, avatar,
        soldeConges: userData.soldeConges ?? 25,
        managedDepts: userData.managedDepts || [],
        mustChangePassword: userData.role !== "admin",
        canRtt: userData.canRtt !== false,
        canRecuperation: userData.canRecuperation !== false,
      }]);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) return <Loader />;

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  if (currentUser.mustChangePassword && currentUser.role !== "admin") {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f2027, #2c5364)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: "20px", padding: "2.5rem", width: "100%", maxWidth: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
          <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
            <div style={{ width: "56px", height: "56px", background: "#FEF3C7", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", margin: "0 auto 1rem" }}>🔑</div>
            <h2 style={{ margin: "0 0 8px", fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: "700", color: "#1a1a2e" }}>Changement de mot de passe</h2>
            <p style={{ margin: 0, fontSize: "13px", color: "#888", lineHeight: "1.5" }}>
              Bonjour <strong>{currentUser.name.split(" ")[0]}</strong>, vous devez définir un nouveau mot de passe avant d'accéder à l'application.
            </p>
          </div>
          {forcePwdError && (
            <div style={{ background: "#FCEBEB", color: "#A32D2D", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "1rem" }}>
              {forcePwdError}
            </div>
          )}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" }}>Nouveau mot de passe <span style={{ color: "#888", fontWeight: "400" }}>(8 caractères min.)</span></label>
            <input
              type="password"
              value={forcePwdNext}
              onChange={e => setForcePwdNext(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleForcedChangePassword()}
              autoFocus
              style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e0e0e0", borderRadius: "10px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
            />
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#555", marginBottom: "5px" }}>Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              value={forcePwdConfirm}
              onChange={e => setForcePwdConfirm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleForcedChangePassword()}
              style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e0e0e0", borderRadius: "10px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
            />
          </div>
          <button
            onClick={handleForcedChangePassword}
            style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg, #1D9E75, #0F6E56)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
          >
            Définir mon mot de passe
          </button>
          <button
            onClick={() => setCurrentUser(null)}
            style={{ width: "100%", marginTop: "10px", padding: "10px", background: "none", border: "none", color: "#aaa", fontSize: "13px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  const isManager = ["manager","admin","teamleader"].includes(currentUserFresh?.role);

  return (
    <div style={styles.app}>
      {/* Overlay mobile quand sidebar ouverte */}
      {isMobile && sideOpen && (
        <div onClick={() => setSideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10 }} />
      )}

      <aside style={{
        ...styles.sidebar,
        width: sideOpen ? "240px" : (isMobile ? "0px" : "64px"),
        position: isMobile ? "fixed" : "sticky",
        zIndex: isMobile ? 11 : 1,
        overflow: "hidden",
      }}>
        <div style={styles.sideHeader}>
          <div style={styles.logoRow}>
            <div style={styles.logoBubble}>📅</div>
            {sideOpen && <span style={styles.logoText}>GestAbsence</span>}
          </div>
          <button onClick={() => setSideOpen(!sideOpen)} style={styles.toggleBtn}>
            {sideOpen ? "◀" : "▶"}
          </button>
        </div>

        <nav style={styles.nav}>
          <NavItem icon="🏠" label="Tableau de bord" active open={sideOpen} />
          {isManager && <NavItem icon="👥" label="Mon équipe" open={sideOpen} />}
          {isManager && <NavItem icon="📊" label="Statistiques" open={sideOpen} />}
        </nav>

        {sideOpen && (
          <div style={{
            ...styles.modeBanner,
            ...(SUPABASE_CONFIGURED
              ? { background: "rgba(29,158,117,0.18)", color: "#9FE1CB" }
              : {}),
          }}>
            {SUPABASE_CONFIGURED ? "🟢 Connecté Supabase" : "⚡ Mode démo (local)"}
          </div>
        )}

        <div style={styles.sideFooter}>
          <div style={styles.userRow}>
            <Avatar initials={currentUser.avatar} size={34} />
            {sideOpen && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: "500", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentUser.name}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                  {currentUser.role === "admin" ? "Admin RH" : currentUser.role === "manager" ? "Responsable" : currentUser.role === "teamleader" ? "Chef d'équipe" : "Salarié"}
                </div>
              </div>
            )}
          </div>
          {sideOpen && (
            <button onClick={() => setShowPwdModal(true)} style={{ ...styles.logoutBtn, marginBottom: "6px", color: "rgba(255,255,255,0.45)" }}>🔑 Changer mot de passe</button>
          )}
          {sideOpen && (
            <button onClick={() => setCurrentUser(null)} style={styles.logoutBtn}>Déconnexion</button>
          )}
        </div>
      </aside>

      <main style={{ ...styles.main, marginLeft: isMobile ? 0 : undefined }}>
        <div style={styles.topBar}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {isMobile && (
              <button onClick={() => setSideOpen(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", padding: "2px 6px" }}>☰</button>
            )}
            <span style={{ fontSize: isMobile ? "12px" : "14px", color: "#999" }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: isMobile ? "short" : "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <NotificationBell
              notifications={notifications.filter(n => n.userId === currentUser?.id)}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
            />
            <span style={styles.roleBadge}>
              {currentUser.role === "admin" ? "⚙️ Admin RH" : currentUser.role === "manager" ? "👔 Responsable" : currentUser.role === "teamleader" ? "👷 Chef d'équipe" : "👤 Salarié"}
            </span>
          </div>
        </div>
        <div style={styles.content}>
          {isManager ? (
            <ManagerDashboard
              user={currentUserFresh}
              users={users}
              requests={requests}
              overtime={overtime}
              settings={settings}
              closures={closures}
              onAddClosure={handleAddClosure}
              onDeleteClosure={handleDeleteClosure}
              onUpdateRequest={handleUpdateRequest}
              onAddRequest={handleAddRequest}
              onAddUser={handleAddUser}
              onAddOvertime={handleAddOvertime}
              onDeleteOvertime={handleDeleteOvertime}
              onAddRecovery={handleAddRecovery}
              onUpdateUser={handleUpdateUser}
              onResetSoldes={handleResetSoldes}
              onSaveSettings={handleSaveSettings}
              onDeleteRequest={handleDeleteRequest}
              onEditRequest={handleEditRequest}
            />
          ) : (
            <EmployeeDashboard
              user={currentUserFresh}
              users={users}
              requests={requests}
              overtime={overtime}
              closures={closures}
              onAddRequest={handleAddRequest}
              onEditRequest={handleEditRequest}
              onDeleteRequest={handleDeleteRequest}
            />
          )}
        </div>
      </main>

      {/* ─── Modal : changement de mot de passe ──────────────────────────── */}
      {showPwdModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "2rem", width: "360px", maxWidth: "92vw", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 1.2rem", fontFamily: "'Syne', sans-serif", fontSize: "18px", color: "#1a1a2e" }}>🔑 Changer le mot de passe</h3>
            {pwdError && <div style={{ background: "#FCEBEB", color: "#A32D2D", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>{pwdError}</div>}
            {[
              ["current", "Mot de passe actuel"],
              ["next",    "Nouveau mot de passe"],
              ["confirm", "Confirmer le nouveau mot de passe"],
            ].map(([key, label]) => (
              <div key={key} style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#666", display: "block", marginBottom: "4px" }}>{label}</label>
                <input
                  type="password"
                  value={pwdForm[key]}
                  onChange={e => setPwdForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e0e0e0", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "1.2rem" }}>
              <button onClick={() => { setShowPwdModal(false); setPwdError(""); setPwdForm({ current: "", next: "", confirm: "" }); }} style={{ flex: 1, padding: "9px", border: "1.5px solid #e0e0e0", borderRadius: "8px", cursor: "pointer", background: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "14px" }}>Annuler</button>
              <button onClick={handleChangePassword} style={{ flex: 1, padding: "9px", border: "none", borderRadius: "8px", cursor: "pointer", background: "#1D9E75", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: "600" }}>Modifier</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Indicateur de sauvegarde ─────────────────────────────────────── */}
      {saving && (
        <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", background: "#1a1a2e", color: "#fff", padding: "10px 18px", borderRadius: "10px", fontSize: "13px", zIndex: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
          ⏳ Enregistrement…
        </div>
      )}
    </div>
  );
}

function Loader() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f2027, #2c5364)", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: "40px", marginBottom: "1rem" }}>📅</div>
        <div style={{ fontSize: "16px", opacity: 0.7 }}>Chargement de GestAbsence…</div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, open }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: open ? "10px 14px" : "10px",
      justifyContent: open ? "flex-start" : "center",
      borderRadius: "10px",
      background: active ? "rgba(255,255,255,0.12)" : "transparent",
      color: active ? "#fff" : "rgba(255,255,255,0.55)",
      cursor: "pointer", fontSize: "14px",
    }}>
      <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>
      {open && <span>{label}</span>}
    </div>
  );
}

const styles = {
  app: { display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#f4f5f7" },
  sidebar: {
    background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
    display: "flex", flexDirection: "column",
    transition: "width 0.25s ease", flexShrink: 0,
    overflow: "hidden", position: "sticky", top: 0, height: "100vh",
  },
  sideHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "1.25rem 1rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  logoRow: { display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" },
  logoBubble: { width: "34px", height: "34px", background: "#1D9E75", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 },
  logoText: { fontFamily: "'Syne', sans-serif", color: "#fff", fontWeight: "700", fontSize: "16px", whiteSpace: "nowrap" },
  toggleBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "12px", padding: "4px", flexShrink: 0 },
  nav: { flex: 1, padding: "1rem 0.75rem", display: "flex", flexDirection: "column", gap: "4px" },
  modeBanner: { margin: "0 0.75rem 0.75rem", padding: "6px 10px", borderRadius: "8px", fontSize: "11px", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", textAlign: "center" },
  sideFooter: { padding: "1rem", borderTop: "1px solid rgba(255,255,255,0.08)" },
  userRow: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", overflow: "hidden" },
  logoutBtn: { width: "100%", padding: "8px", background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontFamily: "'DM Sans', sans-serif" },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.5rem", background: "#fff", borderBottom: "1px solid #eee" },
  roleBadge: { fontSize: "12px", padding: "4px 10px", background: "#f0f0f0", color: "#555", borderRadius: "20px" },
  content: { flex: 1, padding: "clamp(0.75rem, 3vw, 1.5rem)", maxWidth: "1100px", width: "100%", margin: "0 auto", boxSizing: "border-box" },
};
