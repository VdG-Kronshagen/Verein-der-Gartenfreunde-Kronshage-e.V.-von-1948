# 🌱 Gartenverein – Mitglieder & E-Mail-Verteiler

Schlanke, eigenständige Web-App: **Mitglieder verwalten** + **E-Mail-Verteiler** (öffnet dein Mailprogramm mit allen Adressen im BCC). Läuft als statische Seite über **GitHub Pages**, Daten in einem **eigenen Firebase-Projekt**. **Maximale Sicherheit:** echtes E-Mail/Passwort-Login, kein anonymer Zugang – nur die 3 angelegten Konten kommen rein.

Dateien:
- `index.html`, `styles.css`, `app.js` – die App
- `firebase-config.js` – **hier deine Firebase-Daten eintragen**
- `database.rules.json` – die Sicherheitsregeln zum Einfügen

---

## 1) Firebase-Projekt anlegen (≈ 10 Min)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Projekt hinzufügen** (z. B. „gartenverein-crm"). Google Analytics kannst du abwählen.
2. **Realtime Database** → *Erstellen* → Region **europe-west1** → *Im gesperrten Modus starten* (Regeln setzen wir gleich).
3. **Authentication** → *Los geht's* → Reiter **Sign-in method** → **E-Mail/Passwort** aktivieren. **Anonym NICHT aktivieren.**
4. **3 Nutzerkonten anlegen:** Authentication → Reiter **Users** → **Nutzer hinzufügen** → E-Mail + Passwort eingeben (3×). (Optional: später unter dem Nutzer einen Anzeigenamen setzen.)
5. **Web-App registrieren:** ⚙️ *Projekteinstellungen* → unten „Meine Apps" → **</> (Web)** → Name vergeben → registrieren. Der **firebaseConfig**-Block wird angezeigt – **kopieren**.

## 2) Konfiguration eintragen

Öffne **`firebase-config.js`** und ersetze die Platzhalter durch deinen kopierten Block (apiKey, authDomain, databaseURL, projectId, …). `window.APP_TITEL` ist nur der Anzeigename oben.

> Wichtig: Die `databaseURL` muss enthalten sein (steht im Config-Block, sonst in der Realtime-Database-Ansicht oben).

## 3) Sicherheitsregeln setzen

Firebase-Konsole → **Realtime Database** → Reiter **Regeln** → den kompletten Inhalt von **`database.rules.json`** einfügen → **Veröffentlichen**.

Damit kann **nur** lesen/schreiben, wer mit einem echten E-Mail/Passwort-Konto angemeldet ist.

## 4) Über GitHub veröffentlichen

1. Neues **GitHub-Repository** (privat ist ok) anlegen.
2. Diese Dateien hochladen (alle aus diesem Ordner, im Stammverzeichnis des Repos).
3. Repo → **Settings → Pages** → *Build and deployment* → Source: **Deploy from a branch** → Branch **main** / Ordner **/(root)** → *Save*.
4. Nach 1–2 Minuten ist die App unter `https://<dein-name>.github.io/<repo>/` erreichbar.

## 5) Loslegen

- Seite öffnen → mit einer der 3 E-Mail-Adressen + Passwort anmelden.
- **Mitglieder** anlegen (Name, Funktion, E-Mail, Telefon, Adresse, Notiz). Beim Anlegen kannst du das Mitglied direkt einem oder mehreren **Verteilern** zuordnen.
- **Verteiler** anlegen, Adressen manuell oder per „Mitglied übernehmen" hinzufügen → **„✉️ Mail (BCC)"** öffnet dein Mailprogramm (z. B. Outlook) mit allen Adressen im BCC.

---

### Hinweise
- **Passwort vergessen / neuer Nutzer:** in der Firebase-Konsole unter Authentication → Users verwalten (zurücksetzen, hinzufügen, löschen). 3 Konten reichen – mehr gehen aber jederzeit.
- **Datenschutz:** „Mail (BCC)" verbirgt die Empfänger voreinander. Die Adressen liegen ausschließlich in **deinem** Firebase-Projekt.
- **Backup:** Realtime Database → ⋮ → *JSON exportieren* sichert alle Daten.
- **Kosten:** Für diese Größe bleibst du im kostenlosen Spark-Tarif (keine Kreditkarte nötig, solange du keinen Datei-Upload/Storage nutzt – brauchst du hier nicht).
- Keine Build-Tools nötig – reines HTML/JS, läuft direkt.
