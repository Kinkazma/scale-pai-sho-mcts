# Pai Sho — Règlement complet

Référence du 7 septembre 2026, actualisée le 27 septembre pour le cumul des écarts et l’influence locale majoritaire confirmés par l’utilisateur. La [liste courte](RULES_SHORT.md) constitue la version destinée aux joueurs.

Cette référence décrit le jeu demandé. Le moteur V12 conserve le franchissement des régions, le report limité à un, les deux cas de blocage, l’historique des suspensions et le score d’immobilisation 4/8. Les preuves et limites de validation sont suivies dans la roadmap et le statut du projet. Il applique le cumul de fin de tour et l’influence locale décrits au point 9. Les anciens documents et journaux V9/V10/V11 restent des références historiques.

**1. Principe et matériel**

Deux joueurs, Joueur 1 puis Joueur 2, jouent alternativement et sans hasard. Ils cherchent le meilleur score par leur influence sur l’espace et l’immobilisation temporaire des pièces adverses. Aucune pièce n’est retirée par capture, convertie, ni reprise volontairement dans le stock. Les camps ne s’échangent pas après l’ouverture.

Une **intersection** est un croisement d’une ligne horizontale et d’une ligne verticale du quadrillage. C’est sur ces points que se posent les tuiles. Le plateau comporte 113 intersections jouables : les coordonnées entières `(x,y)` telles que `x² + y² ≤ 36`. Une intersection accueille au plus une tuile. Le plateau commence vide, sauf installation optionnelle nord/sud.

Chaque joueur possède douze tuiles : quatre de distance 1, quatre de distance 2 et quatre de distance 3. Les tuiles 1 et 2 portent des fleurs ; la tuile 3 porte un bateau bleu pour se distinguer des deux autres. Son déplacement reste de trois intervalles et elle conserve son rôle de tuile 3 dans les triangles. Les motifs des pièces et les couleurs décoratives du plateau n’ajoutent aucun pouvoir. Cette géométrie et cette répartition constituent la base reprise du prototype, sans prétention de restituer des règles canoniques du Pai Sho.

**2. Trois ressources distinctes et déroulement du tour**

| Ressource | Fonction |
|---|---|
| Stock de tuiles | Pièces non encore posées ; une pose retire une pièce du type choisi du stock. |
| Droit de pose | Au maximum une pose par tour normal, si le stock le permet. Ce droit ne se cumule pas. |
| Déplacements et report | Deux déplacements ordinaires par tour, avec au maximum un déplacement conservé ou emprunté selon la règle suivante. |

Une pose ne consomme aucun déplacement. Le report de déplacements ne finance jamais une pose supplémentaire. Une pièce immobilisée reste au plateau et ne renouvelle pas le stock.

Le joueur peut poser et déplacer dans l’ordre choisi. Il peut déplacer la pièce qu’il vient de poser, déplacer plusieurs pièces ou plusieurs fois la même. Il peut terminer après une pose seule ou un déplacement seul ; il doit avoir effectué au moins une de ces actions physiques. Passer volontairement sans agir est interdit.

Toute réaction sur les triangles est résolue avant l’action physique suivante ou la fin du tour. Déclarer ou refuser un triangle ne remplace pas l’action physique minimale du tour.

**3. Budget glissant de déplacements**

Deux déplacements sont ordinaires. Un tour ne peut jamais comporter plus de trois déplacements.

Un déplacement non consommé peut être conservé jusqu’à son utilisation, mais le report total est plafonné à **un**. Faire un seul déplacement pendant deux tours successifs ne constitue donc pas une réserve de deux mouvements. Faire deux déplacements laisse un report existant disponible.

Un troisième déplacement peut être financé par le report. Sans report, il est emprunté au prochain tour personnel, alors limité à un déplacement, sans nouvel emprunt pendant ce remboursement. Le plafond d’un report vaut également lorsque le joueur termine après une pose sans déplacement.

La formalisation comptable est : solde initial zéro ; `+1` pour un report, `−1` pour un emprunt à rembourser. À la fin d’un tour, `nouveau solde = min(1, ancien solde + 2 − déplacements effectués)`. Un solde négatif impose le plafond d’un déplacement ; sinon trois restent possibles au moyen du report ou de l’emprunt. Les poses n’entrent pas dans ce calcul.

| Solde avant | Déplacements effectués | Solde après |
|---:|---:|---:|
| 0 | 1 | +1 |
| +1 | 1 ou 2 | +1 |
| +1 | 3 | 0 |
| 0 | 3 | −1 |
| −1 | 1 | 0 |
| 0 ou +1 | 0, après une pose | +1 |
| −1 | 0, après une pose | +1 |

