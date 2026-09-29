# Pai Sho — Les règles du jeu

Référence utilisateur du 27 septembre 2026 : influence locale majoritaire et cumul des écarts, sur les règles auditées du 7 septembre ; voir le [règlement complet](RULES.md).

1. **Matériel.** Deux joueurs, Joueur 1 puis Joueur 2, jouent sans hasard sur un plateau circulaire de 113 intersections. Une **intersection** est un croisement d’une ligne horizontale et d’une ligne verticale du quadrillage ; elle accueille au plus une tuile. Chacun possède 12 tuiles : quatre « 1 », quatre « 2 » et quatre « 3 ». Les tuiles 1 et 2 sont des fleurs ; la tuile 3 est un bateau bleu, sans changement de ses pouvoirs. Le plateau commence vide, sauf avec l’installation optionnelle décrite au point 17. Les camps ne s’échangent pas.

2. **Un tour.** On peut poser au maximum une tuile de son stock et effectuer les déplacements disponibles, dans l’ordre choisi. Une pose ne consomme aucun déplacement ; un déplacement ne permet aucune pose supplémentaire. Il faut au moins poser ou déplacer une pièce : passer est interdit.

3. **Budget de déplacements.** Deux déplacements sont ordinaires. On peut conserver **un seul déplacement inutilisé**, jusqu’à son utilisation, ou emprunter un déplacement au prochain tour, alors limité à un, sans nouvel emprunt. Jamais plus de trois déplacements dans un tour. Deux tours économes ne permettent pas de cumuler deux déplacements en réserve. Une pose seule peut économiser un déplacement, sous ce même plafond.

4. **Mouvement.** Chaque déplacement parcourt exactement le numéro de la tuile, en ligne droite horizontale, verticale ou diagonale. Chaque pas diagonal compte pour un intervalle. Destination et points intermédiaires doivent appartenir au plateau et être libres de toute pièce. Aucun saut par-dessus une pièce. On peut déplacer plusieurs fois la même tuile, y compris celle qu’on vient de poser.

5. **Triangle admissible.** Trois tuiles non alignées du même joueur, une de chaque numéro, peuvent former une région. Elle doit couvrir de **une à cinq intersections**, intérieur et côtés compris, libres ou occupées, hors des trois sommets. Zéro ou six intersections et davantage rendent le triangle invalide.

6. **Déclaration.** Un triangle n’existe comme région que si son propriétaire le déclare. Il peut toujours refuser, même avec une seule possibilité. Un nouveau triangle doit devenir actif à sa déclaration : il ne peut pas naître suspendu.

7. **Limites des formations.** Un joueur peut avoir au maximum quatre triangles actifs. Une pièce d’un triangle actif ne peut participer à aucun autre triangle. Les pièces d’un triangle suspendu peuvent être réutilisées par remplacement, selon la règle 11. Le nombre de déclarations successives dans un tour n’est pas limité.

8. **Région active.** L’adversaire ne peut ni poser ni terminer un déplacement sur ses intersections, mais une tuile « 2 » ou « 3 » peut sauter par-dessus celles-ci si elle atterrit au-delà, hors des régions adverses actives. Les pièces adverses déjà présentes sont immobilisées, sans être retirées. Ses propres pièces peuvent y circuler normalement. Deux régions adverses peuvent se recouvrir.

9. **Surface traversable.** Le seul croisement de traits ou de surfaces ne bloque rien. Même une tuile « 1 » peut traverser la surface d’une région entre deux intersections autorisées ; sa portée ne lui permet toutefois pas de sauter par-dessus une intersection.

10. **Suspension.** Si une région active immobilise un sommet d’un triangle adverse, celui-ci est suspendu : il ne bloque plus et ses prisonnières sont libérées, sauf autre blocage. Il redevient actif lorsque plus aucune région active ne retient ses sommets. Les pièces déjà sorties ne reviennent pas à leur ancienne place.

11. **Disparition et remplacement.** Déplacer un sommet supprime le triangle de l’ancien arrangement. Les pièces d’un triangle suspendu peuvent former un nouveau triangle admissible. Ce remplacement facultatif supprime entièrement l’ancien triangle : il ne pourra plus se réactiver. Une pièce peut ainsi changer de triangle, mais jamais appartenir simultanément aux deux.

12. **Refus.** Un triangle refusé ne peut pas être redemandé dans la même disposition, sauf si l’un de ses sommets a été immobilisé puis libéré. Le déplacement d’un sommet permet également un nouveau choix.

13. **Réactions.** Après chaque pose, déplacement ou décision de triangle, on résout immédiatement les conséquences sur les formations avant de poursuivre. Chaque propriétaire fait ses choix, même pendant le tour adverse, sans dépenser de pose, de déplacement ni de tour.

14. **Boucle.** Le joueur qui initie une boucle de suspensions, réactivations ou reformations **perd immédiatement la partie**, quel que soit le score. Cette règle s’applique aussi lorsqu’une boucle est provoquée par des suspensions réciproques. Un simple recouvrement ou une chaîne qui se stabilise n’est pas une boucle.

15. **Score.** Chaque pièce influence les **huit intersections voisines du carré 3×3**, diagonales comprises, dans les limites du plateau. Sur chaque intersection vide, le camp ayant le plus de pièces voisines reçoit **un point** : 1 contre 1 reste neutre, 2 contre 1 donne un point au camp majoritaire, 2 contre 2 reste neutre. Aucune influence plus loin ; aucune sur les intersections occupées. Toutes les tuiles ont la même influence, même immobilisées ; les régions ne la modifient pas. Chaque pièce adverse immobilisée rapporte **4 points**. Chaque triangle adverse déclaré dont au moins un sommet est immobilisé rapporte **4 points supplémentaires**, une seule fois, même s’il est suspendu. Cela donne 8 points pour un sommet, 12 pour deux sommets du même triangle, 16 pour deux sommets de triangles différents. Chaque pièce et chaque bonus de triangle ne comptent qu’une fois. La surface des triangles ne rapporte rien. Ces points donnent le score instantané du plateau. À la fin de chaque tour complet, après les réactions, seul l’écart entre les deux scores est ajouté au cumul du camp en tête ; une égalité ajoute zéro. Par exemple, 40–42 ajoute 2 points à Joueur 2 ; si cet écart reste identique pendant trois tours, Joueur 2 reçoit 6 points. Les actions intermédiaires ne rapportent aucun versement supplémentaire. Les deux cumuls commencent à zéro.

16. **Fin.** On choisit 15, 20, 30, 50 ou 70 tours **par joueur**. Au dernier tour personnel, chacun peut effectuer au maximum un déplacement, avec une pose toujours indépendante. Après résolution des réactions, le meilleur score cumulé gagne ; une égalité donne une partie nulle. **Si un seul joueur est entièrement bloqué, le score décide du résultat ; si aucun des deux ne peut jouer, la partie est nulle.** La défaite par boucle prime sur le score.

17. **Option nord/sud.** On choisit l’hémisphère de Joueur 1 ; Joueur 2 prend l’autre. Toutes les poses restent limitées à leur hémisphère respectif ; la ligne centrale est commune. Les déplacements peuvent franchir cette séparation. Avant les tours ordinaires au début de partie, chacun peut poser gratuitement, en alternance, de zéro à quatre tuiles de son choix prises dans ses douze pièces. Chacun peut arrêter son installation ; l’autre peut la terminer. L’installation et ses réactions ne rapportent aucun point au cumul. Joueur 1 commence ensuite le premier tour ordinaire.
