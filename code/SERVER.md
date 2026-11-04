# RankFeed auf einem Server

Der Server braucht nur Python 3, keine weiteren Pakete.

## Hochladen und starten

1. Den ganzen Ordner `code` auf den Server kopieren, ohne `rankfeed/data`.
2. Auf dem Server im Ordner `code` starten:

   ```bash
   PORT=8765 python3 server.py
   ```

   Damit der Server weiterläuft, wenn du dich abmeldest:

   ```bash
   nohup python3 server.py > rankfeed.log 2>&1 &
   ```

3. Falls der Anbieter einen anderen Port vorgibt, diesen bei `PORT=` eintragen.

## Adressen

- Tierlist (auf dem Ausstellungsrechner öffnen): `http://SERVER:8765/Emoji%20Tierlist.html`
- RankFeed (für die Handys): `http://SERVER:8765/RankFeed.html`

`SERVER` ist die Adresse oder Domain des Servers.

## Wichtig

- Nur **eine** Tierlist gleichzeitig offen lassen, sonst entstehen doppelte Artikel.
- Ohne Internet am Ausstellungsort kommen keine Artikel beim Server an.
- Neu anfangen: Server stoppen, `rankfeed/data` löschen, Server starten, Tierlist neu laden.
- Es gibt keinen Schreibschutz: Wer die Adresse kennt, kann technisch auch Artikel an den Server schicken.