Cette formule explicite la lecture « report ou emprunt » du budget glissant. Elle remplace le plafond de deux du prototype. Le dernier tour personnel reste limité à un déplacement, quel que soit le solde.

**4. Poses et déplacements légaux**

Une pose exige une intersection libre, autorisée par les régions adverses actives et, si elle est activée, par l’option nord/sud. Le joueur doit encore posséder la tuile choisie et ne pas avoir posé ce tour.

Un déplacement suit une ligne droite dans l’une des huit directions horizontales, verticales ou diagonales. Il parcourt exactement le numéro de la tuile. Un pas diagonal entre intersections successives compte pour un intervalle. Aucun changement de direction ni arrêt intermédiaire n’est permis au sein d’un déplacement.

La destination et chaque intersection intermédiaire doivent appartenir au plateau et être libres de toute pièce. La destination doit être hors des régions adverses actives ; les intersections intermédiaires peuvent en faire partie. Une pièce immobilisée ne peut pas partir. Aucun saut au-dessus d’une autre pièce n’est autorisé.

Une tuile « 2 » ou « 3 » peut donc sauter au-dessus d’une ou plusieurs intersections couvertes par une région adverse active, à condition de respecter sa portée exacte et d’atterrir au-delà, sur une intersection autorisée. Une tuile « 1 » n’a aucune intersection intermédiaire et ne peut donc pas sauter au-dessus d’une intersection. Elle peut toutefois, comme les autres tuiles, traverser la surface d’une région entre deux intersections autorisées : le seul croisement de surfaces ou de traits ne bloque rien. Ses propres régions restent traversables sous les contraintes habituelles.

**5. Définition et déclaration des triangles**

Trois tuiles non alignées d’un même camp, exactement une de chaque numéro 1, 2 et 3, peuvent délimiter une région. Elle doit couvrir de une à cinq intersections, intérieur et côtés compris, libres ou occupées, hors des trois sommets. À zéro point ou à partir de six points, elle est invalide.

Un triangle simplement possible ne produit aucun effet. Son propriétaire choisit de le déclarer ou de refuser, même avec une seule possibilité. Aucune sélection automatique par proximité ou compacité ne remplace ce choix.

Un nouveau triangle doit être actif au terme de sa déclaration et de la résolution de ses effets. Il ne peut pas naître suspendu. Un triangle réellement déclaré auparavant peut en revanche être conservé lorsqu’il devient suspendu.

Un joueur peut avoir au maximum quatre triangles actifs. Une pièce d’un triangle actif ne peut participer à aucun autre triangle. Les pièces d’un triangle suspendu peuvent être réutilisées dans un nouveau triangle, par remplacement supprimant entièrement l’ancien triangle selon le point 7. Le nombre de déclarations successives dans un tour n’est pas limité.

**6. Effets, suspension et réactivation**

Une région active interdit à l’adversaire les poses et les arrivées sur ses intersections couvertes. Le franchissement au-dessus de ces intersections reste permis selon la portée de la tuile et les contraintes de déplacement décrites au point 4. Une pièce adverse déjà présente est immobilisée et reste au plateau. Les pièces du propriétaire peuvent circuler dans ses propres régions. Deux régions adverses peuvent se recouvrir.

Si une région active retient un sommet d’un triangle adverse déclaré, ce triangle entier est suspendu. Il ne bloque plus de point et n’immobilise plus de pièce. Ses prisonnières sont libérées, sauf si une autre région active les retient.

Lorsque plus aucune région adverse active ne retient ses sommets, un triangle déclaré encore présent se réactive. Exemple : B suspend A ; C suspend B ; A reprend ses effets. Une pièce sortie de A pendant sa suspension n’est pas ramenée à son ancienne place.

Un recouvrement ne suffit pas à suspendre un triangle : il faut qu’un sommet soit retenu. Une boucle due à des suspensions réciproques relève de la défaite par boucle. Aucune neutralisation automatique des deux régions n’est ajoutée au règlement demandé.

**7. Disparition, remplacement et refus**

Déplacer un sommet fait disparaître le triangle de l’ancien arrangement. Les nouvelles formations possibles suivent les mêmes règles de choix et de validité.

Les pièces d’une région suspendue peuvent être réutilisées pour former un nouveau triangle admissible. Ce remplacement reste facultatif. Il supprime entièrement l’ancienne région, y compris sa possibilité de réactivation ; ses autres sommets cessent aussi de lui appartenir. Si la nouvelle formation réutilise les pièces de plusieurs régions suspendues, chacune de ces anciennes régions disparaît entièrement. Une pièce peut donc changer de triangle, mais ne peut jamais appartenir simultanément à deux triangles déclarés. Les pièces d’une région encore active ne peuvent pas être réutilisées de cette manière.

