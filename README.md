# Fluxa IPTV

Lecteur IPTV responsive compatible Xtream Codes, composé d'un frontend Next.js et d'une API FastAPI.

## Lancer le backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python run.py
```

API : `http://127.0.0.1:8000`

Documentation Swagger : `http://127.0.0.1:8000/docs`

## Lancer le frontend

À la racine du projet :

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Frontend : `http://localhost:3000`

Sans `NEXT_PUBLIC_API_URL`, le frontend reste utilisable en mode démonstration. Avec l'adresse du backend configurée, le formulaire Xtream teste et sauvegarde réellement le profil.

## Créer l'application Windows

Depuis la racine du projet :

```powershell
npm install
npm run dist:win
```

L'installateur est généré dans `release/Fluxa-IPTV-Setup-1.0.0.exe`. Il contient Electron, le frontend exporté et un exécutable FastAPI autonome : l'ordinateur cible n'a besoin ni de Node.js ni de Python.

Les profils, favoris, historique et secrets locaux sont conservés dans `%APPDATA%\fluxa-iptv\data`. La désinstallation préserve ces données pour éviter leur perte.

## Architecture

```text
src/                 Frontend Next.js / TypeScript
backend/app/         API FastAPI
backend/data/        Base SQLite et clé locale, exclues de Git
backend/tests/       Tests d'intégration API
electron/            Processus principal de l'application Windows
scripts/             Scripts de compilation du frontend et du backend
```

Le backend conserve les mots de passe Xtream chiffrés, met en cache les catalogues, stocke les favoris et l'historique dans SQLite, et sert les flux à travers un proxy qui masque les identifiants IPTV.

## Tests

```powershell
npm run lint
npm run build
cd backend
.venv\Scripts\python.exe -m pytest -q
```

Cette application est uniquement un lecteur multimédia. Elle ne fournit ni chaîne, ni contenu, ni abonnement IPTV.
