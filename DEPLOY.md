# Instructions de déploiement GitHub

## Option 1 : Via le site GitHub (recommandé)

1. Créez un nouveau dépôt sur GitHub : https://github.com/new
   - Nom suggéré : `extract-website-company-data`
   - Ne cochez PAS "Initialize with README"

2. Une fois créé, exécutez ces commandes dans ce dossier :

```bash
git remote add origin https://github.com/VOTRE_USERNAME/extract-website-company-data.git
git branch -M main
git push -u origin main
```

Remplacez `VOTRE_USERNAME` par votre nom d'utilisateur GitHub.

## Option 2 : Via GitHub CLI (si installée)

```bash
# Installer GitHub CLI si nécessaire
# brew install gh (sur macOS)

# Se connecter
gh auth login

# Créer le repo et pousser
gh repo create extract-website-company-data --public --source=. --remote=origin --push
```

## Vérification

Après le push, vérifiez que tous les fichiers sont présents sur GitHub :
- ✅ package.json
- ✅ INPUT_SCHEMA.json
- ✅ README.md
- ✅ src/ (tous les fichiers)
- ✅ .actor/actor.json
