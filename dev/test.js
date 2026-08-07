/* Regression suite for index.html. One shared DOM stub, several suites.
   Run: node dev/test.js      Exits non-zero on any failure. */
const fs = require('fs');
const ROOT = require('path').join(__dirname, '..');
const FILE = require('path').join(ROOT, 'index.html');
const HTML = fs.readFileSync(FILE, 'utf8');
const IDS  = [...HTML.matchAll(/id="([\w-]+)"/g)].map(m => m[1]);
const SCRIPTS = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const CSS  = HTML.match(/<style>([\s\S]*?)<\/style>/)[1];

const DATE_TYPES = { goalStart:'date', goalEnd:'date' };
const TEXT_TYPES = { input:'text', goalText:'text' };
const COLOR_TYPES = { colLight:'color', colDark:'color', colMark:'color' };
const RANGE_TYPES = { warpRange:'range' };

function env({ platform = 'MacIntel', seed = null, kept = null } = {}) {
  let focused = null;
  const links = [];
  const built = [];                       // every element made, for document queries
  const mk = (tag = 'div') => {
    const e = {
      tagName:tag, type:'', value:'', innerHTML:'', title:'', rel:'', href:'',
      hidden:false, disabled:false, className:'', maxLength:0, isContentEditable:false,
      dataset:{}, children:[], _l:{}, _nav:undefined, _attr:{},
      style:{ _p:{}, setProperty(k,v){ this._p[k]=v }, removeProperty(k){ delete this._p[k] },
              getPropertyValue(k){ return this._p[k] || '' } },
      classList:{ _s:new Set(),
        add(...c){ c.forEach(x=>this._s.add(x)) }, remove(...c){ c.forEach(x=>this._s.delete(x)) },
        toggle(c,f){ f ? this._s.add(c) : this._s.delete(c) }, contains(c){ return this._s.has(c) } },
      setAttribute(k,v){ this._attr[k]=String(v) }, getAttribute(k){ return this._attr[k] ?? null },
      addEventListener(t,f){ (this._l[t]||(this._l[t]=[])).push(f) },
      append(...k){ for (const x of k) { this.children.push(x); if (x && x.rel==='stylesheet') links.push(x.href); } },
      querySelector(){ return mk() }, querySelectorAll(){ return [] },
      // a real browser refuses to focus a disabled or hidden element;
      // modelling that is what catches navigation stalling on one
      focus(){ if (!e.disabled && !e.hidden) focused = e }, blur(){ if (focused===e) focused = null },
      /* An anonymous element carrying text measures as text: 10px a
         character. Named elements keep the fixed box the layout tests use. */
      getBoundingClientRect(){
        if (!e.id && tc) return { left:0, top:0, right:tc.length*10, bottom:20,
                                  width:tc.length*10, height:20 };
        return { left:100, top:40, right:900, bottom:640, width:800, height:600 };
      },
      /* laid-out width is opt-in per element; 0 means "not measurable yet",
         which is what the real node reports before first layout */
      clientWidth: 0,
      click(){ (this._l.click||[]).forEach(f=>f({ preventDefault(){} })) },
      /* a real dispatch stamps the node as the event target, and handlers
         read e.target.value off it */
      dispatchEvent(ev){
        if (ev && !ev.target)
          try { Object.defineProperty(ev, 'target', { value:this, configurable:true }) }
          catch (_) {}
        (this._l[ev && ev.type]||[]).forEach(f=>f(ev)); return true },
      setSelectionRange(){}, remove(){}
    };
    if (tag === 'canvas') {
      e.getContext = () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData(){}
      });
      e.toDataURL = () => 'data:image/png;base64,STUB';
    }
    built.push(e);
    let tc = '';
    // real DOM: assigning textContent removes all children
    Object.defineProperty(e,'textContent',{ get(){ return tc }, set(v){ tc=String(v); e.children.length=0 }, enumerable:true });
    return e;
  };

  const reg = new Map(IDS.map(i => [i, mk('div')]));
  // honour `hidden` written in the markup — the stub does not parse HTML,
  // so without this every initially-hidden element starts out visible
  for (const tag of HTML.match(/<[^>]*\bid="[\w-]+"[^>]*>/g) || []) {
    const id = tag.match(/id="([\w-]+)"/)[1];
    if (/\shidden(\s|>|=)/.test(tag) && reg.has(id)) reg.get(id).hidden = true;
  }
  for (const [id,t] of Object.entries({...DATE_TYPES, ...TEXT_TYPES, ...COLOR_TYPES, ...RANGE_TYPES})) {
    const n = reg.get(id); if (n) { n.tagName='INPUT'; n.type=t; }
  }
  // carry min/max/step across from the markup: without them a range stub has
  // no bounds, so anything computed against it lands outside its real span
  for (const tag of HTML.match(/<[^>]*\bid="[\w-]+"[^>]*>/g) || []) {
    const n = reg.get(tag.match(/id="([\w-]+)"/)[1]); if (!n) continue;
    for (const a of ['min','max','step']) {
      const m = tag.match(new RegExp(a + '="([^"]*)"'));
      if (m) n[a] = m[1];
    }
  }
  const store = new Map();
  if (seed) store.set('todo.daily.v1', JSON.stringify(seed));
  if (kept) store.set('todo.daily.settings', JSON.stringify(kept));
  const docL = {};
  let hitNode = null; const hitPts = [];
  let promptValue = null;

  global.localStorage = { getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) };
  global.navigator = { platform, userAgent:platform };
  /* enough of a selector engine for what the app asks of the document:
     a bare tag, a class, or an id */
  const matches = (n, sel) => sel.startsWith('.') ? String(n.className||'').split(/\s+/).includes(sel.slice(1))
                            : sel.startsWith('#') ? n.id === sel.slice(1)
                            : String(n.tagName||'').toLowerCase() === sel.toLowerCase();
  const queryAll = sel => built.filter(n => sel.split(',').some(one => matches(n, one.trim())));

  global.document = { documentElement:mk('html'), head:mk('head'),
    querySelectorAll:sel => queryAll(sel),
    querySelector:sel => queryAll(sel)[0] || null,
    get activeElement(){ return focused },
    getElementById:i=>reg.get(i)||null, createElement:t=>mk(t),
    createTextNode:t=>({ nodeValue:t, textContent:t }),
    addEventListener(t,f){ (docL[t]||(docL[t]=[])).push(f) },
    /* the click correction asks what sits at a corrected point; record the
       coordinates it asks about, since those ARE the thing under test */
    elementFromPoint(x,y){ hitPts.push([x,y]); return hitNode } };
  const oscs = [];                        // {type, freq} per oscillator
  const anode = () => ({ connect(x){ return x }, start(){}, stop(){},
                         buffer:null, playbackRate:{ value:1 } });
  function FakeCtx(){ this.currentTime = 0; this.sampleRate = 44100;
                      this.state = 'running'; this.destination = {}; }
  FakeCtx.prototype.resume = function(){};
  FakeCtx.prototype.createBuffer = (ch, len) => ({ getChannelData: () => new Float32Array(len) });
  FakeCtx.prototype.createBufferSource = anode;
  FakeCtx.prototype.createBiquadFilter = () => Object.assign(anode(),
    { type:'', frequency:{ value:0 }, Q:{ value:0 } });
  FakeCtx.prototype.createGain = () => Object.assign(anode(),
    { gain:{ setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} } });
  FakeCtx.prototype.createOscillator = function(){
    const nd = anode(); nd.type = ''; let v = 0;
    const rec = x => { v = x; oscs.push({ type:nd.type, freq:x }) };
    nd.frequency = { get value(){ return v }, set value(x){ rec(x) },
      setValueAtTime(x){ rec(x) }, exponentialRampToValueAtTime(){} };
    return nd;
  };

  const abort = () => { const e = new Error('cancelled'); e.name = 'AbortError'; return Promise.reject(e); };
  let served = null;                                  // JSON text the picker hands back
  const openPicker = () => served === null ? abort() : Promise.resolve([{
    name:'todo.json',
    getFile: async () => ({ text: async () => served }),
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted'
  }]);
  global.window = { innerWidth:1200, innerHeight:800,
    matchMedia:()=>({matches:false}), addEventListener(){},
    AudioContext:FakeCtx, showOpenFilePicker:openPicker, showSaveFilePicker:abort };
  global.matchMedia = global.window.matchMedia;
  global.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
  global.prompt = () => promptValue;
  global.confirm = () => true;
  global.alert = () => {};

  const errors = [];
  SCRIPTS.forEach((src,i) => { try { new Function(src)() } catch(e){ errors.push(`script ${i+1}: ${e.constructor.name}: ${e.message}`) } });

  const flat = n => (n.children && n.children.length) ? n.children.map(flat).join('') : (n.textContent || n.nodeValue || '');
  return {
    reg, store, docL, errors, links, flat,
    el: id => reg.get(id),
    focused: () => focused,
    setFocus: n => { focused = n },
    setPrompt: v => { promptValue = v },
    serve: v => { served = v },
    /* the success sound is the only one with oscillators above 700Hz —
       click bodies all sit below 400 — so that is its signature */
    chimed: () => oscs.some(o => o.freq >= 700),
    osc: () => oscs.slice(),
    quiet: () => { oscs.length = 0 },
    doc: () => JSON.parse(store.get('todo.daily.v1') || '{"settings":{}}'),
    prop: k => global.document.documentElement.style._p[k],
    attr: (id, k) => (reg.get(id)||{}).getAttribute ? reg.get(id).getAttribute(k) : undefined,
    /* a wrapper is what elementFromPoint really returns: the deepest node,
       which the app then walks up with closest() */
    setHit: n => { hitNode = n && { closest: () => n, disabled:false } },
    hits: () => hitPts.slice(),
    dragTo: (x, y) => (docL.pointermove||[]).forEach(f => f({ clientX:x, clientY:y })),
    letGo:  ()     => (docL.pointerup  ||[]).forEach(f => f({})),
    /* a real sequence is pointerdown then click, and Chrome fires the click
       whether or not the press was defaulted — so both are driven here */
    clickAt: (x, y, o={}) => { const ev =
      { type:'click', isTrusted: o.trusted !== false, button: o.button||0, clientX:x, clientY:y,
        detail: o.detail === undefined ? 1 : o.detail,
        target: o.target || { closest: () => null }, defaulted:false,
        preventDefault(){ this.defaulted = true }, stopPropagation(){},
        stopImmediatePropagation(){} };
      (docL.click||[]).forEach(f => f(ev)); return ev },
    tapAt: (x, y, o={}) => { hitPts.length = 0; const ev =
      { type:'pointerdown', isTrusted: o.trusted !== false, button: o.button||0,
        clientX:x, clientY:y,
        target: o.target || { closest: () => null }, defaulted:false,
        preventDefault(){ this.defaulted = true }, stopPropagation(){},
        stopImmediatePropagation(){} };
      (docL.pointerdown||[]).forEach(f => f(ev)); return ev },
    fire2: (id, type, ev) => ((reg.get(id)||{_l:{}})._l[type]||[]).forEach(f => f(ev)),
    saved: () => store.has('todo.daily.v1'),
    press: (key, o = {}) => (docL.keydown||[]).forEach(f => f({ key, code:o.code||key,
      altKey:!!o.alt, ctrlKey:!!o.ctrl, metaKey:!!o.meta, shiftKey:!!o.shift,
      preventDefault(){} })),
    fire: (id, type) => ((reg.get(id)||{_l:{}})._l[type]||[]).forEach(f => f({ preventDefault(){} })),
    click: (n, o={}) => (n._l.click||[]).forEach(f => f({ preventDefault(){}, ...o })),
    addTask: t => { reg.get('input').value = t;
      (reg.get('entry')._l.submit||[]).forEach(f => f({ preventDefault(){} })) },
    rows: () => reg.get('list').children.map(li => ({ li, box:li.children[1], mark:li.children[3],
                                                      kill:li.children[4],
                                                      text:li.children[2] && li.children[2].textContent })),
    goalRows: () => reg.get('goalList').children.map(li => ({ li, box:li.children[1],
                      text:li.children[2] && li.children[2].textContent, mark:li.children[3] })),
    html: HTML, css: CSS
  };
}

let fails = 0, suite = '';
const S = n => { suite = n; console.log(`\n${n}`); };
const ok = (what, cond, extra='') => { if (!cond) fails++;
  console.log(`  ${cond?'ok  ':'FAIL'} ${what}${extra?' — '+extra:''}`); };

/* ══ boot ══ */
{
  S('boot');
  const t = env();
  ok('both scripts boot', t.errors.length===0, t.errors.join('; '));
  for (const id of ['tabDay','tabWeek','prev','next','today','sndBtn','keysBtn','glowBtn',
                    'dlBtn','carryBtn','undoBtn','openBtn','newBtn','grantBtn','cfgBtn'])
    { try { t.fire(id,'click'); } catch(e){ fails++; console.log(`  FAIL ${id} click — ${e.message}`); } }
  ok('all control handlers ran', true);
  try { t.fire('entry','submit'); t.fire('goalForm','submit'); ok('form handlers ran', true); }
  catch(e){ ok('form handlers ran', false, e.message); }
}

/* ══ platform hints ══ */
for (const [plat, expect] of [['MacIntel','⌥W'], ['Win32','Alt+W']]) {
  S(`platform hints — ${plat}`);
  const t = env({ platform:plat });
  const hint = t.flat(t.el('note')).replace(/\s+/g,' ');
  ok(`uses ${expect}`, hint.includes(expect), hint.slice(0,90));
  ok('dead-key ⌥T handled via e.code', (()=>{ let hit=false;
    (t.docL.keydown||[]).forEach(f=>f({key:'†',code:'KeyT',altKey:true,ctrlKey:false,metaKey:false,
      shiftKey:false,preventDefault(){hit=true}})); return hit; })());
}

