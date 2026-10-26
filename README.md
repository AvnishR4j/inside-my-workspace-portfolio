# Inside My Workspace

An interactive portfolio for Avnish Raj, built with React, TypeScript, Vite, and Three.js.

Live site: https://avnish-workspace.vercel.app

The local checkout is linked to the Vercel project `avnish-workspace`. Publish future changes with `vercel deploy --prod --scope avnishr4js-projects`.

## Run

```sh
npm install
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173. `npm run build` creates the static production site in `dist/`. The project is compatible with Vercel's Vite preset (build command `npm run build`, output directory `dist`). No API keys or backend are required.

## The experience

- An actual WebGL room with a wooden desk, laptop, camera, book, plants, chair, lighting, and personal photography.
- Click an object or its label to move between the desk, engineering, photography, and sketch views.
- Camera transitions use smooth acceleration/deceleration and a slight vertical arc. They can be interrupted by another navigation action.
- The book has a subdivided 3D surface that bends during page turns. Drag/swipe horizontally, use the previous/next controls, or use the left/right arrow keys.
- Every photograph and sketch can be opened at full size in an accessible modal gallery.
- Project details link to the original repositories and live demos. About, résumé, and contact are accessible from the navigation.
- Motion reduction and lamp controls are in the footer. OS reduced-motion preferences are respected.
- Native dialogs manage focus, Escape, and background interaction. Normal navigation and galleries remain usable if WebGL cannot initialize.

## Content

- `src/content.ts`: project descriptions, repository/demo links, photo and sketch order.
- `public/assets/photography/`: 14 original photos recovered from the existing public portfolio.
- `public/assets/sketches/`: 14 original sketches recovered from the existing public portfolio.
- `public/assets/Avnish_Raj_Software_Engineer_Resume.pdf`: original résumé.
- `public/assets/source.json`: original source URL and recovered asset list.

The images are Avnish's existing work, not generated substitutes. The only generated decorative image is the isolated pothos leaf texture; its prompt and the other asset credits are in `public/assets/materials/LICENSE.md`.

## Scene and design

- `src/scene.ts`: Three.js scene, object construction, imported plant model, camera poses, pointer picking, page deformation, and rendering lifecycle.
- `src/materials.ts`: paper, terminal, keyboard, and book-spine textures.
- `src/App.tsx`: navigation, project dialogs, artwork gallery, and accessible controls.
- `src/styles.css`: responsive typography, panels, overlays, and transitions.

The supplied three-panel image is the art-direction reference. This implementation reconstructs that concept as a real, navigable scene; it is not a pixel-identical reproduction of the generated room image. Custom prop geometry and lighting can be refined independently of the functioning interactions.

## Performance

The Three.js scene is loaded separately from the interface. Repeated static geometry is batched, pixel density is capped, and shadow maps are reused until a page moves. Rendering pauses when the tab is hidden. On consistently slow frames, the renderer reduces pixel density and disables the ambient-occlusion pass. Book textures load as needed and preload the next spread. All scene geometry, textures, event listeners, and render targets are disposed when the scene unmounts.

## Verification

The production TypeScript/Vite build is the primary static check. Browser checks cover desktop and phone layouts, project dialogs, full-size galleries, forward/back page controls, drag-to-turn, reverse drag, and runtime logs. See `QA.md` for the recorded checks and limitations.
