# Portfolio · Muhammad Ridha Agam

An interactive 3D desk portfolio, plus a blog. It is a plain static site, so it runs on GitHub Pages with no build step.

## What's here

```
index.html            the 3D desk (start page)
blog/index.html       the blog
blog/unireflow.html   post: One step instead of twenty-five
blog/edge-airports.html  post: Keeping computer vision running at 18+ airport sites
blog/duodiffcount.html   post: Two frozen backbones for crowd counting
assets/three.min.js   three.js r160 (3D engine)
assets/desk-scene.js  the desk scene: models, camera moves, screen, keyboard
assets/dc-lite.js     small runtime for the desk page's panels and pop-ups
assets/favicon.svg
404.html              "page not found"
.nojekyll             tells GitHub Pages to serve the files as they are
```

## Put it online with GitHub Pages

### Option A: in the browser (no tools needed)

1. Sign in at github.com, click **+** (top right) → **New repository**.
2. Repository name: `ridhaagam.github.io` gives you `https://ridhaagam.github.io/`. Any other name, for example `portfolio`, gives `https://ridhaagam.github.io/portfolio/`. Set it to **Public**, then **Create repository**.
3. On the empty repository page, click **uploading an existing file**.
4. Drag in everything inside this folder: `index.html`, `404.html`, `README.md`, and the `assets` and `blog` folders. Leave out the `.log` files. Click **Commit changes**.
5. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
6. Wait about a minute and refresh the Pages settings: it shows "Your site is live at …". That link works on any computer, phone or iPad.

### Option B: from a terminal

```sh
cd /home/agam/portofolio
git init
git add .
git commit -m "Portfolio site"
git branch -M main
git remote add origin https://github.com/ridhaagam/<repository-name>.git
git push -u origin main
```

Then do step 5 above. Every later `git push` updates the live site within a minute or two.

## Phones and iPads

- The same link works everywhere. Tap objects on the desk, or use the buttons along the bottom to jump to a section.
- On phones and iPads in portrait, sections open as a sheet from the bottom; in landscape they open on the side.
- On iPhone or iPad, open the link in Safari, tap **Share → Add to Home Screen** to keep it like an app.
- Phones use lighter 3D settings automatically so the desk stays smooth.

## Try it locally

The desk needs to be served over http (not opened as a file) for the blog pop-up to work:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Editing

- **Blog text:** edit the post files in `blog/`. Sections still marked `[Write this section…]` are waiting for your own words.
- **Dates:** the post dates (15 July, 20 August and 8 September 2026) are set in each post page, on the blog cards in `blog/index.html`, and in the blog pop-up inside `index.html`. Change them in all three places.
- **Add a post:** copy one of the post files, change its text, then add a card for it to `blog/index.html`.
