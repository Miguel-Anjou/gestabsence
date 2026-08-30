import { useState } from "react";

export default function NotificationBell({ notifications, onMarkRead, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter(n => !n.read).length;

  const colorMap = {
    "#1D9E75": { bg: "#E1F5EE", border: "#a7f3d0" },
    "#A32D2D": { bg: "#FCEBEB", border: "#fca5a5" },
    "#7C3AED": { bg: "#EDE9FE", border: "#c4b5fd" },
    "#BA7517": { bg: "#FAEEDA", border: "#fcd34d" },
    "#185FA5": { bg: "#E6F1FB", border: "#93c5fd" },
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Cloche */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          border: "none", cursor: "pointer",
          padding: "6px 8px", borderRadius: "8px", position: "relative",
          background: open ? "#f0f0f0" : "transparent",
        }}
      >
        <span style={{ fontSize: "20px" }}>🔔</span>
        {unread > 0 && (
          <span style={{
            position: "absolute", top: "2px", right: "2px",
            background: "#A32D2D", color: "#fff",
            borderRadius: "10px", padding: "1px 5px",
            fontSize: "10px", fontWeight: "700", lineHeight: "1.4",
            minWidth: "16px", textAlign: "center",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <>
          {/* Overlay transparent pour fermer */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 998 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            width: "340px", maxHeight: "480px",
            background: "#fff", borderRadius: "14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            border: "1px solid #eee",
            zIndex: 999, overflow: "hidden",
            display: "flex", flexDirection: "column",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {/* Header */}
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid #f0f0f0",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: "700", fontSize: "15px", color: "#1a1a2e" }}>
                Notifications {unread > 0 && <span style={{ color: "#A32D2D" }}>({unread})</span>}
              </span>
              {unread > 0 && (
                <button onClick={onMarkAllRead} style={{
                  border: "none", cursor: "pointer",
                  fontSize: "12px", color: "#185FA5", fontFamily: "'DM Sans', sans-serif",
                }}>
                  Tout marquer lu
                </button>
              )}
            </div>

            {/* Liste */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {notifications.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#bbb" }}>
                  <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔔</div>
                  <div style={{ fontSize: "13px" }}>Aucune notification</div>
                </div>
              ) : (
                [...notifications]
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                  .map(n => {
                    const c = colorMap[n.color] || colorMap["#185FA5"];
                    return (
                      <div
                        key={n.id}
                        onClick={() => { onMarkRead(n.id); }}
                        style={{
                          padding: "12px 16px",
                          background: n.read ? "#fff" : c.bg,
                          borderLeft: `3px solid ${n.read ? "#f0f0f0" : n.color}`,
                          borderBottom: "1px solid #f5f5f5",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: n.read ? "400" : "600", color: "#1a1a2e", marginBottom: "3px" }}>
                              {n.title}
                            </div>
                            <div style={{ fontSize: "12px", color: "#666", lineHeight: "1.4" }}>
                              {n.message}
                            </div>
                            <div style={{ fontSize: "11px", color: "#bbb", marginTop: "4px" }}>
                              {new Date(n.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                          {!n.read && (
                            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: n.color, flexShrink: 0, marginTop: "4px" }} />
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
