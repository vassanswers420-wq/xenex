/**
 * TixWatcher — ThemeManager Module
 * Manages color themes and CSS variable injection.
 */

'use strict';

const ThemeManager = (() => {
  const THEMES = {
    terminal: {
      label: 'Terminal',
      vars: {
        '--bg0':'#080a0e','--bg1':'#0c0f14','--bg2':'#111418','--bg3':'#181c22','--bg4':'#1f242c',
        '--border':'#252b35','--border2':'#303844','--border3':'#3d4757',
        '--text1':'#dde3ee','--text2':'#8a95a8','--text3':'#4a5568',
        '--up':'#00d97e','--upd':'rgba(0,217,126,0.10)','--dn':'#ff4757','--dnd':'rgba(255,71,87,0.10)',
        '--accent':'#f0a500','--accentd':'rgba(240,165,0,0.12)',
        '--blue':'#3d9cff','--blued':'rgba(61,156,255,0.10)',
        '--up-c':'#26c6a0','--dn-c':'#ef5777','--line-c':'#3d9cff',
        '--bar':'#0e1218','--bar-border':'#1c2230','--candle-bg':'#0a0c11','--grid':'#151b26'
      }
    },
    dawn: {
      label: 'Dawn',
      vars: {
        '--bg0':'#f8f4ef','--bg1':'#f2ece3','--bg2':'#ebe1d4','--bg3':'#dfd2c1','--bg4':'#d3c4ae',
        '--border':'#c4b09a','--border2':'#b09080','--border3':'#907060',
        '--text1':'#2a1f14','--text2':'#6b5240','--text3':'#a08870',
        '--up':'#2d7a4f','--upd':'rgba(45,122,79,0.12)','--dn':'#c0392b','--dnd':'rgba(192,57,43,0.12)',
        '--accent':'#c77b2b','--accentd':'rgba(199,123,43,0.15)',
        '--blue':'#3b6db0','--blued':'rgba(59,109,176,0.1)',
        '--up-c':'#2d7a4f','--dn-c':'#c0392b','--line-c':'#3b6db0',
        '--bar':'#e8ddd0','--bar-border':'#c4b09a','--candle-bg':'#f0e8dc','--grid':'#d8cfc4'
      }
    },
    ocean: {
      label: 'Ocean',
      vars: {
        '--bg0':'#050e1a','--bg1':'#071525','--bg2':'#0a1d30','--bg3':'#0e273e','--bg4':'#13304c',
        '--border':'#1a3d55','--border2':'#245070','--border3':'#306585',
        '--text1':'#c8e8f8','--text2':'#7ab0cc','--text3':'#3d6880',
        '--up':'#00e5cc','--upd':'rgba(0,229,204,0.12)','--dn':'#ff6b6b','--dnd':'rgba(255,107,107,0.12)',
        '--accent':'#00b4d8','--accentd':'rgba(0,180,216,0.15)',
        '--blue':'#48cae4','--blued':'rgba(72,202,228,0.1)',
        '--up-c':'#00e5cc','--dn-c':'#ff6b6b','--line-c':'#48cae4',
        '--bar':'#081828','--bar-border':'#1a3d55','--candle-bg':'#060f1c','--grid':'#0d2235'
      }
    },
    ember: {
      label: 'Ember',
      vars: {
        '--bg0':'#100803','--bg1':'#180d04','--bg2':'#201208','--bg3':'#2a180a','--bg4':'#341e0c',
        '--border':'#4a2810','--border2':'#60341a','--border3':'#784020',
        '--text1':'#f5dcc8','--text2':'#b8855a','--text3':'#6b4230',
        '--up':'#ffaa00','--upd':'rgba(255,170,0,0.12)','--dn':'#ff4444','--dnd':'rgba(255,68,68,0.12)',
        '--accent':'#ff6d00','--accentd':'rgba(255,109,0,0.15)',
        '--blue':'#ff8c42','--blued':'rgba(255,140,66,0.1)',
        '--up-c':'#ffaa00','--dn-c':'#ff4444','--line-c':'#ff8c42',
        '--bar':'#1c0e06','--bar-border':'#4a2810','--candle-bg':'#120904','--grid':'#241408'
      }
    },
    matrix: {
      label: 'Matrix',
      vars: {
        '--bg0':'#000300','--bg1':'#010501','--bg2':'#020803','--bg3':'#030c04','--bg4':'#041006',
        '--border':'#0a2010','--border2':'#143020','--border3':'#1c4030',
        '--text1':'#a8ffa8','--text2':'#5abf5a','--text3':'#2a6630',
        '--up':'#00ff41','--upd':'rgba(0,255,65,0.12)','--dn':'#ff2828','--dnd':'rgba(255,40,40,0.12)',
        '--accent':'#39ff14','--accentd':'rgba(57,255,20,0.12)',
        '--blue':'#00cc66','--blued':'rgba(0,204,102,0.1)',
        '--up-c':'#00ff41','--dn-c':'#ff2828','--line-c':'#00cc66',
        '--bar':'#010701','--bar-border':'#0a2010','--candle-bg':'#000400','--grid':'#051a08'
      }
    },
    midnight: {
      label: 'Midnight',
      vars: {
        '--bg0':'#0b0c1a','--bg1':'#0f1022','--bg2':'#14162c','--bg3':'#1a1d38','--bg4':'#212444',
        '--border':'#2a2e58','--border2':'#363b72','--border3':'#42498c',
        '--text1':'#e8e4ff','--text2':'#8888cc','--text3':'#4a4a80',
        '--up':'#7fff7f','--upd':'rgba(127,255,127,0.10)','--dn':'#ff7fa8','--dnd':'rgba(255,127,168,0.10)',
        '--accent':'#9f7cff','--accentd':'rgba(159,124,255,0.15)',
        '--blue':'#5c9fff','--blued':'rgba(92,159,255,0.1)',
        '--up-c':'#7fff7f','--dn-c':'#ff7fa8','--line-c':'#9f7cff',
        '--bar':'#0d0e20','--bar-border':'#2a2e58','--candle-bg':'#090a15','--grid':'#141628'
      }
    }
  };

  /* Live color object — updated whenever theme changes */
  const C = { bg: '#0a0c11', grid: '#151b26', text2: '#8a95a8', up: '#26c6a0', dn: '#ef5777', line: '#3d9cff' };

  let current = 'terminal';
  const _listeners = new Set();

  function apply(id, skipRedraw) {
    const t = THEMES[id]; if (!t) return;
    current = id;
    const root = document.documentElement;
    Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    C.bg   = t.vars['--candle-bg'];
    C.grid = t.vars['--grid'];
    C.text2 = t.vars['--text2'];
    C.up   = t.vars['--up-c'];
    C.dn   = t.vars['--dn-c'];
    C.line = t.vars['--line-c'];

    document.querySelectorAll('.theme-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.theme === id)
    );

    if (!skipRedraw) {
      _listeners.forEach(cb => cb(id));
    }
  }

  function onChange(cb) { _listeners.add(cb);    }
  function offChange(cb){ _listeners.delete(cb); }

  return {
    apply, onChange, offChange,
    getCurrent: () => current,
    getThemes:  () => THEMES,
    C
  };
})();

window.ThemeManager = ThemeManager;