Un triangle refusé ne peut pas être reproposé à répétition dans la même disposition. Un déplacement de sommet permet un nouveau choix. Un sommet potentiel immobilisé puis libéré peut également rouvrir ce choix, même sans déplacement des sommets.

**8. Réactions et boucles**

Après chaque pose, mouvement ou décision de triangle, les conséquences sur les formations sont traitées avant la poursuite des actions physiques. Chaque propriétaire décide de ses triangles, même pendant le tour adverse. Ces choix ne consomment ni pose, ni déplacement, ni tour ; le joueur principal reprend ensuite ses possibilités restantes.

**Le joueur qui initie une boucle perd immédiatement la partie, quel que soit le score.** Cela inclut les boucles provoquées par des suspensions réciproques. La sanction vise l’initiateur ; elle ne doit pas être remplacée par une règle désignant systématiquement le dernier décideur d’une séquence sans établir qu’il en est l’initiateur.

Une boucle est un retour de la résolution des formations à une situation déjà rencontrée : suspensions, réactivations ou reformations se reproduisent au lieu d’aboutir à un état stable. Une chaîne qui se stabilise n’est pas une boucle ; un simple croisement de triangles non plus.

Pour suivre cette règle dans le moteur, les triangles survivants conservent leur activité précédente, puis les suspensions et réactivations se propagent simultanément jusqu’à stabilisation. Une dépendance réciproque déjà stable ne crée aucune boucle. Si cette propagation répète ses états, l’action qui l’a déclenchée en identifie l’initiateur. Pour une suite de décisions qui revient à une configuration déjà rencontrée, l’initiateur est l’auteur de la première décision du segment qui se répète, pas celui qui le clôt. Cette configuration tient compte des déclarations, des refus, de l’activité des triangles et du prochain décideur.

L’exemple A suspendu par B puis libéré par C est une chaîne normale. L’ancien exemple informatique déclarant directement des triangles suspendus est incompatible avec les règles actuelles et ne prouve pas une boucle légale.

**9. Score**

Le score instantané du plateau additionne l’influence sur les intersections vides et les points d’immobilisation décrits ci-dessous. Le score de la partie est désormais le **cumul des écarts relevés à la fin de chaque tour complet d’un joueur**, après toutes les réactions. Ce cumul remplace le seul score de la position finale (règle confirmée le 27 septembre 2026).

Si le plateau vaut 40 pour Joueur 1 et 42 pour Joueur 2, on ajoute 2 points au cumul d’Joueur 2 et zéro à celui de Joueur 1. Si cet écart persiste pendant trois tours, Joueur 2 reçoit 6 points. À égalité, aucun camp ne reçoit de points. On additionne les écarts présents, pas leurs variations entre deux positions. Les poses, déplacements et décisions de triangle d’un même tour ne déclenchent pas de versements individuels. La fin automatique d’un tour compte exactement comme une fin volontaire.

Les deux cumuls commencent à zéro. Les nouvelles parties ne donnent aucun avantage initial. Les anciens journaux avec compensation restent relisibles : leur compensation est créditée **une seule fois au départ**, hors des écarts du plateau. L’interface conserve le détail du plateau en plus du cumul. L’installation gratuite nord/sud et ses réactions ne rapportent pas de points au cumul.

Chaque pièce exerce **une influence sur les huit intersections immédiatement voisines**, horizontalement, verticalement et en diagonale : le carré 3×3 centré sur elle, sans son centre. Aux bords, seules les intersections du plateau comptent. Les tuiles 1, 2 et 3 ont toutes la même portée et la même force d’influence, même immobilisées. L’influence ne se propage pas au-delà de ce voisinage.

Sur chaque **intersection vide**, on compte séparément les pièces voisines de Joueur 1 et d’Joueur 2. Le camp strictement majoritaire reçoit **un point de plateau pour cette intersection**, quel que soit son avantage numérique. Un soutien de 1 contre 1 est neutre ; 2 contre 1 donne un point au camp ayant deux voisines ; 2 contre 2 redevient neutre. Sans pièce voisine, l’intersection est également neutre. Une intersection occupée ne rapporte aucun point d’influence, quel que soit le propriétaire de la pièce qui l’occupe. Les régions ne renforcent ni ne bloquent cette influence ; elles conservent leurs effets sur les déplacements et les immobilisations.

Chaque pièce adverse immobilisée rapporte **4 points**. Chaque triangle adverse déclaré dont au moins un sommet est immobilisé rapporte **un bonus unique de 4 points**, même si ce triangle est suspendu. Ainsi, le premier sommet immobilisé d’un triangle vaut 8 points au total ; les autres sommets immobilisés de ce même triangle valent chacun 4 points. Le bonus appartient au triangle adverse distinct, et non à chaque sommet ni à chaque région qui le retient.

