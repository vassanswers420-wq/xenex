'use strict';

const ThemeManager = (() => {
  const THEMES = {
    terminal: {
      label: 'Terminal',
      vars: {
        '--bg0':'#080a0e','--bg1':'#0c0f14','--bg2':'#111418','--bg3':'#181c22','--bg4':'#1f242c',
        '--border':'#252b35','--border2':'#303844','--border3':'#3d4757',
        '--text1':'#dde3ee','--text2':'#8a95a8','--text3':'#4a5568',
        '--up':'#00d97e','--upd':'rgba(0,217,126,0.10)',
        '--dn':'#ff4757','--dnd':'rgba(255,71,87,0.10)',
        '--accent':'#f0a500','--accentd':'rgba(240,165,0,0.12)',
        '--blue':'#3d9cff','--blued':'rgba(61,156,255,0.10)',
        '--bar':'#0e1218','--bar-border':'#1c2230',
      },
      C: { bg:'#0c0f14', grid:'#151b26', up:'#00d97e', dn:'#ff4757', line:'#3d9cff', text1:'#dde3ee', text2:'#8a95a8', areaFill:'rgba(61,156,255,0.08)' }
    },
    dawn: {
      label: 'Dawn',
      vars: {
        '--bg0':'#f5f1eb','--bg1':'#f8f4ef','--bg2':'#ede8e0','--bg3':'#e4ddd3','--bg4':'#d8d0c6',
        '--border':'#c8c0b5','--border2':'#b8b0a5','--border3':'#a8a098',
        '--text1':'#2c2820','--text2':'#5a5248','--text3':'#8a8278',
        '--up':'#2d7a4f','--upd':'rgba(45,122,79,0.10)',
        '--dn':'#c0392b','--dnd':'rgba(192,57,43,0.10)',
        '--accent':'#c77b2b','--accentd':'rgba(199,123,43,0.12)',
        '--blue':'#2563a8','--blued':'rgba(37,99,168,0.10)',
        '--bar':'#ede8e0','--bar-border':'#d8d0c6',
      },
      C: { bg:'#f8f4ef', grid:'#e4ddd3', up:'#2d7a4f', dn:'#c0392b', line:'#2563a8', text1:'#2c2820', text2:'#5a5248', areaFill:'rgba(37,99,168,0.08)' }
    },
    ocean: {
      label: 'Ocean',
      vars: {
        '--bg0':'#050e1a','--bg1':'#071525','--bg2':'#0a1c30','--bg3':'#0d2340','--bg4':'#102a4e',
        '--border':'#153358','--border2':'#1a3d68','--border3':'#1f4878',
        '--text1':'#c8e4f8','--text2':'#6a9ab8','--text3':'#3a6a88',
        '--up':'#00e5cc','--upd':'rgba(0,229,204,0.10)',
        '--dn':'#ff6b6b','--dnd':'rgba(255,107,107,0.10)',
        '--accent':'#00b4d8','--accentd':'rgba(0,180,216,0.12)',
        '--blue':'#48cae4','--blued':'rgba(72,202,228,0.10)',
        '--bar':'#071525','--bar-border':'#0d2340',
      },
      C: { bg:'#071525', grid:'#0a1c30', up:'#00e5cc', dn:'#ff6b6b', line:'#48cae4', text1:'#c8e4f8', text2:'#6a9ab8', areaFill:'rgba(72,202,228,0.08)' }
    },
    ember: {
      label: 'Ember',
      vars: {
        '--bg0':'#100803','--bg1':'#180c04','--bg2':'#201008','--bg3':'#28140a','--bg4':'#30180c',
        '--border':'#3a1e10','--border2':'#452614','--border3':'#502e18',
        '--text1':'#f5dcc8','--text2':'#a87858','--text3':'#684838',
        '--up':'#ffaa00','--upd':'rgba(255,170,0,0.10)',
        '--dn':'#ff4444','--dnd':'rgba(255,68,68,0.10)',
        '--accent':'#ff6d00','--accentd':'rgba(255,109,0,0.12)',
        '--blue':'#ff9e40','--blued':'rgba(255,158,64,0.10)',
        '--bar':'#180c04','--bar-border':'#28140a',
      },
      C: { bg:'#180c04', grid:'#201008', up:'#ffaa00', dn:'#ff4444', line:'#ff9e40', text1:'#f5dcc8', text2:'#a87858', areaFill:'rgba(255,158,64,0.08)' }
    },
    matrix: {
      label: 'Matrix',
      vars: {
        '--bg0':'#000300','--bg1':'#000500','--bg2':'#000800','--bg3':'#000b00','--bg4':'#000e00',
        '--border':'#001500','--border2':'#001c00','--border3':'#002400',
        '--text1':'#a0ff80','--text2':'#40a020','--text3':'#206010',
        '--up':'#00ff41','--upd':'rgba(0,255,65,0.10)',
        '--dn':'#ff2828','--dnd':'rgba(255,40,40,0.10)',
        '--accent':'#39ff14','--accentd':'rgba(57,255,20,0.12)',
        '--blue':'#00ff88','--blued':'rgba(0,255,136,0.10)',
        '--bar':'#000500','--bar-border':'#000b00',
      },
      C: { bg:'#000500', grid:'#000800', up:'#00ff41', dn:'#ff2828', line:'#00ff88', text1:'#a0ff80', text2:'#40a020', areaFill:'rgba(0,255,136,0.06)' }
    },
    midnight: {
      label: 'Midnight',
      vars: {
        '--bg0':'#0b0c1a','--bg1':'#0e0f20','--bg2':'#121328','--bg3':'#161830','--bg4':'#1a1c38',
        '--border':'#202240','--border2':'#282a50','--border3':'#303360',
        '--text1':'#e8e8f8','--text2':'#8888b8','--text3':'#505080',
        '--up':'#7fff7f','--upd':'rgba(127,255,127,0.10)',
        '--dn':'#ff7fa8','--dnd':'rgba(255,127,168,0.10)',
        '--accent':'#9f7cff','--accentd':'rgba(159,124,255,0.12)',
        '--blue':'#7cb8ff','--blued':'rgba(124,184,255,0.10)',
        '--bar':'#0e0f20','--bar-border':'#161830',
      },
      C: { bg:'#0e0f20', grid:'#121328', up:'#7fff7f', dn:'#ff7fa8', line:'#7cb8ff', text1:'#e8e8f8', text2:'#8888b8', areaFill:'rgba(124,184,255,0.08)' }
    }
  };

  let _current = 'terminal';
  let _onChange = null;
  let C = { ...THEMES.terminal.C };

  function apply(id, silent = false) {
    const t = THEMES[id]; if (!t) return;
    _current = id;
    Object.assign(C, t.C);
    const root = document.documentElement;
    Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    if (!silent && _onChange) _onChange(id);
  }

  function getCurrent() { return _current; }
  function getThemes()  { return THEMES; }
  function onChange(fn) { _onChange = fn; }

  return { apply, getCurrent, getThemes, onChange, C };
})();

window.ThemeManager = ThemeManager;