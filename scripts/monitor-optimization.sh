#!/bin/bash

echo "🔍 Monitoring de l'optimisation automatique..."
echo ""

while true; do
    # Vérifie si le processus est toujours actif
    if ! ps aux | grep -v grep | grep "auto-optimize" > /dev/null; then
        echo "✅ Le script d'optimisation est terminé !"
        echo ""
        echo "📋 Derniers commits :"
        git log --oneline -5
        echo ""
        echo "📊 Statut Git :"
        git status --short
        break
    fi
    
    echo "⏳ Script en cours d'exécution... ($(date +%H:%M:%S))"
    sleep 30
done