Deux sommets immobilisés du même triangle rapportent 12 points ; trois, 16 points. Deux sommets de deux triangles adverses différents rapportent 16 points ; trois sommets de trois triangles différents, 24 points, même s’ils sont tous retenus par une seule région. La règle est symétrique. Chaque pièce et chaque bonus de triangle ne comptent qu’une fois, même avec plusieurs régions qui les retiennent. Un simple candidat ne donne pas de bonus ; l’appartenance passée à un triangle disparu n’en donne pas non plus. Une seule pièce ne peut pas être le sommet commun de plusieurs triangles déclarés : ce cas est interdit par la règle d’appartenance unique.

La surface des triangles et les points qu’ils couvrent ne rapportent rien. La limite géométrique de cinq reste applicable à leur validité.

**10. Durée et résultat**

La durée choisie avant la partie est de 15, 20, 30, 50 ou 70 tours **par joueur**. Les différentes actions et réactions d’un même tour ne constituent pas autant de tours supplémentaires.

Au dernier tour personnel de chaque camp, un déplacement au maximum est permis, quel que soit le report. Une pose reste disponible indépendamment, si le stock le permet. Les réactions sont résolues avant le décompte. Les pièces en stock et les mouvements inutilisés ne rapportent aucun point.

À la limite de tours, le score cumulé le plus élevé gagne ; une égalité donne une partie nulle.

**Si un seul joueur est entièrement bloqué, on procède au décompte : le score cumulé décide du résultat. Si aucun des deux joueurs ne peut jouer, la partie est nulle, indépendamment du score.** Être entièrement bloqué signifie n’avoir aucune pose ni aucun déplacement légal, après résolution des réactions. Le simple fait d’avoir consommé ses quotas du tour ne constitue pas un blocage : les possibilités doivent être appréciées pour un tour disponible. Les choix de triangles ou le bouton de fin de tour ne sont pas des déplacements permettant d’échapper artificiellement au blocage.

Si un blocage termine la partie pendant un tour qui a déjà comporté une pose ou un déplacement, ce tour est clos après les réactions et son écart est compté une seule fois. Une position de début de tour déjà comptée ne donne pas un second versement. Une défaite par boucle ne déclenche pas de versement supplémentaire.

La dernière correction précise qu’un joueur entièrement bloqué ne perd que si le score le dit : il ne subit donc pas de défaite automatique. La nullité lorsque les deux camps sont bloqués conserve sa priorité sur le décompte. La défaite par boucle prime également sur le score.

**11. Option nord/sud et installation**

Cette option est désactivée par défaut. Si elle est activée, on choisit l’hémisphère de Joueur 1 ; Joueur 2 prend l’autre. Les poses restent limitées à son hémisphère pendant toute la partie. La ligne centrale `y=0` est commune. Les déplacements peuvent la franchir sous les contraintes habituelles.

Avant le premier tour normal, Joueur 1 puis Joueur 2 peuvent poser en alternance, gratuitement, de zéro à quatre pièces de leur choix dans leur zone. Elles sont prises dans leurs douze tuiles. Chacun peut terminer son installation plus tôt ; l’autre peut alors poursuivre seul jusqu’à quatre pièces.

L’installation ne consomme ni tour normal ni déplacement. Ses poses déclenchent les réactions habituelles. Après leur résolution et la fin des deux installations, Joueur 1 commence le premier tour ordinaire avec son droit de pose et son budget de déplacements.

**12. Provenance et mise en œuvre**

Les dernières consignes utilisateur priment sur l’ancien document du bot et sur le code. La version concurrente a servi de liste de contrôle, pas d’autorité. Le plateau, les huit directions, la répartition quatre/quatre/quatre proviennent de la base reprise dans la discussion. L’influence locale majoritaire et le bateau bleu suivent la demande du 27 septembre 2026. Le franchissement des régions, le report d’un seul mouvement, la sanction de l’initiateur d’une boucle et les deux cas de blocage suivent les dernières précisions.

L’interprétation opérationnelle de l’initiateur et la propagation des effets sont explicitées au point 8. Les réactions proposées sont traitées en commençant par l’auteur de l’action physique, puis l’autre camp ; chaque propriétaire conserve la décision sur ses formations. Les déclarations remplacées sont supprimées et ne se réactivent pas automatiquement. Une nouvelle formation qui finirait suspendue ou dont la résolution ne se stabiliserait pas n’est pas déclarable : la règle de naissance active continue à s’appliquer. Les limites des exemples de boucles disponibles restent explicites dans le rapport d’alignement.