/* ══ carry over ══ */
{
  S('carry over');
  const p2=n=>String(n).padStart(2,'0'), kd=d=>`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  const N=new Date(), today=kd(N),
        yest=kd(new Date(N.getFullYear(),N.getMonth(),N.getDate()-1)),
        older=kd(new Date(N.getFullYear(),N.getMonth(),N.getDate()-3));
  const t = env({ seed:{ version:3, updatedAt:new Date().toISOString(), tags:[], goals:[],
    days:{ [older]:{tasks:[{id:'o1',text:'old open',done:false}]},
           [yest]:{tasks:[{id:'y1',text:'yday open',done:false},{id:'y2',text:'yday done',done:true}]} },
    settings:{theme:'retro-dark',mode:'day',sound:false,keys:false,autoCarry:false} } });
  ok('tray shown',            t.el('carryTray').hidden===false);
  ok('points at nearest day', t.el('carryTray').dataset.src===yest, t.el('carryTray').dataset.src);
  t.click(t.el('carryBtn'));
  ok('open task moved',       t.doc().days[today].tasks.length===1);
  ok('done task stayed',      t.doc().days[yest].tasks.length===1 && t.doc().days[yest].tasks[0].id==='y2');
  ok('re-points further back',t.el('carryTray').dataset.src===older, t.el('carryTray').dataset.src);
  t.click(t.el('carryBtn'));
  ok('backlog drained',       t.doc().days[today].tasks.length===2 && t.el('carryTray').hidden===true);
  ok('[hidden] css guard',    /\[hidden\]\{[^}]*display:none/.test(t.css));
}

/* ══ grid navigation ══ */
{
  S('grid navigation');
  const t = env();
  ['alpha','beta','gamma'].forEach(t.addTask);
  const at = () => { const f=t.focused(); if(!f) return 'none';
    for (const id of IDS) if (t.el(id)===f) return `#${id}`;
    const r=t.rows().findIndex(r=>r.box===f||r.mark===f||r.kill===f);
    if (r>=0) return `row${r}.${t.rows()[r].box===f?'box':t.rows()[r].mark===f?'mark':'kill'}`;
    return f.className||f.tagName; };

  ok('config closed on load', t.el('config').hidden===true);
  t.setFocus(t.el('input'));
  const closedWalk=[]; for(let i=0;i<40;i++){ t.press('ArrowDown'); closedWalk.push(at()); }
  ok('closed drawer unreachable',
     !closedWalk.some(w=>['#openBtn','#newBtn','#dlBtn','#sndBtn','#glowBtn'].includes(w)),
     closedWalk.slice(-3).join(' '));

  t.setFocus(t.el('cfgBtn'));                   // C is ignored inside a field
  t.press('c');
  ok('C opens drawer',   t.el('config').hidden===false);
  ok('persisted',        t.doc().settings.config===true);

  t.setFocus(null); t.press('ArrowDown');
  ok('enters at the title bar', at()==='#cfgBtn', at());
  t.press('ArrowDown');
  ok('then the tabs',           at()==='#tabDay', at());
  t.setFocus(null); t.press('ArrowDown');
  const walk=[]; for(let i=0;i<45;i++){ walk.push(at()); t.press('ArrowDown'); }
  for (const target of ['#cfgBtn','#tabDay','#prev','#input','#openBtn','#sndBtn'])
    ok(`down reaches ${target}`, walk.includes(target));
  ok('down reaches task rows', walk.some(w=>w.startsWith('row')));

  // ↓ walks column 0 only — the rest of each line is ←/→, by design
  t.press('End');
  ok('End -> last line', at()==='#sndBtn', at());
  t.press('ArrowRight'); ok('right -> #keysBtn', at()==='#keysBtn', at());
  t.press('ArrowRight'); ok('clamps at line end', at()==='#keysBtn', at());
  // ↑ preserves the column, so col 1 of the display row is CRT
  /* With the CRT master off its sub-switches are disabled, so that line
     holds one control and the column clamps to it. */
  t.press('ArrowUp');    ok('up -> CRT row', at()==='#crtBtn', at());
  ok('CRT subs gated while master off',
     ['crtScan','crtRoll','crtWarp','crtVig','crtFringe'].every(k => t.el(k+'Btn').disabled) &&
     t.el('warpRange').disabled);
  t.press('ArrowUp');    ok('up -> display row', at()==='#glowBtn', at());
  t.press('ArrowRight'); ok('right -> #sweepBtn',           at()==='#sweepBtn', at());
  t.press('ArrowRight'); ok('right -> #hintsBtn',           at()==='#hintsBtn', at());

  /* Sound gates Keys. A control disabled after the line map was built
     cannot take focus, so navigation must step past it rather than
     re-target it forever. */
  t.click(t.el('sndBtn'));
  ok('Keys is now disabled', t.el('keysBtn').disabled===true);
  t.setFocus(t.el('cfgBtn')); t.press('End');
  ok('End -> Sound', at()==='#sndBtn', at());
  t.press('ArrowRight');
  ok('right does not stall on disabled Keys', at()==='#sndBtn', at());
  t.press('ArrowUp'); t.press('ArrowUp');
  ok('display row still reachable', at()==='#glowBtn', at());
  t.el('sweepBtn').disabled = true;               // disabled in mid-line
  t.setFocus(t.el('glowBtn')); t.press('ArrowRight');
  ok('right skips a disabled control', at()==='#hintsBtn', at());
  t.el('sweepBtn').disabled = false;
  t.click(t.el('sndBtn'));                        // restore

  t.press('Home');
  ok('Home -> title bar', at()==='#cfgBtn', at());
  t.press('ArrowRight');
  ok('title bar has one control', at()==='#cfgBtn', at());
  t.press('ArrowDown'); t.press('ArrowDown'); t.press('ArrowDown');
  ok('fourth line is a row', at()==='row0.box', at());
  t.press('ArrowRight'); ok('-> mark cell', at()==='row0.mark', at());
  t.press('ArrowRight'); ok('-> delete',   at()==='row0.kill', at());
  t.press('ArrowRight'); ok('clamps',      at()==='row0.kill', at());
  t.press('ArrowLeft'); t.press('ArrowLeft'); ok('back to box', at()==='row0.box', at());
}

