import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, ChevronLeft, ChevronRight, Code2, Download, Expand, ExternalLink, Github, Grid2X2, LampDesk, Mail, Monitor, Pause, PencilLine, Play, Sparkles, X } from 'lucide-react';
import { artPath, photoNames, projects, sketchNames, titleCase, type View } from './content';
import type { Insets, WorkspaceScene } from './scene';

type Modal = { type: 'project'; id: string } | { type: 'gallery'; kind: 'photography' | 'sketches'; index: number } | { type: 'about' | 'contact' } | null;
const views: View[] = ['desk', 'work', 'photography', 'sketches'];
const readView = (): View => { const hash = location.hash.slice(1); return views.includes(hash as View) ? hash as View : 'desk'; };
const projectIcons = [Sparkles, Code2, Grid2X2, Monitor];

// These queries mirror the layout modes in styles.css (portrait, compact landscape, everything else).
const PORTRAIT = '(max-aspect-ratio: 85/100)';
const COMPACT = '(min-aspect-ratio: 85/100) and (max-height: 620px)';
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** How much of the screen the interface covers, so the 3D room can be framed in the space that is left. */
function measureInsets(root: HTMLElement, state: { exploring: boolean; studio: boolean }): Insets {
  const portrait = matchMedia(PORTRAIT).matches, compact = !portrait && matchMedia(COMPACT).matches;
  if (!portrait && !compact) return NO_INSETS;
  const box = root.getBoundingClientRect();
  const rect = (selector: string) => { const el = root.querySelector(selector); return el ? el.getBoundingClientRect() : null; };
  const header = Math.max(rect('.header')?.bottom ?? 0, rect('.back-link')?.bottom ?? 0) - box.top;
  const footer = rect('.footer'), controls = rect('.book-controls'), note = rect('.explore-note');
  const bottomEdge = (state.exploring && note ? note.top : state.studio && controls ? controls.top : footer ? footer.top : box.bottom) - box.top;
  const bottom = Math.max(0, box.height - bottomEdge + 8);
  if (portrait) {
    const mark = state.exploring ? null : rect('[data-inset="top"]');
    return { top: Math.max(header + 8, mark ? mark.bottom - box.top + 10 : 0), right: 0, bottom, left: 0 };
  }
  const panel = state.exploring ? null : rect('.content-panel');
  return { top: header + 6, right: 0, bottom, left: panel ? (panel.right - box.left) * .5 : 0 };
}

