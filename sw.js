// Service worker minimal : rend l'appli installable sur téléphone.
// Aucune mise en cache : les données (congés, soldes) viennent toujours du
// serveur, pour ne jamais afficher d'informations périmées.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
