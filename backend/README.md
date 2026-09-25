# Backend Fluxa IPTV

API FastAPI servant d'intermédiaire sécurisé entre le frontend Fluxa et un serveur compatible Xtream Codes.

## Démarrage

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python run.py
```

L'API répond sur `http://127.0.0.1:8000`. La documentation interactive est disponible sur `http://127.0.0.1:8000/docs`.

Dans le frontend, créer un fichier `.env.local` :

```text
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Puis relancer `npm run dev`.

## Fonctions disponibles

- test et sauvegarde chiffrée des profils Xtream ;
- catégories et flux TV, films et séries ;
- détails des saisons et épisodes ;
- EPG court ;
- recherche globale ;
- favoris et historique dans SQLite ;
- cache avec durée adaptée au type de catalogue ;
- proxy de lecture HLS/vidéo sans exposition des identifiants Xtream ;
- CORS configurable et messages d'erreur en français.

En production, définir `FLUXA_SECRET_KEY` avec une valeur longue et stable. Les données locales et la clé générée automatiquement dans `backend/data/` sont exclues de Git.
