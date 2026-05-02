# OnePixelOkGoGo

> one-pixel-ok-gogo overlay & smart guides — right inside your browser.

[English](README-en.md) · [繁體中文](README-zh-TW.md) · [日本語](README-ja.md) · [Français](README-fr.md)


> **Superposez votre maquette design directement sur la page live, ajustez pixel par pixel. Plus jamais basculer entre Figma et Chrome.**

![Hero](../screenshots/hero.png)

---

## Pourquoi ?

Vous connaissez la routine — le designer dit « 2px de travers », « l'espacement est faux », « la police a légèrement bougé ».
Cette extension vous permet de **superposer la maquette design directement sur la page live**, puis d'ajuster pixel par pixel jusqu'à la correspondance parfaite.

| Problème | Solution |
|------|------|
| Basculer entre Figma et Chrome | **Couches semi-transparentes directement sur la page** |
| L'espacement n'est pas un multiple de 8 ? | **Déposez deux guides, l'espacement s'affiche automatiquement** |
| Aligner plusieurs régions | **Plusieurs couches, affichage/verrouillage indépendant** |
| Trop de clics pour ajuster | **Flèches directionnelles 1px / 10px** |

## Fonctionnalités

### 1. Couches — superposer les maquettes

![Layers](../screenshots/layers.png)

- Upload / collage / glisser-déposer jusqu'à 50 fichiers image
- Opacité, échelle, X/Y en temps réel
- **Snap 5 directions** : haut / bas / gauche / droite / centre par rapport au viewport
- **Drag + flèches** pour ajuster (1px ou Shift+10px)
- **Afficher / Verrouiller / Supprimer** par couche

### 2. Guides — mesurer l'espacement

![Guides](../screenshots/guides.png)

- Ajouter des guides **horizontaux ou verticaux** en un clic
- **Drag** n'importe où sur le viewport
- **Label d'espacement auto** entre guides sur le même axe
- Style global : largeur / style (tirets / continu / pointillé / double) / couleur
- Toggle **Afficher / Verrouiller** pour éviter les accidents

### 3. Panneau flottant

![Panel](../screenshots/panel.png)

- **Sidebar draggable injectée** dans la page
- Deux onglets : **Layers** & **Guides**
- Déplaçable pour ne pas gêner

## Raccourcis

| Touche | Action |
|-----|--------|
| **⌥⌘S / Alt+Ctrl+S** (onglet Guides) | Toggle affichage des guides |
| **⌥⌘C / Alt+Ctrl+C** (onglet Guides) | Toggle verrouillage des guides |
| **⌥S / Alt+S** | Toggle affichage de la couche active |
| **⌥C / Alt+C** | Toggle verrouillage de la couche active |
| **↑ ↓ ← →** | Déplacer la couche de 1px |
| **Shift + ↑↓←→** | Déplacer la couche de 10px |

## Installation

> Disponible sur le Chrome Web Store — installez en un clic :

[**OnePixelOkGoGo — Chrome Web Store**](https://chromewebstore.google.com/detail/onepixelokgogo/mgojihpngfjnhidaeoeedjbkcegddcdc)

Ou charger comme extension décompactée :

1. Téléchargez / clonez ce repo
2. Ouvrez Chrome → `chrome://extensions`
3. Activez le **Mode développeur** (en haut à droite)
4. Cliquez sur **Charger l'extension non compactée** → sélectionnez le dossier du projet
5. Épinglez l'icône à votre barre d'outils

## Démarrage rapide

1. Cliquez sur l'icône **OnePixelOkGoGo** → le panneau flottant apparaît
2. Dans l'onglet **Layers**, collez / glissez la maquette design
3. Mettez l'opacité à 50%, utilisez ↑↓←→ pour aligner avec la page
4. Passez à l'onglet **Guides**, cliquez sur "+ Horizontal", drag jusqu'à l'emplacement souhaité
5. Ajoutez-en un autre — **l'espacement entre eux s'affiche automatiquement**

![Quickstart](../screenshots/quickstart.gif)

## À qui s'adresse-t-il ?

- **Développeurs frontend** — alignement de design, locale, QA responsive
- **Designers UI/UX** — QA visuelle contre le spec design
- **Ingénieurs QA** — diff de screenshot, reproduction de bugs de régression visuelle
- **Éditeurs de contenu** — vérifier la mise en page et les marges

## Feuille de route

- [ ] Groupes de guides (nommés, commutables)
- [ ] Import / export de préréglages de guides
- [ ] Verrouiller le ratio d'aspect de la couche
- [ ] Alignement snap-to-guide
- [x] Publication sur le Chrome Web Store

## Support / Don

Si ça vous a fait gagner du temps, un café maintient le projet vivant 🙏

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/P5P01YOURH)

## Feedback

Issues / PRs / DM les bienvenus.

---

[← Retour au README principal](README.md)