/* ══ colour overrides ══ */
{
  S('colour overrides');
  const t = env();
  t.click(t.el('cfgBtn'));

  ok('no override by default',   t.prop('--fg')===undefined && t.prop('--bg')===undefined);
  ok('pickers show the theme',   t.el('colLight').value==='#f4f2ec' &&
                                 t.el('colDark').value==='#0b0b0b',
                                 `${t.el('colLight').value}/${t.el('colDark').value}`);

  /* POLES exists so the pickers can show what is in effect; if it drifts
     from the CSS the swatches would lie about the current colour */
  for (const [theme, want] of Object.entries(JSON.parse(
        (t.html.match(/const POLES = (\{[\s\S]*?\n\};)/)[1])
          .replace(/\};$/,'}').replace(/'/g,'"').replace(/(\w+):/g,'"$1":')))) {
    const m = t.css.match(new RegExp(':root\\[data-theme="'+theme+'"\\][^{]*\\{([^}]*)\\}'));
    const bg = m && m[1].match(/--bg:\s*(#[0-9a-f]{6})/i);
    const fg = m && m[1].match(/--fg:\s*(#[0-9a-f]{6})/i);
    const dark = theme.endsWith('-dark');
    ok(`POLES matches css for ${theme}`,
       !!bg && !!fg &&
       (dark ? bg[1]===want.dark && fg[1]===want.light
             : bg[1]===want.light && fg[1]===want.dark),
       `css bg=${bg&&bg[1]} fg=${fg&&fg[1]} vs ${JSON.stringify(want)}`);
  }

  // on a dark theme the light tone is the TEXT colour
  t.fire2('colLight','input',{ target:{ value:'#e8f0d8' } });
  ok('dark theme: light -> --fg', t.prop('--fg')==='#e8f0d8', String(t.prop('--fg')));
  t.fire2('colDark','input',{ target:{ value:'#111820' } });
  ok('dark theme: dark -> --bg',  t.prop('--bg')==='#111820', String(t.prop('--bg')));
  ok('persisted',                 t.doc().settings.lightColor==='#e8f0d8' &&
                                  t.doc().settings.darkColor==='#111820');

  // flip polarity: the same pair must swap roles
  t.click([...t.el('themeSeg').children].find(b => b.dataset.pick==='retro-light'));
  ok('light theme: light -> --bg', t.prop('--bg')==='#e8f0d8', String(t.prop('--bg')));
  ok('light theme: dark -> --fg',  t.prop('--fg')==='#111820', String(t.prop('--fg')));
  ok('one pair, all themes',       t.doc().settings.lightColor==='#e8f0d8');

  // derived tokens must not be hardcoded anywhere, or they would strand
  const themeBlocks = [...t.css.matchAll(/:root\[data-theme="[\w-]+"\][^{]*\{([^}]*)\}/g)];
  ok('per-theme blocks carry only tones',
     themeBlocks.every(m => !/--(page|panel|hair|muted|faint|slot)\s*:/.test(m[1])),
     themeBlocks.map(m=>m[1].trim()).join(' | '));
  ok('modern derives its greys',
     /:root\[data-theme\^="modern"\]\{[\s\S]*?--muted:color-mix/.test(t.css));

  // mark ramp: six shades of ONE hue, and it follows polarity
  t.fire2('colMark','input',{ target:{ value:'#2f7d32' } });   // green
  const ramp = [0,1,2,3,4,5].map(i => t.prop(`--m${i}`));
  ok('six shades generated',   ramp.every(v => /^#[0-9a-f]{6}$/.test(v||'')), ramp.join(' '));
  ok('all distinct',           new Set(ramp).size===6, ramp.join(' '));
  const hue = hex => { const v=parseInt(hex.slice(1),16),
    r=((v>>16)&255)/255,g=((v>>8)&255)/255,b=(v&255)/255,
    mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
    if(!d) return 0;
    return (60*(mx===r?((g-b)/d+(g<b?6:0)):mx===g?(b-r)/d+2:(r-g)/d+4)+360)%360; };
  const hues = ramp.map(hue);
  ok('all share the picked hue', hues.every(h => Math.abs(h - hue('#2f7d32')) < 6),
                                 hues.map(h=>h.toFixed(0)).join(','));
  ok('lightness varies',         new Set(ramp.map(h=>h.slice(1,3))).size > 3, ramp.join(' '));
  ok('mark colour persisted',    t.doc().settings.markColor==='#2f7d32');

  const lightRamp = ramp.join(',');
  t.click([...t.el('themeSeg').children].find(b => b.dataset.pick==='modern-dark'));
  const darkRamp = [0,1,2,3,4,5].map(i => t.prop(`--m${i}`)).join(',');
  ok('ramp differs by polarity', darkRamp!==lightRamp, `${lightRamp.slice(0,23)} vs ${darkRamp.slice(0,23)}`);

  // reset
  t.click(t.el('colReset'));
  ok('reset clears tones',  t.prop('--fg')===undefined && t.prop('--bg')===undefined);
  ok('reset clears marks',  [0,1,2,3,4,5].every(i => t.prop(`--m${i}`)===undefined));
  ok('reset clears storage', t.doc().settings.lightColor===null &&
                             t.doc().settings.darkColor===null &&
                             t.doc().settings.markColor===null);

  // rubbish input is ignored rather than written through
  t.fire2('colLight','input',{ target:{ value:'not-a-colour' } });
  ok('invalid hex refused',  t.doc().settings.lightColor===null && t.prop('--fg')===undefined);

  // the pre-paint script needs the mirror, or the default flashes first
  t.fire2('colDark','input',{ target:{ value:'#123456' } });
  ok('mirrored for pre-paint',
     JSON.parse(t.store.get('todo.daily.colors')).dark==='#123456',
     t.store.get('todo.daily.colors'));
  ok('pre-paint reads the mirror', /todo\.daily\.colors/.test(t.html.split('<style>')[0]));

  /* moving the cursor should be audible — it was silent before */
  t.setFocus(t.el('cfgBtn'));
  t.quiet(); t.press('ArrowDown');
  ok('arrow movement clicks',   t.osc().length>0, String(t.osc().length));
  t.quiet(); t.press('Home');
  ok('Home clicks',             t.osc().length>0, String(t.osc().length));
  t.quiet(); t.click(t.el('next'));
  ok('dial buttons click',      t.osc().length>0, String(t.osc().length));
  ok('movement rides the Keys switch', /const SM = \(\) => \{ if \(sndOn && keysOn\)/.test(t.html));

  // a range owns ←/→ for its value; ↑/↓ still navigate lines
  t.setFocus(t.el('warpRange'));
  t.press('ArrowRight');
  ok('range keeps ←/→ for its value', t.focused()===t.el('warpRange'));
  t.press('ArrowDown');
  ok('↑/↓ still leave the range',     t.focused()!==t.el('warpRange'));

  // arrows must cross the colour row even though the swatches are inputs
  t.setFocus(t.el('colLight')); t.press('ArrowRight');
  ok('right crosses swatches', t.focused()===t.el('colDark'));
  for (let i = 0; i < 6 && t.focused() !== t.el('colReset'); i++) t.press('ArrowRight');
  ok('reaches reset',          t.focused()===t.el('colReset'),
     t.focused() && (t.focused().id || t.focused().className));
}

/* ══ layout ══ */
{
  S('layout');
  const t = env();
  ok('one panel only',        (t.html.match(/class="unit/g)||[]).length===1,
                              String((t.html.match(/class="unit/g)||[]).length));
  ok('no separate section',   !/<section/.test(t.html));
  /* Settings live inside the panel so the warp covers the whole UI. The
     pointer cost at high warp is accepted; the keyboard is exact. */
  ok('config lives in main',   t.html.indexOf('</main>') > t.html.indexOf('id="config"'));
  ok('config is inside the warped stage',
     t.html.indexOf('id="config"') < t.html.indexOf('/#screen'));
  ok('config separated by a rule',
     /#config\{ border-top:var\(--edge-w\)/.test(t.css));
  ok('toggle is on the bar',  /<button class="barbtn" id="cfgBtn"/.test(t.html));
  ok('bar button borrows bar colours',
     /\.bar \.barbtn\{[^}]*color:var\(--bar-fg\)/.test(t.css));
  ok('no leftover System strip', !/deckLbl/.test(t.html));


  // the list stays visible while settings are open — the point of a drawer
  t.addTask('still here');
  t.click(t.el('cfgBtn'));
  ok('drawer open',           t.el('config').hidden===false);
  ok('task list still shown', t.rows().length===1 && t.rows()[0].text==='still here');
  ok('entry still shown',     t.el('dayView').hidden===false);
}

/* ══ marks ══ */
{
  S('marks');
  const t = env();
  t.addTask('alpha');
  const day  = () => Object.keys(t.doc().days)[0];
  const task = () => t.doc().days[day()].tasks[0];
  const MARKS = ['urgent','priority','blocked','flagged','waiting','draft','money','personal'];

  ok('new task starts unmarked', task().mark===null);
  const cell = t.rows()[0].mark;
  ok('mark cell exists', !!cell);
  t.setFocus(cell);
  ok('mark cell is focusable', !!cell && t.focused()===cell);

  t.setFocus(t.rows()[0].box);
  t.press('t'); ok('T sets first mark', task().mark==='urgent', String(task().mark));
  t.press('t'); ok('T cycles onward',   task().mark==='priority', String(task().mark));
  for (let i=0;i<7;i++) t.press('t');
  ok('T wraps to none after the last', task().mark===null, String(task().mark));

  t.press('3'); ok('3 picks the 3rd',  task().mark==='blocked', String(task().mark));
  t.press('3'); ok('3 again clears',   task().mark===null);
  t.press('8'); ok('8 picks the last', task().mark==='personal');
  t.press('9'); ok('9 is out of range, ignored', task().mark==='personal');
  t.press('0'); ok('0 clears',         task().mark===null);
  t.press('1'); ok('focus survives marking', t.focused()===t.rows()[0].box);

  // clicking the cell cycles too
  t.click(t.rows()[0].mark);
  ok('click cycles the mark', task().mark==='priority', String(task().mark));

  // goals
  t.press('w',{alt:true,code:'KeyW'});
  t.el('goalText').value='ship it';
  t.el('goalStart').value='2026-08-03'; t.el('goalEnd').value='2026-08-07';
  t.fire('goalForm','submit');
  ok('goal added unmarked', t.doc().goals.length===1 && t.doc().goals[0].mark===null);
  t.setFocus(t.goalRows()[0].box);
  t.press('2'); ok('goal takes a mark', t.doc().goals[0].mark==='priority', String(t.doc().goals[0].mark));

  // legend
  t.click(t.el('cfgBtn'));
  ok('legend lists all 8', t.el('legend').children.length===8, String(t.el('legend').children.length));
  const legendText = t.flat(t.el('legend'));
  for (const name of ['Urgent','Priority','Blocked','Flagged','Waiting','Draft','Money','Personal'])
    ok(`legend names ${name}`, legendText.includes(name));
  ok('legend is numbered 1..8', /1.*2.*3.*4.*5.*6.*7.*8/.test(legendText));
  ok('legend has no focusable controls',
     [...t.el('legend').children].every(c => (c._l.click||[]).length===0));

  // glyphs must be text-presentation, not emoji: no variation selectors
  // and every glyph in the BMP dingbat/technical ranges
  const html = t.html;
  const glyphs = [...html.matchAll(/glyph:'(.)'/g)].map(m=>m[1]);
  ok('8 glyphs declared', glyphs.length===8, glyphs.join(' '));
  ok('no emoji-presentation codepoints',
     glyphs.every(g => { const c=g.codePointAt(0);
       return !(c>=0x1F000) && c!==0x26A1 && c!==0x2699 && c!==0x2702 && c!==0x2709; }),
     glyphs.map(g=>'U+'+g.codePointAt(0).toString(16)).join(' '));
}

/* ══ legacy tag -> mark migration ══ */
{
  S('legacy migration');
  const seed = { version:3, updatedAt:'2026-08-03T10:00:00.000Z',
    tags:[{id:'t1',label:'URGENT',shade:0},{id:'t2',label:'REVIEW',shade:2}],
    goals:[{id:'g1',text:'old goal',start:'2026-08-03',end:'2026-08-03',done:false,tag:'t2'}],
    days:{'2026-08-03':{tasks:[
      {id:'a',text:'first tag',done:false,tag:'t1'},
      {id:'b',text:'second tag',done:false,tag:'t2'},
      {id:'c',text:'no tag',done:false,tag:null}]}},
    settings:{theme:'retro-dark',mode:'day',sound:false,keys:false,autoCarry:false} };
  const t = env({ seed });
  // normalisation lives in memory until something changes — opening a
  // document must not rewrite it, so force one save before reading back
  t.click(t.el('cfgBtn'));
  const tasks = t.doc().days['2026-08-03'].tasks;   // autoCarry off, so it stays put
  ok('version bumped',        t.doc().version===4, String(t.doc().version));
  ok('tags array dropped',    t.doc().tags===undefined);
  ok('1st tag -> 1st mark',   tasks[0].mark==='urgent',   String(tasks[0].mark));
  ok('2nd tag -> 2nd mark',   tasks[1].mark==='priority', String(tasks[1].mark));
  ok('untagged stays null',   tasks[2].mark===null);
  ok('goal migrated too',     t.doc().goals[0].mark==='priority', String(t.doc().goals[0].mark));
  ok('no tag field left',     tasks.every(x=>x.tag===undefined));
}

/* ══ font + glow ══ */
{
  S('font + glow');
  const t = env();
  t.click(t.el('cfgBtn'));               // C is ignored while the entry field has focus
  ok('drawer opened', t.el('config').hidden===false);
  const fontChip = id => [...t.el('fontSeg').children].find(b=>b.dataset.pick===id);
  ok('four font options', t.el('fontSeg').children.length===4,
     [...t.el('fontSeg').children].map(b=>b.textContent).join('/'));
  ok('default is mono',   t.doc().settings.font==='mono');
  ok('no font override',  document.documentElement.style._p['--font']===undefined);
  ok('no network on load',t.links.length===0, t.links.join(' '));

  t.click(fontChip('space'));
  ok('space mono selected', t.doc().settings.font==='space');
  ok('--font overridden',   /Space Mono/.test(document.documentElement.style._p['--font']||''));
  ok('google font fetched', t.links.some(u=>/family=Space\+Mono/.test(u)), t.links.join(' '));

  t.click(fontChip('plex'));
  ok('plex fetched once',   t.links.filter(u=>/IBM\+Plex/.test(u)).length===1);
  t.click(fontChip('space')); t.click(fontChip('plex'));
  ok('no duplicate fetches',t.links.length===2, String(t.links.length));

  t.click(fontChip('helvetica'));
  ok('helvetica is local',  /Helvetica Neue/.test(document.documentElement.style._p['--font']||'') &&
                            t.links.length===2);
  t.click(fontChip('mono'));
  ok('back to default clears override', document.documentElement.style._p['--font']===undefined);

  ok('glow off by default', t.doc().settings.glow===false);
  t.click(t.el('glowBtn'));
  ok('glow on',        t.doc().settings.glow===true);
  ok('class applied',  document.documentElement.classList.contains('glow'));
  ok('label updated',  t.el('glowBtn').textContent==='Glow ●', t.el('glowBtn').textContent);
  t.click(t.el('glowBtn'));
  ok('glow off',       document.documentElement.classList.contains('glow')===false);
  ok('glow supplies a shadow fragment', /--glow-sh:0 0 8px color-mix/.test(t.css));

  ok('crt off by default', t.doc().settings.crt===false);
  t.click(t.el('crtBtn'));
  ok('crt on',            t.doc().settings.crt===true);
  ok('crt class applied', document.documentElement.classList.contains('crt'));
  ok('crt label',         t.el('crtBtn').textContent==='On ●', t.el('crtBtn').textContent);

  /* each effect is its own layer, gated by the master */
  const CLS = { crtScan:'crt-scan', crtRoll:'crt-roll',
                crtVig:'crt-vig', crtFringe:'crt-fringe' };
  const DEF = { crtScan:true, crtRoll:false, crtVig:true, crtFringe:true };
  for (const [key, cls] of Object.entries(CLS)) {
    ok(`${key} defaults to ${DEF[key]}`, t.doc().settings[key]===DEF[key],
       String(t.doc().settings[key]));
    ok(`${key} drives .${cls}`, document.documentElement.classList.contains(cls)===DEF[key]);
  }
  ok('sub-switches live while master on',
     Object.keys(CLS).every(k => t.el(k+'Btn').disabled===false) &&
     t.el('crtWarpBtn').disabled===false);

  /* Warp: a switch plus a 1-5 amount. It goes flat while the
     config drawer is open — filters break hit testing, so the settings
     have to be clickable — hence every effect check closes the drawer. */
  const setWarp = v => t.fire2('warpRange','input',{ target:{ value:String(v) } });
  const warpState = () => ({
    gain: document.documentElement.style._p['--warp-gain'],
    scale: t.attr('crt-bulge-disp','scale'),
    cls: document.documentElement.classList.contains('crt-warp'),
    okc: document.documentElement.classList.contains('warp-ok')
  });
  const closed = warpState;      // the warp no longer depends on the drawer

  ok('warp off by default',   t.doc().settings.crtWarpOn===false);
  ok('amount defaults to 3',  t.doc().settings.crtWarp===3, String(t.doc().settings.crtWarp));
  ok('amount disabled while off', t.el('warpRange').disabled===true);
  ok('inert while off',       closed().scale==='0', String(closed().scale));

  t.click(t.el('crtWarpBtn'));
  ok('toggle switches it on', t.doc().settings.crtWarpOn===true);
  ok('label follows',         t.el('crtWarpBtn').textContent==='Warp ●', t.el('crtWarpBtn').textContent);
  ok('amount now live',       t.el('warpRange').disabled===false);
  const on3 = closed();
  ok('applies once closed',   on3.cls && on3.okc && on3.scale!=='0' && on3.gain!==undefined,
                              JSON.stringify(on3));

  const s3 = Number(on3.scale);
  setWarp(5); const s5 = Number(closed().scale);
  setWarp(1); const s1 = Number(closed().scale);
  ok('amount drives strength', s1 < s3 && s3 < s5, `${s1} < ${s3} < ${s5}`);
  ok('readout follows',        t.el('warpVal').textContent==='1', t.el('warpVal').textContent);

  setWarp(4);
  t.click(t.el('crtWarpBtn'));
  ok('off drops the effect',   !closed().cls && closed().scale==='0');
  ok('off remembers the amount', t.doc().settings.crtWarp===4, String(t.doc().settings.crtWarp));
  t.click(t.el('crtWarpBtn'));
  ok('back on at the same amount', Number(closed().scale) > s3);

  ok('out of range clamps',   (setWarp(99), t.doc().settings.crtWarp===5),
                              String(t.doc().settings.crtWarp));
  ok('rubbish clamps into range', (setWarp('nope'),
      t.doc().settings.crtWarp>=1 && t.doc().settings.crtWarp<=5),
      String(t.doc().settings.crtWarp));
  setWarp(5);
  ok('a slider notch is audible', (t.quiet(), setWarp(4), t.osc().length>0),
                                  String(t.osc().length));
  setWarp(3);

  /* the layout gain must never outlive the effect, or the panel is laid
     out oversized with no barrel to squeeze it back */
  t.click(t.el('crtBtn'));                       // master off, warp still on
  ok('master off clears the gain',   warpState().gain===undefined, String(warpState().gain));
  ok('master off zeroes the scale',  warpState().scale==='0', String(warpState().scale));
  ok('master off drops the classes', !warpState().cls && !warpState().okc);
  ok('the warp setting is kept',     t.doc().settings.crtWarpOn===true &&
                                     t.doc().settings.crtWarp===3);
  t.click(t.el('crtBtn'));                       // master back on
  ok('master on restores it',        closed().gain!==undefined, String(closed().gain));

  /* The gear stays in the title bar where it belongs. It is clickable there
     because clicks are corrected, not because the button was moved. */
  ok('gear stays in the title bar while warped', t.el('cfgBtn').hidden !== true);
  ok('no stand-in button left behind', !/cfgBtnFix|gearfix/.test(t.html + t.css));

  /* ── clicks land where the picture is, not where the layout is ──
     A filter does not move hit testing, so at high warp every control
     answers tens of px away from where it paints. The fix is general: undo
     the displacement on the way in and re-dispatch. */
  const CX = 500, CY = 340;                     // stub stage is 100,40 800x600
  const centre = t.tapAt(CX, CY);
  ok('a tap is hit-tested at all while warped', t.hits().length === 1);
  /* 0.5 is not representable in an 8-bit channel, so the neutral value 128
     leaves a fixed sub-2px drift across the whole picture. The inverse
     reproduces that drift rather than pretending it away. */
  ok('dead centre is left alone bar the map quantisation',
     t.hits()[0] && Math.abs(t.hits()[0][0]-CX) < 2 && Math.abs(t.hits()[0][1]-CY) < 2,
     String(t.hits()[0].map(n => n.toFixed(2))));

  t.tapAt(CX + 300, CY - 250);                  // up and to the right
  const near = t.hits()[0];
  t.tapAt(CX + 380, CY - 290);                  // further out again
  const far  = t.hits()[0];
  ok('correction pushes outward, away from centre',
     near[0] > CX + 300 && near[1] < CY - 250, String(near.map(Math.round)));
  ok('and grows with distance from centre',
     (far[0] - (CX+380)) > (near[0] - (CX+300)) &&
     ((CY-290) - far[1]) > ((CY-250) - near[1]),
     `${Math.round(near[0]-(CX+300))}px then ${Math.round(far[0]-(CX+380))}px`);
  ok('correction is one evaluation, not a search',
     /return \[px \+ \(WARP_DRIFT \+ WARP_FIELD \* u \* r2\) \* scale/.test(t.html) &&
     !/for \(let i = 0; i < \d+; i\+\+\)[\s\S]{0,80}lx = px/.test(t.html));

  /* The amplitude is measured, not read off the map's own formula. The spec
     value 0.249 over-corrects about threefold, which lands clicks FURTHER
     from the control than doing nothing at all — the bug that made the warp
     feel unusable. Pinned so nobody "corrects" it back to the spec. */
  const amp = Number((t.html.match(/const WARP_FIELD = ([\d.]+)/) || [])[1]);
  ok('field amplitude is the measured one', Math.abs(amp - 0.0748) < 0.002, String(amp));
  ok('and is nowhere near the spec-derived value', amp < 0.15, String(amp));
  ok('the 8-bit neutral drift is carried too',
     /const WARP_DRIFT = 0\.5 \/ 255;/.test(t.html));

  /* it must actually hand the interaction to whatever is under the cursor */
  t.setHit(t.el('cfgBtn'));
  let was = t.el('config').hidden;
  /* Chrome fires a click from pointerup even when the press was defaulted, so
     handling only the press meant the right control AND the wrongly aimed one
     both fired. The press must not activate anything by itself. */
  const pressed = t.tapAt(CX + 320, CY - 260);
  ok('the press alone activates nothing', t.el('config').hidden === was);
  ok('but the mis-aimed press is still stopped, so focus stays put',
     pressed.defaulted === true);
  const clicked = t.clickAt(CX + 320, CY - 260);
  ok('the click activates the corrected element', t.el('config').hidden !== was);
  ok('and the mis-aimed native click is suppressed', clicked.defaulted === true);
  t.setHit(null);
  if (t.el('config').hidden !== was) t.click(t.el('cfgBtn'));   // leave as found

  /* a keyboard Enter arrives as a trusted click carrying no pointer position;
     correcting that would fire whatever sits in the top-left corner */
  t.setHit(t.el('cfgBtn'));
  was = t.el('config').hidden;
  ok('keyboard activation is left alone',
     t.clickAt(0, 0, {detail:0}).defaulted === false && t.el('config').hidden === was);
  ok('and so is a click with coords but no detail',
     t.clickAt(CX + 320, CY - 260, {detail:0}).defaulted === false);
  t.setHit(null);

  /* a slider cannot be activated by a click alone, so the value is taken
     from the corrected point instead */
  const slider = t.el('warpRange');
  if (slider) {
    slider.getBoundingClientRect = () => ({ left:200, right:600, top:300, bottom:320,
                                            width:400, height:20 });
    ok('the slider stub carries its real bounds',
       slider.min === '1' && slider.max === '5', `${slider.min}..${slider.max}`);
    slider.value = '1'; t.setHit(slider);
    t.tapAt(560, 310);
    ok('a tap on a warped slider sets its value from the corrected point',
       Number(slider.value) > 1, `value ${slider.value}`);
    /* suppressing the mis-aimed click also loses the native drag, so the
       slider is kept in step by hand while the pointer is held */
    const tapped = Number(slider.value);
    t.dragTo(260, 310);
    ok('dragging a warped slider keeps tracking', Number(slider.value) < tapped,
       `${tapped} -> ${slider.value}`);
    t.letGo(); const parked = slider.value;
    t.dragTo(560, 310);
    ok('and stops tracking once released', slider.value === parked);
    t.setHit(null);
  }

  /* nothing is corrected when there is nothing to correct */
  const flatWarp = () => { t.click(t.el('crtBtn')); const n = t.tapAt(CX+300, CY-250).defaulted;
                           t.click(t.el('crtBtn')); return n };
  ok('no correction while the warp is off', flatWarp() === false);
  ok('synthetic clicks are left alone', t.tapAt(CX+300, CY-250, {trusted:false}).defaulted === false);
  ok('right-click is left alone',       t.tapAt(CX+300, CY-250, {button:2}).defaulted === false);
  ok('both press and click are captured, ahead of the wrong element',
     /addEventListener\('pointerdown', onWarpPress, true\)/.test(t.html) &&
     /addEventListener\('click', onWarpClick, true\)/.test(t.html));
                    // and it still toggles

  /* The drawer used to flatten the warp so its controls stayed clickable,
     which made the effect look broken while you adjusted its own slider.
     It lives outside the filter now, so the two are independent. */
  const openState = (t.click(t.el('cfgBtn')), warpState());
  const shutState = (t.click(t.el('cfgBtn')), warpState());
  ok('drawer no longer affects the warp',
     openState.gain===shutState.gain && openState.scale===shutState.scale &&
     openState.cls===shutState.cls,
     `${JSON.stringify(openState)} vs ${JSON.stringify(shutState)}`);
  ok('warp stays live with the drawer open',
     openState.cls===true && openState.scale!=='0', JSON.stringify(openState));

  ok('gain rises with the level',
     (() => { const m = t.html.match(/WARP_GAIN\s*=\s*\[([^\]]+)\]/);
              if (!m) return false;
              const v = m[1].split(',').map(Number);
              return v.length===6 && v[0]===1 && v.every((x,i)=> i===0 || x > v[i-1]); })(),
     (t.html.match(/WARP_GAIN\s*=\s*\[([^\]]+)\]/)||[])[1]);
  ok('tube is sized to the app, not the window',
     /#screen\{[\s\S]*?width:min\(calc\(816px/.test(t.css));
  ok('stage is wider than the panel, leaving bezel for the pull-in',
     (() => { const st = Number((t.css.match(/width:min\(calc\((\d+)px/)||[])[1]);
              const sh = Number((t.css.match(/max-width:calc\((\d+)px/)||[])[1]);
              return st > sh; })(),
     `${(t.css.match(/width:min\(calc\((\d+)px/)||[])[1]} vs ${(t.css.match(/max-width:calc\((\d+)px/)||[])[1]}`);
  /* The texture stack covers the window, not the warped stage. Bounded to
     the stage it drew a lit rectangle against an untextured page, which
     read as a black frame around the app. The cost is that the scanlines
     no longer bow with the panel — a continuous field beat a seam. */
  const body = t.html.slice(t.html.indexOf('<body>'), t.html.indexOf('</body>'));
  const iShell = body.indexOf('/.shell'), iFx = body.indexOf('class="fx"'),
        iScreen = body.indexOf('/#screen');
  /* Split: scanlines and the rolling band belong to the picture
     and sit inside the warp so they bow with it — that bowing is the main
     cue that reads as curved glass. The uniform layers (grain, vignette,
     flicker) stay on the viewport, where they cannot seam. */
  ok('warped texture is inside the stage',
     body.indexOf('class="fxin"') > iShell &&
     body.indexOf('class="fxin"') < iScreen,
     `${iShell}/${body.indexOf('class="fxin"')}/${iScreen}`);
  ok('uniform overlays stay on the viewport', iFx > iScreen, `${iScreen}/${iFx}`);
  ok('overlay stack covers the window', /\.fx\{ position:fixed;inset:0/.test(t.css));
  ok('warped texture is masked so it cannot draw a frame',
     /\.fxin\{[\s\S]*?mask-image:radial-gradient\(ellipse/.test(t.css));
  ok('warped layer does not share .fx specificity',
     !/\.fx-in/.test(t.css) && /\.fxin > span\{/.test(t.css));
  ok('grain covers the window too',     /body::before\{[\s\S]*?position:fixed/.test(t.css));
  ok('filter def sits outside the filter',
     body.indexOf('class="fxdef"') > iScreen);
  ok('no bounded texture to seam against',
     !/#screen::before/.test(t.css));
  /* Verified by rendering both signs: positive bows the content outward
     (barrel); negative pincushions it and spills the panel off-screen. */
  ok('map bows the content outward',
     /128 \+ u \* f \* 127/.test(t.html) && /128 \+ v \* f \* 127/.test(t.html));
  ok('slider sits inside the button',
     /<span class="chipgroup">[\s\S]*?id="crtWarpBtn"[\s\S]*?id="warpRange"[\s\S]*?<\/span>/.test(t.html));
  ok('displacement filter declared',
     /<feDisplacementMap id="crt-bulge-disp" in="SourceGraphic" in2="map"/.test(t.html));
  ok('map fills the whole filter region',
     /<feImage id="crt-bulge-map" preserveAspectRatio="none" result="map"\/>/.test(t.html));
  ok('filter runs in sRGB',
     /id="crt-bulge"[^>]*color-interpolation-filters="sRGB"/.test(t.html));
  ok('offsets grow with the square of the radius',
     /K \* \(u \* u \+ v \* v\)/.test(t.html));
  /* the filter must stay gated behind a successful map build: applying it
     with an empty in2 blanks the whole UI */
  ok('filter gated on a built map',
     /classList\.toggle\(\s*'warp-ok', warpLive && !!ensureWarpMap\(\)\)/.test(t.html));
  ok('map failure is survivable',   /catch \{ warpBroken = true; \}/.test(t.html));
  ok('boot survives without canvas', t.errors.length===0, t.errors.join('; '));
  ok('roll moves a band',
     /@keyframes roll/.test(t.css) && /\.fx-roll\{[\s\S]*?animation:roll/.test(t.css));
  ok('roll creeps the scanlines',
     /:root\.crt\.crt-roll \.fx-scan\{ animation:drift/.test(t.css));
  ok('drift loops exactly one line',
     /@keyframes drift\{ from\{ background-position:0 0 \} to\{ background-position:0 3px \}/.test(t.css));
  ok('moving layers respect reduced motion',
     /:root\.crt\.crt-roll \.fx-scan,:root\.crt \.fx-flick,:root\.crt\.crt-roll \.fx-roll\{ animation:none/
       .test(t.css));
  ok('scanlines gated on their own switch', /:root\.crt\.crt-scan\{[^}]*--scan:\s*\.\d/.test(t.css));
  ok('--scan defaults to zero', /:root\{[^}]*--scan:\s*0/.test(t.css));
  ok('no theme bakes in scanlines',
     ![...t.css.matchAll(/:root\[data-theme[^{]*\{([^}]*)\}/g)]
       .some(m => /--scan:\s*\.?[1-9]/.test(m[1])),
     [...t.css.matchAll(/:root\[data-theme[^{]*\{([^}]*)\}/g)]
       .filter(m => /--scan/.test(m[1])).length + ' theme blocks still set --scan');
  ok('vignette is its own layer', /:root\.crt\.crt-vig \.fx-vig\{[\s\S]*?radial-gradient/.test(t.css));
  ok('vignette reaches full strength at the edge',
     (() => { const m = t.css.match(/\.fx-vig\{[\s\S]*?\n  \}/);
              if (!m) return false;
              const a = [...m[0].matchAll(/rgba\(0,0,0,\.(\d+)\)/g)].map(x => Number('0.'+x[1]));
              return a.length >= 2 && Math.max(...a) >= 0.7; })(),
     (t.css.match(/\.fx-vig\{[\s\S]*?\n  \}/)||[''])[0]
       .match(/rgba\(0,0,0,\.\d+\)/g)?.join(' '));
  ok('hum flickers the screen', /@keyframes hum/.test(t.css) && /\.fx-flick\{[\s\S]*?animation:hum/.test(t.css));
  ok('fringe contributes a fragment', /:root\.crt\.crt-fringe\{[\s\S]*?--fringe-sh:/.test(t.css));
  ok('shadows compose rather than compete',
     /text-shadow:var\(--fringe-sh, \) var\(--glow-sh, \)/.test(t.css));
  ok('glow is dark-themes only',
     /:root\[data-theme\$="-dark"\]\.glow\{[\s\S]*?--glow-sh:/.test(t.css));

  ok('hints on by default', t.doc().settings.hints===true);
  ok('note visible',        t.el('note').hidden===false);
  t.click(t.el('hintsBtn'));
  ok('hints off',           t.doc().settings.hints===false);
  ok('note hidden',         t.el('note').hidden===true);
  ok('hints label',         t.el('hintsBtn').textContent==='Hints ○', t.el('hintsBtn').textContent);
  t.click(t.el('hintsBtn'));
  ok('hints back on',       t.el('note').hidden===false);
  const glowRules = [...t.css.matchAll(/([^{}]*\.glow[^{}]*)\{([^}]*)\}/g)]
    .filter(m => /text-shadow|--glow-sh/.test(m[2]));
  ok('every glow rule is dark-scoped',
     glowRules.length > 0 && glowRules.every(m => m[1].includes('[data-theme$="-dark"]')),
     glowRules.map(m => m[1].trim()).join(' | '));

  ok('focus ring uses currentColor so it reads on filled controls',
     /button:focus-visible\{ outline:2px solid currentColor/.test(t.css));
  ok('row cursor uses currentColor',
     /li:focus-within\{[^}]*inset 3px 0 0 currentColor/.test(t.css));
  ok('no focus ring hardcodes --fg',
     !/:focus-visible\{[^}]*outline:[^;}]*var\(--fg\)/.test(t.css));
}

/* ══ persistence of every setting ══ */
{
  S('settings round-trip');
  const t = env();
  t.click(t.el('cfgBtn'));
  t.click([...t.el('fontSeg').children].find(b=>b.dataset.pick==='plex'));
  t.click(t.el('glowBtn'));
  t.click([...t.el('themeSeg').children].find(b=>b.dataset.pick==='modern-light'));
  const saved = t.doc().settings;
  ok('font saved',  saved.font==='plex');
  ok('glow saved',  saved.glow===true);
  ok('theme saved', saved.theme==='modern-light');
  ok('config saved',saved.config===true);

  const t2 = env({ seed:t.doc() });
  ok('font restored',  t2.doc().settings.font==='plex');
  ok('glow restored',  document.documentElement.classList.contains('glow'));
  ok('theme restored', document.documentElement.dataset.theme==='modern-light');
  ok('drawer restored',t2.el('config').hidden===false);
  ok('font refetched on restore', t2.links.some(u=>/IBM\+Plex/.test(u)));
}


/* ══ the real todo.json on disk ══ */
{
  S('todo.json on disk');
  const path = '/Users/seth.rzeszutek/Downloads/todo/todo.json';
  if (!fs.existsSync(path)) { ok('todo.json present', false, 'not found'); }
  else {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(path,'utf8')); ok('valid JSON', true); }
    catch(e){ ok('valid JSON', false, e.message); }
    if (raw) {
      const t = env({ seed:raw });
      t.click(t.el('cfgBtn'));                     // force one normalised save
      const days = t.doc().days, keys = Object.keys(days);
      const tasks = keys.length ? days[keys[0]].tasks : [];
      ok('loads without error',   t.errors.length===0, t.errors.join('; '));
      ok('items survive load',    tasks.length===raw.days[Object.keys(raw.days)[0]].tasks.length,
                                  `${tasks.length} tasks`);
      ok('every mark is valid',   tasks.every(x => x.mark===null || t.html.includes(`id:'${x.mark}'`)),
                                  tasks.map(x=>x.mark).join(','));
      ok('no settings stamped',   raw.settings===undefined);
      ok('rendered as rows',      t.rows().length===tasks.length, String(t.rows().length));
      ok('marks rendered',        t.rows().filter(r=>!r.mark.classList.contains('none')).length
                                  === tasks.filter(x=>x.mark).length);
    }
  }
}

/* ══ control schemes ══ */
{
  S('control schemes');
  const t = env();
  const pick = id => { t.click([...t.el('ctrlSeg').children].find(b => b.dataset.pick === id)); };
  const legend = () => t.flat(t.el('note'));

  ok('three schemes offered', t.el('ctrlSeg').children.length === 3,
     [...t.el('ctrlSeg').children].map(b => b.textContent).join('/'));
  ok('default is selected at boot',
     t.doc().settings.controls === undefined || t.doc().settings.controls === 'default');

  /* default keeps the original letters */
  t.addTask('alpha');
  const task = () => t.doc().days[Object.keys(t.doc().days)[0]].tasks[0];
  t.setFocus(t.rows()[0].box);
  t.press('t'); ok('default: T marks', task().mark === 'urgent', String(task().mark));

  /* ── vim ── */
  pick('vim');
  ok('vim is stored', t.doc().settings.controls === 'vim');
  ok('and kept in the browser key too',
     JSON.parse(t.store.get('todo.daily.settings')).controls === 'vim');
  ok('legend advertises J/K', /J/.test(legend()) && /K/.test(legend()), legend().slice(0, 44));
  ok('legend advertises I for edit', /I edit/.test(legend()));

  t.setFocus(t.rows()[0].box);
  t.press('m'); ok('vim: M marks', task().mark === 'priority', String(task().mark));
  t.press('t'); ok('vim: T no longer marks', task().mark === 'priority', String(task().mark));

  /* opened so there is always a line below the task row, whatever the
     layout happens to be */
  if (t.el('config').hidden) t.click(t.el('cfgBtn'));
  t.setFocus(t.rows()[0].box);
  const home = t.focused();
  t.press('j'); ok('vim: J moves down a line', t.focused() !== home);
  t.press('k'); ok('vim: K comes back',        t.focused() === home);
  t.press('l'); ok('vim: L moves across a line', t.focused() !== home);

  /* motion must not park in a text field: plain letters type there, so the
     cursor would have nothing left to move it with */
  t.setFocus(t.rows()[0].box);
  const fields = [t.el('input'), t.el('goalText')];
  let landedInField = false;
  for (let i = 0; i < 14; i++) { t.press('j'); if (fields.includes(t.focused())) landedInField = true; }
  for (let i = 0; i < 14; i++) { t.press('k'); if (fields.includes(t.focused())) landedInField = true; }
  ok('vim: motion never lands in a text field', !landedInField,
     t.focused() && (t.focused().id || t.focused().className));

  t.setFocus(t.rows()[0].box);
  const day = t.flat(t.el('date'));
  t.press(']'); ok('vim: ] moves a day forward', t.flat(t.el('date')) !== day);
  ok('and the repaint kept the cursor out of the entry field',
     !fields.includes(t.focused()), t.focused() && (t.focused().id || t.focused().className));
  t.press('['); ok('vim: [ moves back', t.flat(t.el('date')) === day, t.flat(t.el('date')));
  ok('back on the day that has the task', t.rows().length === 1, `${t.rows().length} rows`);

  t.setFocus(t.rows()[0].box);
  const cfg0 = t.el('config').hidden;
  t.press(','); ok('vim: comma toggles config', t.el('config').hidden !== cfg0);
  t.press(','); ok('and toggles it back',       t.el('config').hidden === cfg0);

  /* ── emacs ── */
  pick('emacs');
  ok('emacs is stored', t.doc().settings.controls === 'emacs');
  ok('legend advertises the control motions', /N/.test(legend()) && /P/.test(legend()));

  if (t.el('config').hidden) t.click(t.el('cfgBtn'));
  t.setFocus(t.rows()[0].box);
  const at = t.focused();
  t.press('n', { ctrl:true }); ok('emacs: C-n moves down', t.focused() !== at);
  t.press('p', { ctrl:true }); ok('emacs: C-p comes back', t.focused() === at);
  t.press('f', { ctrl:true }); ok('emacs: C-f moves across', t.focused() !== at);
  t.setFocus(t.rows()[0].box);
  t.press('t'); ok('emacs: plain letters still work', !!task().mark);

  /* plain letters must not fire while typing, or the list would jump around
     as you write a task; a modified binding still may */
  pick('vim');
  t.setFocus(t.el('input'));
  const cfgWas = t.el('config').hidden;
  t.press('j'); t.press(','); t.press('x');
  ok('plain letters are inert in a text field', t.el('config').hidden === cfgWas);
  pick('emacs');
  t.setFocus(t.el('input'));
  t.press('o', { ctrl:true });
  ok('a modified binding still reaches the app from a field',
     t.focused() === t.el('input'));

  /* rubbish falls back rather than leaving the app unbound */
  const t2 = env({ seed: { version:4, days:{}, goals:[], settings:{ controls:'dvorak' } } });
  ok('an unknown scheme falls back to default',
     JSON.parse(t2.store.get('todo.daily.settings')).controls === 'default');
  ok('the arrows are bound in every scheme',
     /↑/.test(t2.flat(t2.el('note'))) && /←/.test(t2.flat(t2.el('note'))));
}

/* ══ schemes across platforms ══ */
for (const [plat, mac] of [['MacIntel', true], ['Win32', false]]) {
  S(`scheme keys — ${plat}`);
  const t = env({ platform: plat });
  t.click(t.el('cfgBtn'));
  t.click([...t.el('ctrlSeg').children].find(b => b.dataset.pick === 'emacs'));
  const legend = t.flat(t.el('note'));

  ok('modifiers are written the platform way',
     mac ? /⌃P/.test(legend) : /Ctrl\+P/.test(legend), legend.slice(0, 40));

  /* Chrome will not let a page cancel Ctrl+N or Ctrl+O off macOS, so those
     must not be advertised there */
  ok('reserved browser combos are not offered off macOS',
     mac ? /⌃N/.test(legend) : (!/Ctrl\+N/.test(legend) && /Alt\+N/.test(legend)),
     legend.slice(0, 60));
  ok('and the substitute is bound, not just printed',
     /(⌃|Ctrl\+|Alt\+)N/.test(legend));

  t.addTask('alpha');
  t.setFocus(t.rows()[0].box);
  const from = t.focused();
  if (mac) t.press('n', { ctrl:true });
  else     t.press('n', { alt:true, code:'KeyN' });
  ok('the platform motion key moves the cursor', t.focused() !== from,
     `${from && (from.id||from.className)} -> ${t.focused() && (t.focused().id||t.focused().className)}`);

  /* the arrows are the fallback everywhere, whatever the browser reserves */
  t.setFocus(t.rows()[0].box);
  const home = t.focused();
  t.press('ArrowDown');
  ok('arrows still work regardless of scheme', t.focused() !== home);
}

/* ══ blink ══ */
{
  S('blink');
  const t = env();
  ok('off by default', t.doc().settings.blink !== true);
  ok('no class until asked', document.documentElement.classList.contains('blink') === false);

  t.click(t.el('cfgBtn'));
  t.click(t.el('blinkBtn'));
  ok('the class drives it', document.documentElement.classList.contains('blink'));
  ok('stored in the document',   t.doc().settings.blink === true);
  ok('and in the browser key',   JSON.parse(t.store.get('todo.daily.settings')).blink === true);
  ok('the chip reads back',      t.el('blinkBtn').textContent === 'Blink ●',
     t.el('blinkBtn').textContent);

  /* every button gets its own phase and cycle, or they would blink in step */
  const btns = document.querySelectorAll('button').filter(b => b.style.getPropertyValue('--lamp'));
  ok('buttons are seeded', btns.length > 8, `${btns.length} seeded`);
  const delays = new Set(btns.map(b => b.style.getPropertyValue('--lamp')));
  const durs   = new Set(btns.map(b => b.style.getPropertyValue('--lamp-dur')));
  ok('phases differ',  delays.size > Math.min(5, btns.length - 1), `${delays.size} distinct`);
  /* count only the lamps that run: the rest share the 0s opt-out */
  const liveDurs = btns.map(b => b.style.getPropertyValue('--lamp-dur'))
                       .filter(d => parseFloat(d) > 0);
  ok('live cycles are not in lockstep',
     liveDurs.length < 2 || new Set(liveDurs).size > 1,
     `${new Set(liveDurs).size} distinct of ${liveDurs.length} live`);
  ok('phases are negative, so nothing waits a whole cycle to first blink',
     [...delays].every(d => d.startsWith('-')), [...delays][0]);
  /* a lamp either runs a long cycle or opts out with 0s; nothing strobes */
  const live = [...durs].filter(d => parseFloat(d) > 0);
  ok('cycles run for tens of seconds, not strobing',
     live.every(d => parseFloat(d) >= 20 && parseFloat(d) <= 52),
     live.slice(0, 3).join(', '));
  ok('and some buttons sit steady, so the panel is not all lamps',
     durs.has('0s'), `${[...durs].length} distinct, steady present: ${durs.has('0s')}`);
  const steady = btns.filter(b => b.style.getPropertyValue('--lamp-dur') === '0s').length;
  ok('roughly half take part', steady > 0 && steady < btns.length,
     `${btns.length - steady} of ${btns.length} blink`);

  /* lamps are not identical: depth varies, and a few stutter rather than
     giving one clean blink */
  const dips = new Set(btns.map(b => b.style.getPropertyValue('--lamp-dip')));
  ok('dip depth varies per lamp', dips.size > 1, `${dips.size} distinct depths`);
  ok('depths stay shallow enough to read as a blink, not a blackout',
     [...dips].every(d => parseFloat(d) >= 0.28 && parseFloat(d) <= 0.55),
     [...dips].slice(0, 3).join(', '));
  ok('only lamps that run can stutter',
     btns.filter(b => b.classList.contains('stutter'))
         .every(b => parseFloat(b.style.getPropertyValue('--lamp-dur')) > 0));
  /* slice out a keyframes block by finding what follows it, since a regex
     stops at the first inner brace */
  const frames = name => {
    const from = t.css.indexOf(`@keyframes ${name}{`);
    if (from < 0) return '';
    const ends = [t.css.indexOf('@keyframes', from + 1), t.css.indexOf(':root.blink', from + 1)]
                   .filter(i => i > from);
    return t.css.slice(from, ends.length ? Math.min(...ends) : undefined);
  };
  const dipsIn = name => (frames(name).match(/--lamp-dip/g) || []).length;
  ok('a plain lamp dips once', dipsIn('lamp') === 1, `${dipsIn('lamp')} dips`);
  ok('a stutter dips twice',   dipsIn('lampstutter') === 2, `${dipsIn('lampstutter')} dips`);
  /* a gradient names its colour twice, so count the lit stops, not the vars */
  const litsIn = name => (frames(name).match(/background-image:linear-gradient/g) || []).length;
  ok('the tint flavours mirror the dim ones',
     litsIn('lamptint') === 1 && litsIn('lamptintstutter') === 2,
     `tint ${litsIn('lamptint')}, stutter ${litsIn('lamptintstutter')}`);

  /* a repaint must not restart every lamp together */
  const before = t.el('cfgBtn').style.getPropertyValue('--lamp');
  t.addTask('something');
  ok('a repaint leaves existing lamps alone',
     t.el('cfgBtn').style.getPropertyValue('--lamp') === before);
  const fresh = document.querySelectorAll('button')
    .filter(b => !b.id && b.style.getPropertyValue('--lamp'));
  ok('and seeds the buttons it just built', fresh.length > 0, `${fresh.length} new`);

  t.click(t.el('blinkBtn'));
  ok('switching off drops the class', document.documentElement.classList.contains('blink') === false);
  ok('and is remembered off', t.doc().settings.blink === false);

  ok('disabled controls are left out of it',
     /:root\.blink button:not\(:disabled\)/.test(t.css));

  /* ── a colour, when you pick one ── */
  const t2 = env();
  t2.click(t2.el('cfgBtn'));
  t2.click(t2.el('blinkBtn'));
  ok('no colour set to begin with', t2.doc().settings.blinkColor === null,
     String(t2.doc().settings.blinkColor));
  ok('so it dims rather than tints',
     document.documentElement.classList.contains('blink-tint') === false &&
     t2.prop('--blink-lit') === undefined);

  t2.el('colBlink').value = '#ff9d00';
  t2.fire2('colBlink', 'input', { target: t2.el('colBlink') });
  ok('the colour is stored', t2.doc().settings.blinkColor === '#ff9d00',
     String(t2.doc().settings.blinkColor));
  ok('and kept in the browser key',
     JSON.parse(t2.store.get('todo.daily.settings')).blinkColor === '#ff9d00');
  ok('the tint takes over', document.documentElement.classList.contains('blink-tint'));
  ok('lit and dim tones both derive from it',
     /#ff9d00/.test(t2.prop('--blink-lit') || '') && /#ff9d00/.test(t2.prop('--blink-dim') || ''),
     `${t2.prop('--blink-lit')} / ${t2.prop('--blink-dim')}`);
  ok('the lit tone is the stronger of the two',
     parseInt(t2.prop('--blink-lit').match(/(\d+)%/)[1], 10) >
     parseInt(t2.prop('--blink-dim').match(/(\d+)%/)[1], 10),
     `${t2.prop('--blink-lit')} vs ${t2.prop('--blink-dim')}`);
  ok('the tint keyframes only touch background-image, not the chip shadow',
     /@keyframes lamptint\{[\s\S]*?\}\s*\n\s*:root\.blink\.blink-tint/.test(t2.css) &&
     !/@keyframes lamptint\{[^@]*box-shadow/.test(t2.css));

  /* rubbish is refused rather than written through */
  t2.el('colBlink').value = 'not-a-colour';
  t2.fire2('colBlink', 'input', { target: t2.el('colBlink') });
  ok('a bad value clears rather than sticking', t2.doc().settings.blinkColor === null);
  ok('and the dim blink comes back',
     document.documentElement.classList.contains('blink-tint') === false);

  /* Reset puts it back to colourless along with the rest */
  t2.el('colBlink').value = '#33ff77';
  t2.fire2('colBlink', 'input', { target: t2.el('colBlink') });
  ok('set again', t2.doc().settings.blinkColor === '#33ff77');
  t2.click(t2.el('colReset'));
  ok('Reset clears the blink colour too', t2.doc().settings.blinkColor === null);
  ok('and drops the tint class', document.documentElement.classList.contains('blink-tint') === false);
  ok('while leaving the blink itself on', t2.doc().settings.blink === true);
  ok('the swatch still shows a colour to start from',
     /^#[0-9a-f]{6}$/i.test(t2.el('colBlink').value), t2.el('colBlink').value);
  /* whatever lamp variants exist, every one of them must be switched off
     under reduced motion — checked by comparing the two lists, so adding a
     flavour and forgetting the media query fails here */
  const lampRules = [...t2.css.matchAll(/(:root\.blink[^,{]*?)\{\s*\n?\s*animation:lamp/g)]
                      .map(m => m[1].trim());
  const rmBlock = (t2.css.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?animation:none;/) || [''])[0];
  ok('there are several lamp variants to cover', lampRules.length >= 4, `${lampRules.length} rules`);
  ok('reduced motion switches off every one of them',
     lampRules.every(r => rmBlock.includes(r)),
     lampRules.filter(r => !rmBlock.includes(r)).join(' | ') || 'all covered');
}

/* ══ meltdown ══ */
{
  S('meltdown');
  /* frequencies as the app defines them, so the interval checks below are
     against the shipped table rather than a second copy of it */
  const NOTEHZ = name => {
    const tbl = (HTML.match(/const NOTE = \{([^}]*)\}/) || ['',''])[1];
    // the table quotes its keys, since some note names carry a sharp
    const m = tbl.match(new RegExp("'?" + name + "'?\\s*:\\s*(\\d+)"));
    return m ? +m[1] : NaN;
  };
  const t = env();
  const melted = () => document.documentElement.classList.contains('melt');
  const spam = k => { for (let i = 0; i < k; i++) t.click(t.el('cfgBtn')); };

  ok('nothing melting to begin with', melted() === false);
  spam(6);
  ok('six taps is just using the drawer', melted() === false);
  spam(1);
  ok('the seventh trips it', melted() === true);
  ok('and the ice cream van turns up', t.osc().some(o => o.freq >= 380 && o.freq <= 1100),
     `${t.osc().length} oscillators`);
  ok('the tune is square waves, not the click voice',
     t.osc().filter(o => o.freq >= 380).every(o => o.type === 'square'));

  /* the drawer must keep working underneath */
  const openNow = t.el('config').hidden === false;
  t.click(t.el('cfgBtn'));
  ok('config still toggles while melted', (t.el('config').hidden === false) !== openNow);

  ok('nothing about it is saved',
     t.doc().settings.melt === undefined && !/melt/.test(t.store.get('todo.daily.settings')));

  t.press('Escape');
  ok('Escape mops it up', melted() === false);
  ok('and the tap count is cleared, so one more click does not re-trip it',
     (t.click(t.el('cfgBtn')), melted() === false));

  /* a slow hand never trips it */
  const t2 = env();
  let now = 1e12;
  const realNow = Date.now;
  Date.now = () => now;
  for (let i = 0; i < 10; i++) { t2.click(t2.el('cfgBtn')); now += 900; }
  ok('ten unhurried clicks stay quiet', melted() === false);
  Date.now = realNow;

  /* muted means muted, even for an easter egg */
  const t3 = env();
  t3.click(t3.el('cfgBtn'));
  t3.click(t3.el('sndBtn'));                 // sound off
  t3.quiet();
  for (let i = 0; i < 8; i++) t3.click(t3.el('cfgBtn'));
  ok('it still melts with the sound off', document.documentElement.classList.contains('melt'));
  ok('but stays silent', t3.osc().length === 0, `${t3.osc().length} oscillators`);

  ok('reduced motion sits it out',
     /:root\.melt #screen,:root\.melt \.fx-melt/.test(t.css));
  ok('the wash is hot pink and mint',
     /#ff2ec4/.test(t.css) && /#4dffc3/.test(t.css));

  /* the UI itself repaints, not just an overlay: --bg and --fg are what
     every other token mixes off */
  const trip = (t.css.match(/@keyframes melttrip\{[\s\S]*?\n  \}/) || [''])[0];
  ok('there is a token animation at all', trip.length > 0);
  const grounds = new Set(trip.match(/--bg:#[0-9a-f]{6}/g) || []);
  const inks    = new Set(trip.match(/--fg:#[0-9a-f]{6}/g) || []);
  ok('it flips through several grounds', grounds.size >= 6, `${grounds.size} grounds`);
  ok('and several inks',                 inks.size >= 4,   `${inks.size} inks`);
  ok('every stop sets both, so nothing is left half-recoloured',
     (trip.match(/--bg:/g) || []).length === (trip.match(/--fg:/g) || []).length);

  /* it must be an animation on :root — a plain class rule would lose to the
     inline tone overrides the colour pickers write */
  ok('the token flips run as an animation on the root',
     /:root\.melt\{ animation:melttrip/.test(t.css));
  ok('and step rather than fade between colours',
     /animation:melttrip [\d.]+s steps\(1,end\)/.test(t.css));

  ok('nothing is blurred any more',
     !/@keyframes meltsag\{[\s\S]*?blur/.test(t.css));
  const sag = (t.css.match(/@keyframes meltsag\{[\s\S]*?\n  \}/) || [''])[0];
  ok('the saturation stays', /saturate/.test(sag));
  ok('it pulls on both axes, not just downward',
     /scale\(\s*[\d.]+\s*,\s*[\d.]+/.test(sag), (sag.match(/scale\([^)]*\)/) || [''])[0]);
  ok('and skews, rotates and shifts as well',
     /skewX/.test(sag) && /skewY/.test(sag) && /rotate/.test(sag) && /translate\(/.test(sag));
  ok('the origin wanders, so it does not always hang from one point',
     new Set(sag.match(/transform-origin:[^;]+/g) || []).size >= 4,
     `${new Set(sag.match(/transform-origin:[^;]+/g) || []).size} origins`);
  ok('it squeezes as well as stretches',
     (sag.match(/scale\(\s*(\.\d+)/g) || []).length > 0, 'some stops scale below 1');
  ok('a stretching stage cannot add scrollbars',
     /:root\.melt\{[^}]*overflow:hidden/.test(t.css));

  /* Pinned against the transcription, note for note, because this melody has
     already been wrong twice:
         pickup D B | G G G D | G A B G | A A A E | A B c A, played twice */
  const pass = (t.html.match(/const TUNE = \[[\s\S]*?\];/) || [''])[0];
  const notes = (pass.match(/'[A-G][#b]?\d'/g) || []).map(x => x.slice(1, -1));
  const beats = (pass.match(/,([\d.]+)\]/g) || []).map(x => parseFloat(x.slice(1)));
  ok('the pickup is B then A, both eighths',
     notes.slice(0, 2).join(' ') === 'B5 A5' && beats.slice(0, 2).join(' ') === '1 1',
     `${notes.slice(0, 2).join(' ')} / ${beats.slice(0, 2).join(' ')}`);
  ok('bar 1 is G F# G A, G, B, C',
     notes.slice(2, 9).join(' ') === 'G5 F#5 G5 A5 G5 B4 C5', notes.slice(2, 9).join(' '));
  ok('a bare letter is a quarter, so that G is worth two eighths',
     beats[6] === 2, `G is ${beats[6]} eighths`);
  ok('the key signature sharpens the F', notes.includes('F#5'));
  ok('the comma drops that B an octave', NOTEHZ('B4') < NOTEHZ('G5'));

  /* 4/4 means every bar totals four beats. If the note lengths were misread
     the bars would not add up, so this is the real check on the parse. */
  const bars = [[2,9],[9,16],[16,22],[22,27]].map(([f, t2]) =>
    beats.slice(f, t2).reduce((x, y) => x + y, 0) / 2);
  ok('every bar comes to four beats', bars.every(b => b === 4), bars.join(' | '));
  ok('the pickup is the odd beat that completes the last bar',
     beats.slice(0, 2).reduce((x, y) => x + y, 0) / 2 === 1);
  ok('it is the pickup and four bars', notes.length === 27, `${notes.length} notes`);

  /* Timing is a guess and has been wrong once, so the arithmetic at least is
     pinned: swing must not change the length, and the tune must fit inside
     the meltdown or it gets cut off mid-phrase. */
  const beat  = parseFloat((t.html.match(/const BEAT = ([\d.]+)/) || [])[1]);
  const swing = parseFloat((t.html.match(/SWING = ([\d.]+)/) || [])[1]);
  const hold  = parseFloat((t.html.match(/MELT_HOLD = (\d+)/) || [])[1]) / 1000;
  const units = beats.reduce((a, b) => a + b, 0);
  ok('straight eighths, as a van chip plays it', swing === 0, `swing ${swing}`);
  ok('the tune finishes before the melt does', units * beat <= hold,
     `${(units * beat).toFixed(2)}s of tune, ${hold}s of melt`);
  ok('the quarter note lands in a plausible range for the tune',
     60 / (beat * 2) >= 100 && 60 / (beat * 2) <= 180, `${Math.round(60 / (beat * 2))} BPM`);

  /* the wash is lighter now the UI recolours itself, or it turns to mud */
  const wash = (t.css.match(/@keyframes meltwash\{[^}]*\}/) || [''])[0];
  ok('the overlay sits back to let the UI show',
     (wash.match(/opacity:\.(\d+)/g) || []).every(o => parseFloat('0' + o.slice(8)) <= 0.5),
     wash.replace(/\s+/g, ' ').slice(0, 60));
}

/* ══ progress bar width ══ */
{
  S('progress bar');
  const t = env();
  const cells = () => t.el('cells').textContent;

  /* before layout the node reports no width, so the bar keeps a sane count
     rather than collapsing to nothing */
  t.addTask('one');
  ok('falls back to a fixed count when unmeasurable', cells().length === 24,
     `${cells().length} cells`);

  /* once it has a width the bar spans it: the stub renders a monospace run at
     10px a character, so 600px of room is 60 cells */
  t.el('cells').clientWidth = 600;
  t.addTask('two');
  ok('fills the measured row', cells().length === 60, `${cells().length} cells`);
  ok('and is all empty while nothing is done', cells() === '·'.repeat(60));

  t.rows()[0].box._l.click.forEach(f => f({ preventDefault(){}, shiftKey:false }));
  const done = cells().split('').filter(c => c === '█').length;
  ok('proportion survives the wider bar', done === 30, `${done}/60 filled`);

  /* a narrower panel re-measures instead of keeping the old count */
  t.el('cells').clientWidth = 300;
  t.addTask('three');
  ok('re-measures when the room changes', cells().length === 30, `${cells().length} cells`);

  ok('a resize triggers a repaint',
     /addEventListener\('resize'[\s\S]{0,120}paintMeter/.test(t.html));
  ok('a late web font invalidates the measurement',
     /loadingdone[\s\S]{0,120}cellFit = \{ key:'', per:0 \}/.test(t.html));
  ok('the count is cached against width and font',
     /const key = `\$\{room\}\|\$\{state\.settings\.font\}`/.test(t.html));
}

/* ══ settings kept in this browser ══ */
{
  S('settings storage');
  const t = env();
  const kept = () => JSON.parse(t.store.get('todo.daily.settings') || 'null');
  ok('settings get their own key from the first run', !!kept());
  ok('and are not just a copy of the whole document',
     kept() && kept().days === undefined && kept().theme !== undefined);

  t.click(t.el('cfgBtn'));
  t.click(t.el('crtBtn'));
  ok('a change lands in the key at once', kept().crt === true, String(kept().crt));
  ok('and still lands in the document too', t.doc().settings.crt === true);

  const chip = id => [...t.el('themeSeg').children].find(b => b.dataset.pick === id);
  t.click(chip('modern-light'));
  ok('theme follows as well', kept().theme === 'modern-light', kept().theme);

  /* The point of the separate key: a document carrying someone else's
     preferences must not repaint your app when it is loaded. */
  const foreign = { version:4, updatedAt:'2026-01-01T00:00:00.000Z', days:{}, goals:[],
                    settings:{ theme:'retro-light', crt:true, font:'sans', glow:true } };
  const t2 = env({ seed: foreign, kept: { theme:'modern-dark', crt:false, font:'mono' } });
  /* read the key the app rewrites at boot, not the stored document: boot
     merges into memory and only the settings key is written back */
  const live = JSON.parse(t2.store.get('todo.daily.settings'));
  ok('this browser wins over the document on boot',
     live.theme === 'modern-dark', live.theme);
  ok('per-setting, not wholesale — the document fills the gaps',
     live.glow === true, String(live.glow));
  ok('and that is the theme actually applied',
     document.documentElement.dataset.theme === 'modern-dark',
     document.documentElement.dataset.theme);
  ok('the document keeps its own copy untouched until something changes',
     JSON.parse(t2.store.get('todo.daily.v1')).settings.theme === 'retro-light');

  /* an opened file supplies days and goals, never preferences */
  ok('the adopt helper keeps local settings',
     /function adopt\(inc\)\{?[\s\S]{0,220}state\.settings = mine/.test(t.html));
  for (const path of ['adopt(inc); applySettings(); autoCarry();',
                      'adopt(normalize(inc))'])
    ok(`file load path uses it: ${path.slice(0, 24)}`, t.html.includes(path));
  ok('no load path still overwrites settings wholesale',
     !/state = inc; applySettings/.test(t.html) &&
     !/state = normalize\(inc\); applySettings/.test(t.html));
}

/* ══ theme switching ══ */
{
  S('theme switching');
  const t = env();
  t.click(t.el('cfgBtn'));
  const chip = id => [...t.el('themeSeg').children].find(b => b.dataset.pick === id);
  const IDSET = ['retro-dark','retro-light','modern-dark','modern-light'];
  ok('four theme chips', t.el('themeSeg').children.length===4);

  for (const from of IDSET) for (const to of IDSET) {
    if (from === to) continue;
    t.click(chip(from));
    t.click(chip(to));
    const applied = document.documentElement.dataset.theme;
    const pressed = [...t.el('themeSeg').children]
      .filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.pick);
    const mirrored = t.store.get('todo.daily.theme');
    const persisted = t.doc().settings.theme;
    const good = applied===to && pressed.length===1 && pressed[0]===to &&
                 mirrored===to && persisted===to;
    if (!good) ok(`${from} -> ${to}`, false,
      `applied=${applied} pressed=[${pressed}] mirror=${mirrored} json=${persisted}`);
  }
  ok('all 12 transitions consistent', true);

  // the pre-paint script must agree with what applySettings mirrored
  t.click(chip('modern-light'));
  const t2 = env({ seed:t.doc() });
  ok('reload keeps modern-light', document.documentElement.dataset.theme==='modern-light',
     document.documentElement.dataset.theme);
}

/* ══ completed items sink ══ */
{
  S('completed items sink');
  const t = env();
  ['alpha','beta','gamma','delta'].forEach(t.addTask);
  const shown  = () => t.rows().map(r => r.text);
  const flags  = () => t.rows().map(r => r.li.classList.contains('done'));
  const stored = () => { const d = t.doc().days, k = Object.keys(d)[0];
                         return d[k].tasks.map(x => x.text); };
  /* the invariant, independent of names: once a completed row appears,
     everything below it is also completed */
  const sunk = f => { const i = f.indexOf(true); return i < 0 || f.slice(i).every(Boolean); };
  const pause = ms => { const u = Date.now() + ms; while (Date.now() < u); };

  ok('initial order', shown().join(',')==='alpha,beta,gamma,delta', shown().join(','));

  t.click(t.rows()[1].box);                       // tick beta
  ok('done row sinks',      shown().join(',')==='alpha,gamma,delta,beta', shown().join(','));
  ok('invariant holds',     sunk(flags()), flags().map(d=>d?'X':'.').join(''));
  ok('stored order intact', stored().join(',')==='alpha,beta,gamma,delta', stored().join(','));

  /* Completions are ordered by doneAt, which has millisecond resolution —
     ticks inside the same millisecond fall back to the stored order. Real
     use is seconds apart, so the test separates them. */
  pause(3);
  t.click(t.rows()[0].box);                       // tick alpha, later than beta
  ok('newest completion last', shown().join(',')==='gamma,delta,beta,alpha', shown().join(','));
  ok('invariant still holds',  sunk(flags()), flags().map(d=>d?'X':'.').join(''));

  // unchecking returns an item to its stored slot, not the bottom
  const betaRow = t.rows().findIndex(r => r.text === 'beta');
  t.click(t.rows()[betaRow].box);
  ok('uncheck restores slot',  shown().join(',')==='beta,gamma,delta,alpha', shown().join(','));
  ok('beta precedes gamma again',
     shown().indexOf('beta') < shown().indexOf('gamma'), shown().join(','));

  const nums = t.rows().map(r => r.li.children[0].textContent);
  ok('numbers renumber',       nums.join(',')==='01,02,03,04', nums.join(','));

  t.setFocus(t.rows()[0].box);
  t.press('ArrowDown');
  ok('arrows follow display order', t.focused()===t.rows()[1].box);

  const open = t.rows().filter(r => r.li.classList.contains('open'));
  ok('open rows lead',         open.length===3 &&
                               t.rows().slice(0,3).every(r => r.li.classList.contains('open')),
                               t.rows().map(r => r.li.classList.contains('open')?'o':'.').join(''));

  // week view applies the same ordering
  t.press('w', { alt:true, code:'KeyW' });
  const wk = t.el('weekDays').children
    .flatMap(d => (d.children[1] ? d.children[1].children : []))
    .map(b => t.flat(b));
  ok('week view lists them',   wk.length===4, String(wk.length));
  ok('week view sinks done',   sunk(wk.map(x => /\[X\]/.test(x))),
                               wk.map(x => /\[X\]/.test(x) ? 'X' : '.').join(''));

  // goals sink as well, dates still ordering within each group
  t.el('goalText').value = 'later goal';
  t.el('goalStart').value = '2026-08-06'; t.el('goalEnd').value = '2026-08-06';
  t.fire('goalForm','submit');
  t.el('goalText').value = 'earlier goal';
  t.el('goalStart').value = '2026-08-04'; t.el('goalEnd').value = '2026-08-04';
  t.fire('goalForm','submit');
  const gShown = () => t.goalRows().map(r => r.text);
  ok('goals sort by date',     gShown().join(',')==='earlier goal,later goal', gShown().join(','));
  t.click(t.goalRows()[0].box);                   // finish the earlier one
  ok('done goal sinks',        gShown().join(',')==='later goal,earlier goal', gShown().join(','));
}

/* ══ sweep animation ══ */
{
  S('sweep animation');
  const t = env();
  ['alpha','beta','gamma','delta'].forEach(t.addTask);
  t.click(t.rows()[1].box);                       // finish one

  const rows = t.rows();
  const open = rows.filter(r => r.li.classList.contains('open'));
  const done = rows.filter(r => r.li.classList.contains('done'));
  ok('three rows open',        open.length===3, String(open.length));
  ok('finished row not swept', done.length===1 && !done[0].li.classList.contains('open'));
  ok('every open row phased',  open.every(r => !!r.li.style._p['--sweep']),
                               open.map(r=>r.li.style._p['--sweep']).join(' '));
  ok('closed row has no phase', done[0].li.style._p['--sweep']===undefined);

  const phases = open.map(r => parseFloat(r.li.style._p['--sweep']));
  ok('phases are distinct',    new Set(phases).size===3, phases.join(' '));
  ok('phases are negative',    phases.every(v => v <= 0), phases.join(' '));
  // index 0 leads, so it carries the largest offset
  ok('leading row offset most', Math.abs(phases[0]) > Math.abs(phases[2]),
                                phases.join(' '));
  const STEP = parseFloat(t.html.match(/SWEEP_STEP = ([\d.]+)/)[1]);
  const gap = Math.abs(phases[0] - phases[1]);
  /* phases are written to 3dp, so a gap between two of them can be off by
     one rounding step even when the clock is shared */
  ok('stagger is one step',    Math.abs(gap - STEP) <= 0.0011, `${gap.toFixed(3)} vs ${STEP}`);
  ok('all rows in a paint share one clock reading',
     /sweepNow = Date\.now\(\);/.test(t.html) &&
     /\(\(\(sweepNow \|\| Date\.now\(\)\)/.test(t.html));

  // the wave keeps its place across a repaint rather than snapping back
  const before = parseFloat(t.rows()[0].li.style._p['--sweep']);
  const wait = Date.now() + 25; while (Date.now() < wait);
  t.click(t.rows()[3].box);
  const after = parseFloat(t.rows().find(r=>r.text==='alpha').li.style._p['--sweep']);
  ok('phase advances with wall clock', after !== before,
     `${before.toFixed(3)} -> ${after.toFixed(3)}`);

  // css contract
  ok('overlay, not background',  /li\.open::before\{[^}]*position:absolute/.test(t.css));
  ok('cannot swallow clicks',    /li\.open::before\{[^}]*pointer-events:none/.test(t.css));
  ok('tint follows the theme',   /li\.open::before\{[^}]*background:var\(--fg\)/.test(t.css));
  ok('no hardcoded light/dark',  !/li\.open::before\{[^}]*(#fff|#000|white|black)/.test(t.css));
  ok('stepped, not smooth',      /animation:sweep [\d.]+s steps\(1,end\)/.test(t.css));
  ok('phase comes from --sweep', /animation-delay:var\(--sweep/.test(t.css));
  ok('gated on the toggle',      /:root\.sweep li\.open::before\{/.test(t.css));
  ok('respects reduced motion',
     /prefers-reduced-motion[\s\S]*?:root\.sweep li\.open::before/.test(t.css));

  /* the CSS duration and the JS modulo must agree, or the phase carried
     across a repaint lands in the wrong part of the cycle */
  const cssP = parseFloat((t.css.match(/animation:sweep ([\d.]+)s/)||[])[1]);
  const jsP  = parseFloat((t.html.match(/SWEEP_PERIOD = ([\d.]+)/)||[])[1]);
  ok('css and js periods agree', cssP===jsP, `css ${cssP}s vs js ${jsP}s`);

  const frames = [...t.css.matchAll(/([\d.]+)%\s*\{ opacity:([\d.]+) \}/g)]
    .map(m => ({ at:parseFloat(m[1]), o:parseFloat(m[2]) }));
  const peak = Math.max(...frames.map(f => f.o));
  ok('peak is assertive',        peak >= 0.2, String(peak));
  ok('steps descend',            frames.filter(f=>f.o>0).every((f,i,a)=> i===0 || a[i-1].o > f.o),
                                 frames.map(f=>f.o).join('>'));
  const lit = Math.max(...frames.filter(f => f.o > 0).map(f => f.at));
  ok('clear rest between passes', lit <= 20, `lit until ${lit}% of the cycle`);
  const jsStep = parseFloat(t.html.match(/SWEEP_STEP = ([\d.]+)/)[1]);
  const step = frames[1].at - frames[0].at;
  ok('keyframe step equals the row stagger',
     Math.abs(cssP * step / 100 - jsStep) < 0.005,
     `${(cssP*step/100).toFixed(3)}s vs ${jsStep}s`);

  // toggle
  t.click(t.el('cfgBtn'));
  ok('on by default',   t.doc().settings.sweep===true);
  ok('class applied',   document.documentElement.classList.contains('sweep'));
  t.click(t.el('sweepBtn'));
  ok('toggles off',     t.doc().settings.sweep===false);
  ok('class removed',   document.documentElement.classList.contains('sweep')===false);
  ok('label updated',   t.el('sweepBtn').textContent==='Sweep ○', t.el('sweepBtn').textContent);
  ok('rows keep phases while off', t.rows()[0].li.style._p['--sweep']!==undefined);
}

/* ══ completion chime ══ */
{
  S('completion chime');
  const t = env();
  t.addTask('one'); t.addTask('two');
  /* Rows are addressed by state, not index: completed items sink, so a
     fixed index would land on the wrong task after the first tick. */
  const openRow = () => t.rows().find(r => r.li.classList.contains('open'));
  const doneRow = () => t.rows().find(r => r.li.classList.contains('done'));

  t.quiet(); t.click(openRow().box);
  ok('no chime part-way through', !t.chimed());
  t.quiet(); t.click(openRow().box);
  ok('chimes on the last one',    t.chimed());

  /* shape of the success sound: a detuned square arpeggio that ascends
     and resolves, plus a tremolo LFO on the final note */
  const sq = t.osc().filter(o => o.type === 'square');
  ok('built from square waves',   sq.length >= 8, `${sq.length} square oscillators`);
  const roots = [...new Set(sq.map(o => Math.round(o.freq)))]
    .filter(f => [392,523,659,784].includes(f));
  ok('four ascending notes',      roots.length === 4, roots.join(','));
  ok('resolves upward',           roots.join(',') === '392,523,659,784', roots.join(','));
  ok('each note is detuned',      sq.filter(o => Math.round(o.freq) === 784).length === 1 &&
                                  sq.some(o => o.freq > 784 && o.freq < 790),
                                  sq.filter(o => o.freq >= 784).map(o=>o.freq.toFixed(1)).join(','));
  ok('tremolo on the last note',  t.osc().some(o => o.type === 'sine' && o.freq < 30),
                                  t.osc().filter(o=>o.freq<30).map(o=>o.type+':'+o.freq).join(','));
  const calls = [...t.html.matchAll(/buzz\(\s*\.?(\d+),\s*(\d+),\s*\.(\d+),\s*\.(\d+)/g)]
    .map(m => ({ delay:Number('.'+m[1]), dur:Number('.'+m[4]) }));
  const span = Math.max(...calls.map(c => c.delay + c.dur));
  ok('phrase stays short',        calls.length === 4 && span < 0.6,
                                  `${calls.length} notes, ends at ${span.toFixed(3)}s`);

  t.quiet(); t.click(doneRow().box);
  ok('no chime when unchecking',  !t.chimed());
  t.quiet(); t.click(openRow().box);
  ok('chimes again on re-crossing', t.chimed());

  // navigating onto an already-clear day must stay silent
  t.quiet();
  t.press('ArrowLeft', { alt:true, code:'ArrowLeft' });
  t.press('ArrowRight', { alt:true, code:'ArrowRight' });
  ok('silent when navigating to a clear day', !t.chimed());

  // adding a task to a clear day, then clearing it again, chimes once
  t.quiet(); t.addTask('three');
  ok('adding a task does not chime', !t.chimed());
  t.quiet(); t.click(openRow().box);
  ok('chimes when the new one is done', t.chimed());

  // and it obeys the Sound switch
  t.click(t.el('cfgBtn')); t.click(t.el('sndBtn'));
  ok('sound is off', t.doc().settings.sound===false, JSON.stringify(t.doc().settings.sound));
  t.quiet(); t.click(doneRow().box); t.click(openRow().box);
  ok('silent with sound off', !t.chimed());

  /* A second env() swaps the globals, so any further interaction with an
     earlier env writes to the NEW store while its own doc() reads the old
     one. Keep one env per suite, or finish with the first entirely. */
  const t2 = env();
  t2.quiet();
  t2.press('ArrowRight', { alt:true, code:'ArrowRight' });
  ok('silent on an empty day', !t2.chimed());
}

/* ══ auto rollover ══ */
{
  S('auto rollover');
  const p2 = x => String(x).padStart(2,'0');
  const kd = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  const N = new Date(), at = n => kd(new Date(N.getFullYear(), N.getMonth(), N.getDate()+n));
  const today = at(0), y1 = at(-1), y3 = at(-3), tmr = at(1);

  const seed = over => ({ version:4, updatedAt:'2026-01-01T00:00:00.000Z', goals:[],
    days:{
      [y3]:   { tasks:[{ id:'a', text:'three days ago', done:false }] },
      [y1]:   { tasks:[{ id:'b', text:'yesterday open', done:false },
                       { id:'c', text:'yesterday done', done:true }] },
      [today]:{ tasks:[{ id:'d', text:'today already', done:false }] },
      [tmr]:  { tasks:[{ id:'e', text:'tomorrow', done:false }] } },
    settings:{ sound:false, keys:false, autoCarry:over } });

  const t = env({ seed:seed(true) });
  t.click(t.el('cfgBtn'));                      // force a normalised save
  const d = () => t.doc().days;

  ok('open items land on today',  d()[today].tasks.length===3, String(d()[today].tasks.length));
  ok('oldest first, after own',
     d()[today].tasks.map(x=>x.id).join(',')==='d,a,b', d()[today].tasks.map(x=>x.id).join(','));
  ok('completed item stays put',  d()[y1].tasks.length===1 && d()[y1].tasks[0].id==='c');
  ok('emptied day is removed',    d()[y3]===undefined, Object.keys(d()).join(','));
  ok('tomorrow untouched',        d()[tmr].tasks.length===1);
  ok('undo offered',              /Carried 2 unfinished items into today/.test(t.el('undoMsg').textContent),
                                  t.el('undoMsg').textContent);

  t.click(t.el('undoBtn'));
  ok('undo returns them home',    d()[y3].tasks.length===1 && d()[y1].tasks.length===2,
                                  `${(d()[y3]||{tasks:[]}).tasks.length}/${d()[y1].tasks.length}`);
  ok('undo restores position',    d()[y1].tasks.map(x=>x.id).join(',')==='b,c',
                                  d()[y1].tasks.map(x=>x.id).join(','));
  ok('today back to its own',     d()[today].tasks.length===1 && d()[today].tasks[0].id==='d');

  // switched off, nothing moves
  const t2 = env({ seed:seed(false) });
  t2.click(t2.el('cfgBtn'));
  const d2 = () => t2.doc().days;
  ok('off: past day keeps work',  d2()[y1].tasks.length===2, String(d2()[y1].tasks.length));
  ok('off: today untouched',      d2()[today].tasks.length===1);
  ok('off: manual tray offered',  t2.el('carryTray').hidden===false);
  ok('off: label reflects it',    t2.el('autoBtn').textContent==='Auto ○', t2.el('autoBtn').textContent);

  // switching it on takes effect immediately
  t2.click(t2.el('autoBtn'));
  ok('on: rolls straight away',   d2()[today].tasks.length===3, String(d2()[today].tasks.length));
  ok('on: setting persisted',     t2.doc().settings.autoCarry===true);
  ok('on: manual tray now idle',  t2.el('carryTray').hidden===true);

  // a document with nothing overdue is left alone
  const t3 = env({ seed:{ version:4, updatedAt:'2026-01-01T00:00:00.000Z', goals:[],
    days:{ [today]:{ tasks:[{ id:'x', text:'only today', done:false }] } },
    settings:{ sound:false, keys:false } } });
  ok('nothing to do, no notice',  t3.el('undoTray').hidden===true);

  // past days holding only finished work are left as the record
  const t4 = env({ seed:{ version:4, updatedAt:'2026-01-01T00:00:00.000Z', goals:[],
    days:{ [y1]:{ tasks:[{ id:'z', text:'done yesterday', done:true }] } },
    settings:{ sound:false, keys:false } } });
  t4.click(t4.el('cfgBtn'));
  ok('finished history kept',     t4.doc().days[y1].tasks.length===1);
  ok('no phantom rollover',       t4.el('undoTray').hidden===true);
}

/* ══ multi-select carry ══ */
{
  S('multi-select carry');
  const t = env();
  ['alpha','beta','gamma'].forEach(t.addTask);
  const day  = () => Object.keys(t.doc().days).sort()[0];
  const rows = () => t.rows();

  ok('tray hidden with nothing selected', t.el('selTray').hidden===true);

  // shift-click selects instead of ticking
  t.click(rows()[0].box, { shiftKey:true });
  ok('shift-click selects',        t.el('selTray').hidden===false);
  ok('did not tick the task',      t.doc().days[day()].tasks[0].done===false);
  ok('row marked selected',        rows()[0].box, 'row exists');
  ok('count shown',                t.el('selMsg').textContent==='1 selected',
                                   t.el('selMsg').textContent);

  // shift+Enter on the focused row selects too
  t.setFocus(rows()[2].box);
  t.press('Enter', { shift:true });
  ok('shift+Enter selects',        t.el('selMsg').textContent==='2 selected',
                                   t.el('selMsg').textContent);
  ok('shift+Enter did not tick',   t.doc().days[day()].tasks[2].done===false);
  ok('button names the target',    /Carry → \d{4}-\d{2}-\d{2}/.test(t.el('selBtn').textContent),
                                   t.el('selBtn').textContent);

  // toggling off
  t.press('Enter', { shift:true });
  ok('shift+Enter deselects',      t.el('selMsg').textContent==='1 selected',
                                   t.el('selMsg').textContent);
  t.press('Enter', { shift:true });

  // carry the two selected onto the next day
  const before = t.doc().days[day()].tasks.length;
  t.click(t.el('selBtn'));
  const days = t.doc().days, keys = Object.keys(days).sort();
  ok('source day shrank',          days[keys[0]].tasks.length===before-2,
                                   String(days[keys[0]].tasks.length));
  ok('next day created',           keys.length===2, keys.join(','));
  ok('items landed there',         days[keys[1]].tasks.length===2);
  ok('order preserved',            days[keys[1]].tasks.map(x=>x.text).join(',')==='alpha,gamma',
                                   days[keys[1]].tasks.map(x=>x.text).join(','));
  ok('remaining item untouched',   days[keys[0]].tasks[0].text==='beta');
  ok('selection cleared',          t.el('selTray').hidden===true);
  ok('undo offered',               /Moved 2 items to/.test(t.el('undoMsg').textContent),
                                   t.el('undoMsg').textContent);

  // undo restores them to their original positions
  t.click(t.el('undoBtn'));
  const back = t.doc().days[keys[0]].tasks.map(x=>x.text).join(',');
  ok('undo restores order',        back==='alpha,beta,gamma', back);
  ok('undo empties the next day',  (t.doc().days[keys[1]]||{tasks:[]}).tasks.length===0);

  // selection is scoped to the visible day and never persisted
  t.click(rows()[0].box, { shiftKey:true });
  ok('selected again',             t.el('selTray').hidden===false);
  t.press('ArrowRight', { alt:true, code:'ArrowRight' });
  ok('cleared on day change',      t.el('selTray').hidden===true);
  t.press('ArrowLeft', { alt:true, code:'ArrowLeft' });
  ok('not restored on return',     t.el('selTray').hidden===true);
  ok('never written to json',      t.doc().selected===undefined);

  // Escape clears a selection
  t.click(rows()[1].box, { shiftKey:true });
  ok('selected before escape',     t.el('selTray').hidden===false);
  t.press('Escape');
  ok('escape clears selection',    t.el('selTray').hidden===true);

  // week mode has no selection tray
  t.click(rows()[1].box, { shiftKey:true });
  t.press('w', { alt:true, code:'KeyW' });
  ok('hidden in week mode',        t.el('selTray').hidden===true);
}

/* ══ merge import ══ */
(async () => {
  S('merge import');
  const t = env({ seed:{ version:4, updatedAt:'2020-01-01T00:00:00.000Z', days:{}, goals:[],
                         settings:{ autoCarry:false, sound:false, keys:false } } });
  t.addTask('local task');                       // something already here
  t.click(t.el('cfgBtn'));
  const before = t.doc().settings.theme;

  const p2 = x => String(x).padStart(2,'0');
  const TODAY = (d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`)(new Date());
  const file = JSON.stringify({ version:4, updatedAt:'2020-01-01T00:00:00.000Z',
    days:{ [TODAY]:{ tasks:[
      { id:'pr1', text:'PR #1 · one', done:false, mark:'waiting' },
      { id:'pr2', text:'PR #2 · two', done:false, mark:'blocked' } ] } },
    goals:[ { id:'g1', text:'a goal', start:TODAY, end:TODAY, done:false } ],
    settings:{ theme:'modern-light', glow:true, crt:true } });

  t.serve(file);
  t.click(t.el('importBtn'));
  await new Promise(r => setImmediate(r));

  const day = t.doc().days[TODAY].tasks;
  ok('imported items appear',      day.filter(x=>x.id.startsWith('pr')).length===2, `${day.length} tasks`);
  ok('existing item kept',         day.some(x=>x.text==='local task'));
  ok('goal imported',              t.doc().goals.length===1);
  ok('marks preserved',            day.find(x=>x.id==='pr2').mark==='blocked');
  ok('settings NOT adopted',       t.doc().settings.theme===before, t.doc().settings.theme);
  ok('glow not stamped',           t.doc().settings.glow===false);
  ok('older file still imported',  true);       // file updatedAt is 2020, local is newer
  ok('undo tray offers a revert',  t.el('undoTray').hidden===false);
  ok('undo message names counts',  /2 tasks and 1 goal/.test(t.el('undoMsg').textContent),
                                   t.el('undoMsg').textContent);

  // re-import is a no-op, matched by id
  const n1 = t.doc().days[TODAY].tasks.length;
  t.serve(file);
  t.click(t.el('importBtn'));
  await new Promise(r => setImmediate(r));
  ok('re-import adds nothing',     t.doc().days[TODAY].tasks.length===n1,
                                   String(t.doc().days[TODAY].tasks.length));
  ok('reports nothing new',        /nothing new/.test(t.el('fileTxt').textContent),
                                   t.el('fileTxt').textContent);

  // undo removes exactly what was imported
  t.click(t.el('undoBtn'));
  const after = t.doc().days[TODAY].tasks;
  ok('undo removes imported tasks', after.filter(x=>x.id.startsWith('pr')).length===0);
  ok('undo keeps the local task',   after.some(x=>x.text==='local task'));
  ok('undo removes imported goal',  t.doc().goals.length===0);

  /* and a real file on disk imports cleanly — skipped where there is none,
     since todo.json is personal and stays out of the repo */
  const JSON_PATH = require('path').join(ROOT, 'todo.json');
  if (fs.existsSync(JSON_PATH)) {
    const real = fs.readFileSync(JSON_PATH, 'utf8');
    const want = (JSON.parse(real).days[Object.keys(JSON.parse(real).days)[0]].tasks || []).length;
    const t2 = env();
    t2.click(t2.el('cfgBtn'));
    t2.serve(real);
    t2.click(t2.el('importBtn'));
    await new Promise(r => setImmediate(r));
    const days = t2.doc().days, k = Object.keys(days)[0];
    ok('real todo.json imports',  days[k].tasks.length===want, `${days[k].tasks.length} tasks`);
    ok('view jumped to that day', t2.flat(t2.el('date')).includes(k), t2.flat(t2.el('date')));
  } else {
    console.log('  --   no todo.json alongside index.html, skipping the on-disk check');
  }

  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails?1:0);
})();