export default function App() {
  const [view, setView] = useState<View>(readView);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [lamp, setLamp] = useState(true);
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [exploring, setExploring] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<WorkspaceScene | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useCallback((next: View) => {setExploring(false); setView(next); setPage(0); scene.current?.navigate(next); if (location.hash !== `#${next}`) history.pushState(null, '', `#${next}`);}, []);
  const isStudio = view === 'photography' || view === 'sketches';
  const syncInsets = useRef(() => {});
  syncInsets.current = () => { if (root.current) scene.current?.setInsets(measureInsets(root.current, { exploring, studio: isStudio })); };

  useEffect(() => {
    let cancelled = false;
    import('./scene').then(({ WorkspaceScene }) => {
      if (cancelled || !host.current) return;
      try {
        scene.current = new WorkspaceScene(host.current, { onNavigate: navigate, onReady: () => setReady(true), onPage: setPage, onError: () => {setFailed(true); setReady(true);} });
        scene.current.navigate(readView()); syncInsets.current();
      } catch (error) {console.error('Unable to initialize the workspace', error); setFailed(true); setReady(true);}
    }).catch(() => {setFailed(true); setReady(true);});
    return () => {cancelled = true; scene.current?.dispose(); scene.current = null;};
  }, [navigate]);
  useEffect(() => {scene.current?.setMotion(motion);}, [motion]);
  useEffect(() => {scene.current?.setLamp(lamp);}, [lamp]);
  useEffect(() => {
    syncInsets.current();
    const el = root.current; if (!el) return;
    const update = () => syncInsets.current();
    const observer = new ResizeObserver(update);
    el.querySelectorAll('.content-panel, .header, .footer, .book-controls, .explore-note, [data-inset]').forEach(node => observer.observe(node)); observer.observe(el);
    document.fonts?.ready.then(update);
    return () => observer.disconnect();
  }, [view, exploring, ready, failed]);
  useEffect(() => {
    const pop = () => {const next = readView(); setExploring(false); setView(next); scene.current?.navigate(next); setModal(null);}; window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    const el = dialog.current; if (!el) return;
    if (modal && !el.open) el.showModal(); else if (!modal && el.open) el.close();
  }, [modal]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (modal || !isStudio || (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
      if (event.key === 'ArrowRight') {event.preventDefault(); scene.current?.turnPage(1);}
      if (event.key === 'ArrowLeft') {event.preventDefault(); scene.current?.turnPage(-1);}
    }; window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, [modal, isStudio]);

  const selectedProject = modal?.type === 'project' ? projects.find(p => p.id === modal.id) : null;
  const galleryNames = modal?.type === 'gallery' ? (modal.kind === 'photography' ? photoNames : sketchNames) : [];

  return <div ref={root} className={`workspace view-${view} ${exploring ? 'exploring' : ''} ${ready ? 'is-ready' : ''} ${motion ? '' : 'motion-off'} ${failed ? 'scene-unavailable' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => {event.preventDefault(); document.getElementById('main-content')?.focus();}}>Skip to content</a>
    <div ref={host} className="scene" data-testid="workspace-scene" />
    <div className="scene-shade" aria-hidden="true" />
    <div className="grain" aria-hidden="true" />

    <header className="header">
      <button className="brand" onClick={() => navigate('desk')} aria-label="Avnish Raj — back to desk">AR<span>.</span></button>
      <nav aria-label="Main navigation">
        <button aria-current={view === 'work' ? 'page' : undefined} onClick={() => navigate('work')}>Work</button>
        <button aria-current={isStudio ? 'page' : undefined} onClick={() => navigate('sketches')}>Studio</button>
        <button onClick={() => setModal({ type: 'about' })}>About</button>
        <button onClick={() => setModal({ type: 'contact' })}>Contact</button>
      </nav>
      {view === 'desk' && !exploring ? <a className="resume-link" href="/assets/Avnish_Raj_Software_Engineer_Resume.pdf" target="_blank" rel="noreferrer">Résumé <Download size={13} /></a> : <button className="back-link" onClick={() => navigate('desk')}><ArrowLeft size={15} /> Back to desk</button>}
    </header>

    {!ready && <div className="loading" role="status"><span className="loading-mark">AR.</span><div className="loading-line" /><p>Opening the workspace<span>One room. A few different sides of me.</span></p></div>}

    <main id="main-content" tabIndex={-1}>
      <div className="view-content" key={view}>
        {view === 'desk' && <section className="intro content-panel" aria-labelledby="hero-title">
          <div className="eyebrow">Avnish Raj <span>/</span> Software Engineer & Creative</div>
          <h1 id="hero-title">Step into<br />my workspace<span>.</span></h1>
          <p className="intro-line">Code. Capture. Create.</p>
          <p className="description">A curious mind at the intersection<br className="desktop-break" /> of engineering and art.</p>
          <div className="hero-actions" data-inset="top"><button className="button primary" onClick={() => {if (failed) {navigate('work'); return;} setExploring(true); scene.current?.explore();}}>Explore the desk <ArrowRight size={17} /></button><button className="text-button" onClick={() => navigate('work')}><Grid2X2 size={15} /> View projects</button></div>
          <div className="small-note"><span /> A little of what I build. A little of how I see.</div>
        </section>}

        {view === 'work' && <section className="work-panel content-panel" aria-labelledby="work-title">
          <div className="eyebrow"><Code2 size={15} /><span>/</span> Engineering</div>
          <h1 id="work-title">Things I build<span>.</span></h1>
          <p className="description" data-inset="top">Turning ideas into useful, real-world tools.<br />From developer productivity to intelligent systems.</p>
          <div className="project-list">{projects.map((project, i) => {const Icon = projectIcons[i]; return <button className="project-card" key={project.id} onClick={() => setModal({ type: 'project', id: project.id })}>
            <span className="project-icon" style={{ '--project-color': project.color } as React.CSSProperties}><Icon size={24} strokeWidth={1.5} /></span>
            <span><strong>{project.name}</strong><small>{project.short}</small></span><span className="project-arrow"><ChevronRight size={17} /></span>
          </button>;})}</div>
          <a className="understated-link" href="https://github.com/AvnishR4j" target="_blank" rel="noreferrer"><Github size={14} /> More experiments on GitHub <ExternalLink size={12} /></a>
        </section>}

        {isStudio && <section className="studio-panel content-panel" aria-labelledby="studio-title">
          <div className="eyebrow"><PencilLine size={15} /><span>/</span> Creativity</div>
          <h1 id="studio-title">Away from<br />the terminal<span>.</span></h1>
          <p className="description">Sketches, photographs and quiet moments<br />that keep me curious.</p>
          <div className="studio-tabs" role="group" aria-label="Studio collection">
            <button aria-pressed={view === 'photography'} onClick={() => navigate('photography')}><Camera size={15} /> Photography</button>
            <button aria-pressed={view === 'sketches'} onClick={() => navigate('sketches')}><PencilLine size={15} /> Sketches</button>
          </div>
          <button className="understated-link gallery-button" data-inset="top" onClick={() => setModal({ type: 'gallery', kind: view as 'photography' | 'sketches', index: page * 2 })}><Grid2X2 size={14} /> Open collection <ExternalLink size={12} /></button>
        </section>}
      </div>

      {exploring && <div className="explore-note"><span>A FEW DIFFERENT SIDES OF ME</span><p>Pick something that makes you curious.</p></div>}

      {view === 'desk' && ready && !failed && <div className="hotspots" aria-label="Explore objects on the desk">
        <button data-anchor="laptop" onClick={() => navigate('work')}><Monitor size={14} /><span>Engineering</span><span className="hotspot-dot" /></button>
        <button data-anchor="camera" onClick={() => navigate('photography')}><Camera size={14} /><span>Photography</span><span className="hotspot-dot" /></button>
        <button data-anchor="book" onClick={() => navigate('sketches')}><PencilLine size={14} /><span>Sketches</span><span className="hotspot-dot" /></button>
      </div>}

      {isStudio && !failed && <div className="book-controls">
        <div className="book-caption"><span>{view === 'sketches' ? 'THE SKETCHBOOK' : 'THROUGH MY LENS'}</span><strong aria-live="polite">{titleCase((view === 'sketches' ? sketchNames : photoNames)[page * 2])}</strong></div>
        <div className="page-controls"><button aria-label="Previous pages" disabled={page === 0} onClick={() => scene.current?.turnPage(-1)}><ChevronLeft size={19} /></button><span aria-live="polite">{String(page + 1).padStart(2, '0')} <i>/</i> 07</span><button aria-label="Next pages" disabled={page === 6} onClick={() => scene.current?.turnPage(1)}><ChevronRight size={19} /></button><span className="control-divider" /><button aria-label="View artwork full size" onClick={() => setModal({ type: 'gallery', kind: view as 'photography' | 'sketches', index: page * 2 })}><Expand size={17} /></button></div>
        <small>Drag a page to turn it. Take your time.</small>
      </div>}

      {failed && <section className="fallback"><p>The interactive room isn’t available on this device. You can still explore everything here.</p><div>{(view === 'sketches' ? sketchNames : photoNames).slice(0, 6).map((name, index) => <button key={name} onClick={() => setModal({ type: 'gallery', kind: view === 'sketches' ? 'sketches' : 'photography', index })}><img src={artPath(view === 'sketches' ? 'sketches' : 'photography', name)} alt={titleCase(name)} /></button>)}</div></section>}
    </main>

    <footer className="footer">
      <div className="location"><span className="footer-dot" /> Made of curiosity <span className="footer-separator">/</span> Based in India</div>
      <nav className="chapter-nav" aria-label="Workspace chapters">
        <button className={view === 'desk' ? 'active' : ''} onClick={() => navigate('desk')}><span>01</span> <b className="full">The desk</b><b className="short">Desk</b></button><span className="chapter-line" />
        <button className={view === 'work' ? 'active' : ''} onClick={() => navigate('work')}><span>02</span> <b className="full">Engineering</b><b className="short">Work</b></button><span className="chapter-line" />
        <button className={isStudio ? 'active' : ''} onClick={() => navigate('sketches')}><span>03</span> <b className="full">The studio</b><b className="short">Studio</b></button>
      </nav>
      <div className="settings"><button aria-label={lamp ? 'Dim desk lamp' : 'Turn on desk lamp'} aria-pressed={lamp} onClick={() => setLamp(!lamp)}><LampDesk size={17} /></button><button aria-label={motion ? 'Reduce motion' : 'Enable full motion'} aria-pressed={!motion} onClick={() => setMotion(!motion)}>{motion ? <Pause size={15} /> : <Play size={15} />}</button></div>
    </footer>

    <dialog className={`modal ${modal?.type === 'gallery' ? 'gallery-modal' : ''}`} aria-label={modal?.type === 'gallery' ? 'Artwork collection' : selectedProject?.name ?? (modal?.type === 'about' ? 'About Avnish Raj' : 'Contact Avnish Raj')} ref={dialog} onCancel={() => setModal(null)} onClick={e => {if (e.target === e.currentTarget) setModal(null);}}>
      <button className="close-modal icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><X size={21} /></button>
      {selectedProject && <article className="project-detail"><span className="eyebrow">{selectedProject.category}</span><h2>{selectedProject.name}</h2><p className="lead">{selectedProject.description}</p><div className="detail-rule" /><h3>Behind the build</h3><p>{selectedProject.detail}</p><div className="tags">{selectedProject.stack.map(s => <span key={s}>{s}</span>)}</div><div className="detail-actions"><a className="button primary" href={selectedProject.github} target="_blank" rel="noreferrer"><Github size={17} /> Explore the code</a>{selectedProject.demo && <a className="button secondary" href={selectedProject.demo} target="_blank" rel="noreferrer">Live project <ExternalLink size={16} /></a>}</div></article>}
      {modal?.type === 'about' && <article className="project-detail"><span className="eyebrow">THE PERSON BEHIND THE DESK</span><h2>Hi, I’m Avnish.</h2><p className="lead">I build software with purpose, and make space for creativity along the way.</p><p>I’m a B.Tech Computer Science student at Thapar Institute of Engineering & Technology. My work spans AI systems, developer tools, and full-stack applications.</p><p>TypeScript, Python, React, Next.js, cloud integrations, automated testing, and secure application design are part of my everyday toolkit. Photography and sketching shape how I observe and communicate.</p><p>I’m looking for software engineering internships and thoughtful collaborations.</p><a className="button primary" href="/assets/Avnish_Raj_Software_Engineer_Resume.pdf" target="_blank" rel="noreferrer"><Download size={16} /> View my résumé</a></article>}
      {modal?.type === 'contact' && <article className="project-detail"><span className="eyebrow">LET’S MAKE SOMETHING MATTER</span><h2>Pull up a chair.</h2><p className="lead">An interesting project, an internship opportunity, or a conversation about something you’re building—I’d love to hear it.</p><a className="contact-email" href="mailto:avnish9569@gmail.com">avnish9569@gmail.com <Mail size={21} /></a><div className="social-links"><a href="https://github.com/AvnishR4j" target="_blank" rel="noreferrer">GitHub <ExternalLink size={14} /></a><a href="https://www.linkedin.com/in/avnish-raj" target="_blank" rel="noreferrer">LinkedIn <ExternalLink size={14} /></a><a href="https://instagram.com/avniiisssshhhhh" target="_blank" rel="noreferrer">Instagram <ExternalLink size={14} /></a></div></article>}
      {modal?.type === 'gallery' && <div className="gallery-content"><div className="gallery-art"><img src={artPath(modal.kind, galleryNames[modal.index])} alt={titleCase(galleryNames[modal.index])} /><button className="gallery-prev icon-button" aria-label="Previous artwork" disabled={modal.index === 0} onClick={() => setModal({ ...modal, index: modal.index - 1 })}><ChevronLeft /></button><button className="gallery-next icon-button" aria-label="Next artwork" disabled={modal.index === galleryNames.length - 1} onClick={() => setModal({ ...modal, index: modal.index + 1 })}><ChevronRight /></button></div><div className="gallery-info"><div><span className="eyebrow">{modal.kind === 'sketches' ? 'THE SKETCHBOOK' : 'THROUGH MY LENS'} / AVNISH RAJ</span><h2>{titleCase(galleryNames[modal.index])}</h2></div><span>{String(modal.index + 1).padStart(2, '0')} / {galleryNames.length}</span></div><div className="thumbnails">{galleryNames.map((name, index) => <button key={name} className={index === modal.index ? 'selected' : ''} aria-label={`View ${titleCase(name)}`} onClick={() => setModal({ ...modal, index })}><img src={artPath(modal.kind, name)} alt="" loading="lazy" /></button>)}</div></div>}
    </dialog>
  </div>;
}
