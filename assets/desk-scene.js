/* Desk scene for Ridha Agam's portfolio. Needs window.THREE (r160). */
(function () {
  'use strict';

  var HAND = '"Caveat", "Comic Sans MS", cursive';
  var ROUND = '"Fredoka", "Trebuchet MS", sans-serif';
  var PX = '"Silkscreen", "Courier New", monospace';

  function create(opts) {
    var T = window.THREE;
    var canvas = opts.canvas, wrap = opts.wrap;
    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    // phones and tablets: lighter settings so it stays smooth
    var touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    var small = Math.min(screen.width || 9999, screen.height || 9999) < 1100;
    var mobile = touch && small;
    renderer.setPixelRatio(Math.min(mobile ? 1.25 : 1.5, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = T.SRGBColorSpace;

    var scene = new T.Scene();
    var DAY_BG = new T.Color(0xF0CDB2), NIGHT_BG = new T.Color(0x221D33);
    scene.background = DAY_BG.clone();
    scene.fog = new T.Fog(scene.background.clone(), 16, 34);
    var cam = new T.PerspectiveCamera(38, 1.6, 0.1, 80);

    var disposables = [];
    function keep(x) { disposables.push(x); return x; }

    // ---------- helpers ----------
    function roundedBox(w, h, d, r, seg) {
      seg = (seg || 3) * 2 + 1;
      r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
      var g = new T.BoxGeometry(1, 1, 1, seg, seg, seg);
      var pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
      var box = new T.Vector3(w, h, d).multiplyScalar(0.5).subScalar(r);
      var half = 0.5 / seg, p = new T.Vector3(), n = new T.Vector3(), f = new T.Vector3();
      for (var i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        f.fromBufferAttribute(nor, i);
        n.copy(p);
        n.x -= Math.sign(n.x) * half; n.y -= Math.sign(n.y) * half; n.z -= Math.sign(n.z) * half;
        n.normalize();
        pos.setXYZ(i, box.x * Math.sign(p.x) + n.x * r, box.y * Math.sign(p.y) + n.y * r, box.z * Math.sign(p.z) + n.z * r);
        nor.setXYZ(i, n.x, n.y, n.z);
        // planar UVs per face, so textures keep their proportions after rounding
        var X = pos.getX(i) / w + 0.5, Y = pos.getY(i) / h + 0.5, Z = pos.getZ(i) / d + 0.5;
        if (f.y > 0.5) uv.setXY(i, X, 1 - Z); else if (f.y < -0.5) uv.setXY(i, X, Z);
        else if (f.z > 0.5) uv.setXY(i, X, Y); else if (f.z < -0.5) uv.setXY(i, 1 - X, Y);
        else if (f.x > 0.5) uv.setXY(i, 1 - Z, Y); else uv.setXY(i, Z, Y);
      }
      return keep(g);
    }
    var matCache = {};
    function M(hex, o) {
      var key = String(hex);
      if (!o && matCache[key]) return matCache[key];
      var m = keep(new T.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.8, metalness: 0 }, o || {})));
      if (!o) matCache[key] = m;
      return m;
    }
    function add(geo, mat, parent, x, y, z, shadow) {
      var m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = shadow !== false; m.receiveShadow = true;
      (parent || scene).add(m);
      return m;
    }
    function rod(a, b, r, mat, parent) {
      var d = new T.Vector3().subVectors(b, a), len = d.length();
      var m = add(keep(new T.CylinderGeometry(r, r, len, 16)), mat, parent, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      return m;
    }
    function group(x, y, z, parent) { var g = new T.Group(); g.position.set(x, y, z); (parent || scene).add(g); return g; }

    var texList = [];
    function makeTex(w, h, draw, rep) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var t = keep(new T.CanvasTexture(c));
      t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
      if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
      var item = { c: c, t: t, draw: draw, text: /fillText|center\(|wordmark/.test(String(draw)) };
      item.redraw = function () { var x = c.getContext('2d', { willReadFrequently: true }); x.clearRect(0, 0, w, h); draw(x, w, h); t.needsUpdate = true; };
      item.redraw(); texList.push(item);
      return t;
    }
    // ---------- procedural surface detail ----------
    function rand(seed) { var v = seed % 2147483647; if (v <= 0) v += 2147483646; return function () { v = v * 16807 % 2147483647; return (v - 1) / 2147483646; }; }
    function grain(x, w, h, amt, seed, big) {
      // multi-octave blocky noise written straight into the pixels (fast)
      var r = rand(seed || 3), img = x.getImageData(0, 0, w, h), d = img.data;
      var oct = big ? [[1, 0.5], [2, 0.3], [4, 0.25], [8, 0.3]] : [[1, 0.5], [2, 0.3], [4, 0.2], [8, 0.12]];
      var acc = new Float32Array(w * h);
      oct.forEach(function (o) {
        var s2 = o[0], gw = Math.ceil(w / s2) + 1, gh = Math.ceil(h / s2) + 1, g = new Float32Array(gw * gh);
        for (var k = 0; k < g.length; k++) g[k] = r() - 0.5;
        for (var yy = 0; yy < h; yy++) { var row = ((yy / s2) | 0) * gw; for (var xx = 0; xx < w; xx++) acc[yy * w + xx] += g[row + ((xx / s2) | 0)] * o[1]; }
      });
      var m = amt * 255 * 1.6;
      for (var i = 0; i < acc.length; i++) { var v = acc[i] * m, j = i * 4; d[j] += v; d[j + 1] += v; d[j + 2] += v; }
      x.putImageData(img, 0, 0);
    }
    function speckle(x, w, h, n, colors, s0, s1, seed) {
      var r = rand(seed || 11);
      for (var i = 0; i < n; i++) { x.fillStyle = colors[Math.floor(r() * colors.length)]; var z = s0 + r() * (s1 - s0); x.beginPath(); x.arc(r() * w, r() * h, z, 0, 7); x.fill(); }
    }
    function dataTex(w, h, draw, rep) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d', { willReadFrequently: true }), w, h);
      var t = keep(new T.CanvasTexture(c)); t.anisotropy = 4;
      if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
      return t;
    }
    function grey(x, w, h, v) { x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(0, 0, w, h); }
    var paperBump = dataTex(256, 256, function (x, w, h) { grey(x, w, h, 128); grain(x, w, h, 0.9, 5); });
    var plasticBump = dataTex(256, 256, function (x, w, h) { grey(x, w, h, 128); grain(x, w, h, 0.5, 9); }, [3, 3]);
    var speckleTex = makeTex(256, 256, function (x, w, h) {
      x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h);
      speckle(x, w, h, 260, ['rgba(60,50,40,0.18)', 'rgba(255,255,255,0.8)', 'rgba(120,90,60,0.12)'], 0.5, 1.4, 21);
      grain(x, w, h, 0.05, 22);
    }, [3, 3]);
    function weave(x, w, h, a) {
      for (var y = 0; y < h; y += 2) { x.fillStyle = 'rgba(0,0,0,' + (y % 4 ? a : a * 0.4) + ')'; x.fillRect(0, y, w, 1); }
      for (var xx = 0; xx < w; xx += 2) { x.fillStyle = 'rgba(255,255,255,' + (xx % 4 ? a : a * 0.5) + ')'; x.fillRect(xx, 0, 1, h); }
    }
    var fabricBump = dataTex(128, 128, function (x, w, h) { grey(x, w, h, 128); weave(x, w, h, 0.35); grain(x, w, h, 0.3, 4); }, [6, 6]);
    var clothWeaveTex = makeTex(256, 256, function (x, w, h) { x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h); weave(x, w, h, 0.07); grain(x, w, h, 0.08, 31); }, [4, 1]);
    function woodDraw(x, w, h, base, dark, seed) {
      x.fillStyle = base; x.fillRect(0, 0, w, h);
      var r = rand(seed || 41);
      for (var i = 0; i < 70; i++) {
        var y0 = r() * h, amp = 2 + r() * 6, f = 0.01 + r() * 0.02, ph = r() * 6;
        x.strokeStyle = dark; x.globalAlpha = 0.08 + r() * 0.18; x.lineWidth = 0.6 + r() * 1.8;
        x.beginPath();
        for (var xx = 0; xx <= w; xx += 8) x.lineTo(xx, y0 + Math.sin(xx * f + ph) * amp + Math.sin(xx * f * 3.1) * amp * 0.3);
        x.stroke();
      }
      x.globalAlpha = 1; grain(x, w, h, 0.06, seed + 1);
    }
    var woodTex = makeTex(512, 256, function (x, w, h) { woodDraw(x, w, h, '#FFFFFF', '#6B3E1E', 41); }, [3, 1]);
    var woodBump = dataTex(512, 256, function (x, w, h) { woodDraw(x, w, h, '#808080', '#000000', 41); }, [3, 1]);
    function withSurface(o, map, bump, scale) { return Object.assign({ map: map, bumpMap: bump, bumpScale: scale == null ? 1 : scale }, o || {}); }

    function plane(w, h, map, parent, x, y, z, transparent) {
      var m = add(keep(new T.PlaneGeometry(w, h)), keep(new T.MeshStandardMaterial({ map: map, roughness: 0.9, transparent: !!transparent, alphaTest: transparent ? 0.05 : 0, bumpMap: transparent ? null : paperBump, bumpScale: 1.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), parent, x, y, z, false);
      return m;
    }
    function center(x, text, cx, cy) { x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, cx, cy); }

    // ---------- lights ----------
    var hemi = new T.HemisphereLight(0xFFF1E4, 0xB98468, 1.25); scene.add(hemi);
    var sun = new T.DirectionalLight(0xFFE3C6, 2.3);
    sun.position.set(-6, 11, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    var sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 8; sc.bottom = -6; sc.near = 2; sc.far = 30;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun);
    var fill = new T.DirectionalLight(0xCFD9FF, 0.55); fill.position.set(7, 5, 5); scene.add(fill);
    var lampLight = new T.PointLight(0xFFC27A, 0, 14, 1.6); scene.add(lampLight);
    var screenLight = new T.PointLight(0x9FE3B0, 0.6, 7, 2); screenLight.position.set(0, 2.6, 1.2); scene.add(screenLight);

    // ---------- room ----------
    var plasterTex = makeTex(512, 512, function (x, w, h) {
      x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h);
      var r = rand(77);
      for (var i = 0; i < 90; i++) { var gx = r() * w, gy = r() * h, rr = 20 + r() * 70; var g = x.createRadialGradient(gx, gy, 0, gx, gy, rr); g.addColorStop(0, 'rgba(150,110,90,' + (0.03 + r() * 0.05) + ')'); g.addColorStop(1, 'rgba(150,110,90,0)'); x.fillStyle = g; x.fillRect(gx - rr, gy - rr, rr * 2, rr * 2); }
      grain(x, w, h, 0.07, 78, true);
    }, [6, 3]);
    var plasterBump = dataTex(256, 256, function (x, w, h) { grey(x, w, h, 128); grain(x, w, h, 0.8, 79, true); }, [12, 6]);
    var wall = add(keep(new T.PlaneGeometry(44, 22)), keep(new T.MeshStandardMaterial(withSurface({ color: 0xEFC6A8, roughness: 1 }, plasterTex, plasterBump, 2))), scene, 0, 6, -3.45, false);
    wall.receiveShadow = true;
    var clothTex = makeTex(512, 512, function (x, w, h) {
      x.fillStyle = '#F8DECB'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(228,132,110,0.30)';
      for (var i = 0; i < 4; i++) { x.fillRect(i * 128, 0, 64, h); x.fillRect(0, i * 128, w, 64); }
      for (var y = 0; y < h; y += 3) { x.fillStyle = 'rgba(120,60,40,' + (y % 6 ? 0.05 : 0.02) + ')'; x.fillRect(0, y, w, 1); }
      for (var xx = 0; xx < w; xx += 3) { x.fillStyle = 'rgba(255,255,255,' + (xx % 6 ? 0.08 : 0.03) + ')'; x.fillRect(xx, 0, 1, h); }
      grain(x, w, h, 0.07, 55);
    }, [9, 3.6]);
    add(roundedBox(22, 0.6, 9.4, 0.14), keep(new T.MeshStandardMaterial(withSurface({ color: 0xD9A57E, roughness: 0.7 }, woodTex, woodBump, 1.5))), scene, 0, -0.31, 0.3);
    var clothBump = dataTex(128, 128, function (x, w, h) { grey(x, w, h, 128); weave(x, w, h, 0.45); }, [120, 50]);
    var cloth = add(keep(new T.PlaneGeometry(21.6, 9)), keep(new T.MeshStandardMaterial({ map: clothTex, bumpMap: clothBump, bumpScale: 1.4, roughness: 0.95 })), scene, 0, 0.005, 0.3, false);
    cloth.rotation.x = -Math.PI / 2;

    var hots = [], pick = [];
    function hot(g, view, label, o) {
      o = o || {};
      var h = { g: g, view: view, label: label, action: o.action, lift: o.lift == null ? 0.1 : o.lift, base: g.position.clone(), h: 0 };
      g.traverse(function (m) { if (m.isMesh) { m.userData.hot = h; pick.push(m); } });
      hots.push(h);
      return h;
    }

    // pegboard with poster and postcard
    function pegDraw(x, w, h, base, hole, rim, bumpMode) {
      x.fillStyle = base; x.fillRect(0, 0, w, h);
      if (!bumpMode) { grain(x, w, h, 0.09, 61); speckle(x, w, h, 120, ['rgba(140,95,60,0.12)'], 0.6, 1.6, 62); }
      for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) {
        var cx = 16 + i * 32, cy = 16 + j * 32;
        x.fillStyle = rim; x.beginPath(); x.arc(cx + 0.8, cy + 0.8, 5.2, 0, 7); x.fill();
        x.fillStyle = hole; x.beginPath(); x.arc(cx, cy, 4.2, 0, 7); x.fill();
      }
    }
    var pegTex = makeTex(256, 256, function (x, w, h) { pegDraw(x, w, h, '#EACDAA', '#6E4B30', 'rgba(255,240,220,0.7)'); }, [3, 2.2]);
    var pegBump = dataTex(256, 256, function (x, w, h) { pegDraw(x, w, h, '#909090', '#000000', '#B0B0B0', true); grain(x, w, h, 0.4, 63); }, [3, 2.2]);
    add(roundedBox(4.8, 3.4, 0.12, 0.05), keep(new T.MeshStandardMaterial({ map: pegTex, bumpMap: pegBump, bumpScale: 2.5, roughness: 0.9 })), scene, -4.0, 3.1, -3.33);

    var posterG = group(-4.9, 3.05, -3.24);
    var posterTex = makeTex(512, 680, function (x, w, h) {
      x.fillStyle = '#FBF5EA'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#2B2A33'; x.font = '700 64px ' + ROUND; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.fillText('UniReflow', 40, 100);
      x.font = '400 30px ' + ROUND; x.fillStyle = '#6B6470'; x.fillText('segmentation in one step', 40, 145);
      x.fillStyle = '#E9E1D2'; x.fillRect(40, 180, w - 80, 2);
      x.font = '500 24px ' + ROUND; x.fillStyle = '#6B6470';
      x.fillText('inference on RTX 4090 (ms)', 40, 225);
      var bw = w - 80;
      x.fillStyle = '#C9C1D6'; x.fillRect(40, 245, bw, 56);
      x.fillStyle = '#E0574B'; x.fillRect(40, 320, bw * 175 / 2775, 56);
      x.font = '700 28px ' + ROUND; x.fillStyle = '#2B2A33';
      x.fillText('2,775', 52, 283);
      x.fillText('175', 40 + bw * 175 / 2775 + 14, 358);
      x.font = '500 24px ' + ROUND; x.fillStyle = '#6B6470';
      x.fillText('mIoU on COCO-Stuff', 40, 440);
      x.font = '700 110px ' + ROUND; x.fillStyle = '#3D55B8'; x.fillText('39.2', 40, 555);
      x.font = '400 26px ' + ROUND; x.fillStyle = '#6B6470'; x.fillText('1 step', 300, 555);
      x.fillStyle = '#F2B544'; x.beginPath(); x.arc(w - 80, 612, 34, 0, 7); x.fill();
      x.font = '700 18px ' + ROUND; x.fillStyle = '#5A3D06'; center(x, 'BEST', w - 80, 604); center(x, 'PAPER', w - 80, 624);
      x.textAlign = 'left'; x.font = '400 22px ' + ROUND; x.fillStyle = '#6B6470'; x.fillText('NCWIA 2026', 40, 625);
    });
    var paperShadowTex = makeTex(160, 200, function (x, w, h) { x.shadowColor = 'rgba(60,30,20,0.55)'; x.shadowBlur = 14; x.fillStyle = 'rgba(60,30,20,0.35)'; x.fillRect(22, 22, w - 44, h - 44); });
    function paperShadow(w, h, parent, x, y, z, rz) {
      var sm = add(keep(new T.PlaneGeometry(w * 1.18, h * 1.16)), keep(new T.MeshBasicMaterial({ map: paperShadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })), parent, x + 0.05, y - 0.06, z, false);
      sm.rotation.z = rz || 0; sm.raycast = function () {}; return sm;
    }
    paperShadow(1.7, 2.26, posterG, 0, 0, -0.02, 0.03);
    var poster = plane(1.7, 2.26, posterTex, posterG, 0, 0, 0);
    poster.rotation.z = 0.03;
    var tapeMat = M(0xF3E3B8, { transparent: true, opacity: 0.8, map: clothWeaveTex, roughness: 0.6 });
    var tape = add(keep(new T.PlaneGeometry(0.55, 0.18)), tapeMat, posterG, 0.1, 1.08, 0.01, false);
    var tape2 = add(keep(new T.PlaneGeometry(0.45, 0.16)), tapeMat, posterG, -0.62, -1.05, 0.01, false); tape2.rotation.z = 0.5;
    tape.rotation.z = -0.15;
    hot(posterG, 'research', 'Research poster', { lift: 0 });

    // corkboard with project polaroids
    function corkDraw(x, w, h, bumpMode) {
      x.fillStyle = bumpMode ? '#808080' : '#D2A06B'; x.fillRect(0, 0, w, h);
      var r = rand(91);
      for (var i = 0; i < 2600; i++) {
        var q = r();
        x.fillStyle = bumpMode ? (q > 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)') : (q > 0.66 ? 'rgba(110,62,24,0.45)' : q > 0.33 ? 'rgba(240,200,150,0.45)' : 'rgba(170,110,60,0.4)');
        x.beginPath(); x.ellipse(r() * w, r() * h, 0.8 + r() * 2.4, 0.6 + r() * 1.8, r() * 3, 0, 7); x.fill();
      }
    }
    var corkTex = makeTex(256, 256, function (x, w, h) { corkDraw(x, w, h, false); }, [2, 1.5]);
    var corkBump = dataTex(256, 256, function (x, w, h) { corkDraw(x, w, h, true); }, [2, 1.5]);
    var corkG = group(4.9, 3.35, -3.3);
    add(roundedBox(4.2, 3.2, 0.14, 0.06), keep(new T.MeshStandardMaterial({ map: corkTex, bumpMap: corkBump, bumpScale: 3, roughness: 1 })), corkG, 0, 0, 0);
    add(roundedBox(4.4, 3.4, 0.1, 0.05), keep(new T.MeshStandardMaterial(withSurface({ color: 0xB47A48, roughness: 0.6 }, woodTex, woodBump, 1))), corkG, 0, 0, -0.04);
    var projects = [
      ['edge cameras', '#8C7040', 'cam'], ['people counting', '#2E8494', 'ppl'], ['court scraper', '#4659A8', 'doc'],
      ['TalentHub', '#6553AE', 'bag'], ['virtual CS', '#B0587A', 'chat'], ['Bidikmisi GIS', '#3F8466', 'pin']
    ];
    projects.forEach(function (p, i) {
      var tex = makeTex(256, 300, function (x, w, h) {
        x.fillStyle = '#FFFEFA'; x.fillRect(0, 0, w, h);
        x.fillStyle = p[1]; x.fillRect(18, 18, w - 36, 200);
        x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round';
        var cx = w / 2, cy = 118; x.beginPath();
        if (p[2] === 'cam') { x.rect(cx - 50, cy - 30, 80, 60); x.moveTo(cx + 30, cy - 12); x.lineTo(cx + 56, cy - 28); x.lineTo(cx + 56, cy + 28); x.lineTo(cx + 30, cy + 12); }
        if (p[2] === 'ppl') { x.arc(cx - 30, cy - 20, 16, 0, 7); x.moveTo(cx + 46, cy - 20); x.arc(cx + 30, cy - 20, 16, 0, 7); x.moveTo(cx - 60, cy + 45); x.quadraticCurveTo(cx - 30, cy - 5, cx, cy + 45); x.moveTo(cx, cy + 45); x.quadraticCurveTo(cx + 30, cy - 5, cx + 60, cy + 45); }
        if (p[2] === 'doc') { x.rect(cx - 40, cy - 55, 80, 110); x.moveTo(cx - 22, cy - 25); x.lineTo(cx + 22, cy - 25); x.moveTo(cx - 22, cy); x.lineTo(cx + 22, cy); x.moveTo(cx - 22, cy + 25); x.lineTo(cx + 8, cy + 25); }
        if (p[2] === 'bag') { x.rect(cx - 55, cy - 25, 110, 70); x.moveTo(cx - 20, cy - 25); x.lineTo(cx - 20, cy - 45); x.lineTo(cx + 20, cy - 45); x.lineTo(cx + 20, cy - 25); }
        if (p[2] === 'chat') { x.moveTo(cx - 55, cy - 40); x.lineTo(cx + 55, cy - 40); x.lineTo(cx + 55, cy + 25); x.lineTo(cx - 10, cy + 25); x.lineTo(cx - 35, cy + 50); x.lineTo(cx - 35, cy + 25); x.lineTo(cx - 55, cy + 25); x.closePath(); }
        if (p[2] === 'pin') { x.moveTo(cx, cy + 55); x.bezierCurveTo(cx - 70, cy - 20, cx - 30, cy - 60, cx, cy - 60); x.bezierCurveTo(cx + 30, cy - 60, cx + 70, cy - 20, cx, cy + 55); x.moveTo(cx + 14, cy - 18); x.arc(cx, cy - 18, 14, 0, 7); }
        x.stroke();
        x.fillStyle = '#2B2A33'; x.font = '700 40px ' + HAND; center(x, p[0], w / 2, 262);
      });
      var col = i % 3, row = Math.floor(i / 3);
      var rz = [0.05, -0.04, 0.07, -0.06, 0.03, -0.05][i];
      paperShadow(1.0, 1.17, corkG, -1.3 + col * 1.3, 0.72 - row * 1.42, 0.08, rz);
      var m = plane(1.0, 1.17, tex, corkG, -1.3 + col * 1.3, 0.72 - row * 1.42, 0.09);
      m.rotation.z = rz;
      add(keep(new T.SphereGeometry(0.065, 16, 12)), keep(new T.MeshPhysicalMaterial({ color: ['#E0574B', '#3D55B8', '#F2B544'][i % 3], roughness: 0.25, clearcoat: 1 })), corkG, -1.3 + col * 1.3, 1.2 - row * 1.42, 0.15);
      add(keep(new T.CylinderGeometry(0.012, 0.012, 0.06, 8)), M(0xC9CED8, { metalness: 0.8, roughness: 0.3 }), corkG, -1.3 + col * 1.3, 1.2 - row * 1.42, 0.1).rotation.x = Math.PI / 2;
    });
    hot(corkG, 'projects', 'Project board', { lift: 0 });

    // ---------- computer ----------
    var SAGE = 0xA8C89A, SAGE2 = 0xB9D6AB;
    var comp = group(0, 0, -1.0);
    add(roundedBox(5.0, 0.8, 3.4, 0.3), keep(new T.MeshStandardMaterial(withSurface({ color: SAGE, roughness: 0.55 }, speckleTex, plasticBump, 0.6))), comp, 0, 0.4, 0.3);
    add(roundedBox(5.0, 3.6, 2.0, 0.45), keep(new T.MeshStandardMaterial(withSurface({ color: SAGE2, roughness: 0.5 }, speckleTex, plasticBump, 0.6))), comp, 0, 2.55, -0.2);
    var badgeTex = makeTex(256, 64, function (x, w, h) { x.fillStyle = '#DCE3D6'; x.fillRect(0, 0, w, h); x.fillStyle = '#5E7358'; x.font = '400 26px ' + PX; center(x, 'PORTFOLIO-26', w / 2, h / 2 + 1); });
    var badge = add(roundedBox(0.9, 0.2, 0.03, 0.02), keep(new T.MeshStandardMaterial({ color: 0xDCE3D6, metalness: 0.6, roughness: 0.35 })), comp, 0, 1.25, 0.8, false);
    plane(0.84, 0.18, badgeTex, comp, 0, 1.25, 0.818, true);
    add(roundedBox(4.1, 2.7, 0.12, 0.22), M(0x2C3531, { roughness: 0.4 }), comp, 0, 2.65, 0.79, false);
    add(roundedBox(4.6, 0.16, 0.5, 0.07), M(0xC5DDBA, { roughness: 0.5 }), comp, 0, 0.86, 1.1);
    add(roundedBox(0.95, 0.06, 0.18, 0.03), M(0x3A4A40), comp, -0.45, 0.95, 1.1, false);
    for (var v = 0; v < 5; v++) add(roundedBox(0.06, 0.03, 0.34, 0.015), M(0x8FAE82), comp, 1.55 + v * 0.14, 0.95, 1.1, false);

    // screen
    var SW = 1024, SH = 640;
    var sCanvas = document.createElement('canvas'); sCanvas.width = SW; sCanvas.height = SH;
    var sCtx = sCanvas.getContext('2d');
    var sTex = keep(new T.CanvasTexture(sCanvas)); sTex.colorSpace = T.SRGBColorSpace; sTex.anisotropy = 8;
    var screenMesh = add(keep(new T.PlaneGeometry(3.84, 2.4)), keep(new T.MeshBasicMaterial({ map: sTex, toneMapped: false })), comp, 0, 2.65, 0.86, false);
    screenMesh.userData.isScreen = true;
    hot(screenMesh, 'screen', 'Screen · look inside', { lift: 0 });
    var glareTex = makeTex(512, 320, function (x, w, h) {
      var g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(0.28, 'rgba(255,255,255,0.05)'); g.addColorStop(0.3, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,255,255,0.10)'; x.beginPath(); x.moveTo(w * 0.62, 0); x.lineTo(w * 0.7, 0); x.lineTo(w * 0.52, h); x.lineTo(w * 0.47, h); x.fill();
    });
    var glass = add(keep(new T.PlaneGeometry(3.84, 2.4)), keep(new T.MeshBasicMaterial({ map: glareTex, transparent: true, depthWrite: false, toneMapped: false })), comp, 0, 2.65, 0.87, false);
    glass.raycast = function () {};

    // sticky notes on monitor
    function sticky(w, draw, parent, x, y, z, rz, color) {
      var tex = makeTex(400, 400, function (c, W, H) {
        c.fillStyle = color || '#F7E3B2'; c.fillRect(0, 0, W, H);
        var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0.07)'); g.addColorStop(0.12, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        grain(c, W, H, 0.06, 13);
        draw(c, W, H);
      });
      var geo = keep(new T.PlaneGeometry(w, w, 1, 10));
      var ps = geo.attributes.position;
      for (var i = 0; i < ps.count; i++) { var yy = ps.getY(i) / w + 0.5; if (yy < 0.35) ps.setZ(i, Math.pow((0.35 - yy) / 0.35, 2) * 0.07 * w); }
      geo.computeVertexNormals();
      var m = add(geo, keep(new T.MeshStandardMaterial({ map: tex, bumpMap: paperBump, bumpScale: 1.2, roughness: 0.9, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), parent, x, y, z, true);
      m.rotation.z = rz; return m;
    }
    var contactG = group(-2.05, 3.78, 0.88, comp);
    sticky(1.25, function (c, W) {
      c.fillStyle = '#2B2A33'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.font = '700 44px ' + ROUND; c.fillText('in', 40, 90);
      c.font = '700 48px ' + HAND; c.fillText('/ridhaagam', 100, 90);
      c.font = '700 50px ' + HAND; c.fillText('email me at', 40, 190);
      c.fillStyle = '#E0574B'; c.font = '700 38px ' + HAND; c.fillText('muhridhaagam', 40, 260); c.fillText('@gmail.com', 40, 305);
    }, contactG, 0, 0, 0, 0.07);
    hot(contactG, 'contact', 'Sticky note · contact', { lift: 0.05 });
    var roleG = group(2.3, 3.55, 0.88, comp);
    sticky(0.95, function (c) {
      c.fillStyle = '#2B2A33'; c.font = '700 54px ' + HAND; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillText('vision', 40, 110); c.fillText('researcher +', 40, 180); c.fillText('backend', 40, 250); c.fillText('engineer', 40, 320);
    }, roleG, 0, 0, 0, -0.1, '#F9D3C4');
    hot(roleG, 'about', 'Sticky note · about me', { lift: 0.05 });

    // buttons on the strip
    var sunTex = makeTex(96, 96, function (x) {
      x.fillStyle = '#F2B544'; x.strokeStyle = '#E0A33A'; x.lineWidth = 6; x.lineCap = 'round';
      for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; x.beginPath(); x.moveTo(48 + Math.cos(a) * 26, 48 + Math.sin(a) * 26); x.lineTo(48 + Math.cos(a) * 38, 48 + Math.sin(a) * 38); x.stroke(); }
      x.beginPath(); x.arc(48, 48, 17, 0, 7); x.fill();
    });
    var moonTex = makeTex(96, 96, function (x) {
      x.fillStyle = '#3D55B8'; x.beginPath(); x.arc(48, 48, 26, 0, 7); x.fill();
      x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(62, 38, 22, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over';
    });
    var moonG = group(-1.55, 0.99, 1.1, comp);
    add(roundedBox(1.0, 0.12, 0.38, 0.06), M(0x3D55B8, { roughness: 0.45 }), moonG, 0, 0, 0);
    add(roundedBox(0.86, 0.04, 0.24, 0.02), M(0x2C3F8F, { roughness: 0.6 }), moonG, 0, 0.055, 0, false);
    var knob = group(-0.24, 0.1, 0, moonG);
    add(roundedBox(0.44, 0.16, 0.32, 0.07), M(0xFFF3E4, { roughness: 0.35 }), knob, 0, 0, 0);
    var sunP = add(keep(new T.PlaneGeometry(0.26, 0.26)), keep(new T.MeshStandardMaterial({ map: sunTex, transparent: true, alphaTest: 0.02, roughness: 0.8 })), knob, 0, 0.082, 0, false);
    var moonP = add(keep(new T.PlaneGeometry(0.26, 0.26)), keep(new T.MeshStandardMaterial({ map: moonTex, transparent: true, opacity: 0, alphaTest: 0.02, roughness: 0.8 })), knob, 0, 0.083, 0, false);
    sunP.rotation.x = moonP.rotation.x = -Math.PI / 2;
    var moonHot = hot(moonG, null, 'Day / night switch', { action: 'night', lift: 0 });
    var BTN = [
      { c: 0xF6E6D0, a: 'run', l: 'Button · run the denoise demo', draw: function (x) { x.fillStyle = '#E0574B'; x.beginPath(); x.moveTo(38, 28); x.lineTo(72, 48); x.lineTo(38, 68); x.closePath(); x.fill(); } },
      { c: 0xF2A48F, a: 'hello', l: 'Button · say hi', draw: function (x) { x.strokeStyle = '#2B2A33'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.arc(48, 44, 20, 0.3, Math.PI - 0.3); x.stroke(); x.fillStyle = '#2B2A33'; x.beginPath(); x.arc(38, 36, 5, 0, 7); x.arc(58, 36, 5, 0, 7); x.fill(); } },
      { c: 0x9DBB8C, a: 'help', l: 'Button · help', draw: function (x) { x.fillStyle = '#2B2A33'; x.font = '700 58px ' + ROUND; center(x, '?', 48, 52); } }
    ];
    var roundButtons = BTN.map(function (b, i) {
      var g = group(0.35 + i * 0.45, 1.0, 1.1, comp);
      add(keep(new T.CylinderGeometry(0.19, 0.2, 0.08, 36)), M(0xC5DDBA, { roughness: 0.5 }), g, 0, -0.04, 0);
      add(keep(new T.CylinderGeometry(0.16, 0.17, 0.14, 36)), M(b.c, { roughness: 0.4 }), g, 0, 0.04, 0);
      var tex = makeTex(96, 96, b.draw);
      var lp = add(keep(new T.PlaneGeometry(0.22, 0.22)), keep(new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.02 })), g, 0, 0.112, 0, false);
      lp.rotation.x = -Math.PI / 2;
      var h = hot(g, null, b.l, { action: b.a, lift: 0 });
      h.press = 0; h.baseY = 1.0;
      return h;
    });

    // keycaps
    // key tray, recessed look
    add(roundedBox(4.86, 0.08, 1.9, 0.04), M(0x86A878, { roughness: 0.6 }), comp, 0, 0.8, 2.15, false);
    add(roundedBox(4.98, 0.12, 0.1, 0.05), M(0xC5DDBA, { roughness: 0.5 }), comp, 0, 0.84, 3.08, false);
    var U = 0.68, G = 0.1, X0 = -2.29 + U / 2, RZ = [1.75, 2.55];
    var KEYS = [
      { t: 'esc', col: 0, row: 0, c: 0xF6E6D0, top: 0xFFF3E4, ink: '#2B2A33', a: 'esc', s: 40 },
      { t: '2', col: 1, row: 0, c: 0xF1CDB5, top: 0xFBE3D2, ink: '#E0574B', a: 'd2', s: 76 },
      { t: '0', col: 2, row: 0, c: 0xF6E6D0, top: 0xFFF3E4, ink: '#6FA05B', a: 'd0', s: 76 },
      { t: 'cv', col: 3, row: 0, c: 0xF1CDB5, top: 0xFBE3D2, ink: '#2B2A33', a: 'cv', s: 50 },
      { t: 'run.', col: 4, row: 0, w: 2 * U + G, c: 0xC9463B, top: 0xE0574B, ink: '#FFF4EA', a: 'run', s: 52 },
      { t: ':)', col: 0, row: 1, c: 0x86A878, top: 0x9DBB8C, ink: '#2F4A2A', a: 'hello', s: 58 },
      { t: '2', col: 1, row: 1, c: 0xF6E6D0, top: 0xFFF3E4, ink: '#2B2A33', a: 'd2', s: 76 },
      { t: '6', col: 2, row: 1, c: 0xF1CDB5, top: 0xFBE3D2, ink: '#E88A70', a: 'd6', s: 76 },
      { t: 'ctrl', col: 3, row: 1, c: 0xF6E6D0, top: 0xFFF3E4, ink: '#2B2A33', a: 'ctrl', s: 40 },
      { t: '↑', col: 4, row: 1, c: 0xF6E6D0, top: 0xFFF3E4, ink: '#2B2A33', a: 'up', s: 62 },
      { t: '?', col: 5, row: 1, c: 0xE0A33A, top: 0xF2B544, ink: '#4A3306', a: 'help', s: 62 }
    ];
    var keyHots = KEYS.map(function (k) {
      var w = k.w || U;
      var x = X0 + k.col * (U + G) + (w - U) / 2;
      var g = group(x, 0.98, RZ[k.row], comp);
      add(roundedBox(w, 0.28, U, 0.1), M(k.c, { roughness: 0.6, map: speckleTex, bumpMap: plasticBump, bumpScale: 0.5 }), g, 0, -0.03, 0);
      add(roundedBox(w - 0.14, 0.12, U - 0.16, 0.06), M(k.top, { roughness: 0.45, map: speckleTex, bumpMap: plasticBump, bumpScale: 0.5 }), g, 0, 0.13, -0.02);
      var tex = makeTex(Math.round(128 * w / U), 128, function (c, W, H) {
        c.fillStyle = k.ink; c.font = '700 ' + k.s + 'px ' + ROUND; center(c, k.t, W / 2, H / 2 + 4);
      });
      var lp = plane(w * 0.78, 0.5, tex, g, 0, 0.192, -0.02, true); lp.rotation.x = -Math.PI / 2;
      var h = hot(g, null, 'Key · ' + k.t, { action: k.a, lift: 0 });
      h.press = 0; h.baseY = 0.98;
      return h;
    });

    // ---------- mouse ----------
    var mouseG = group(3.45, 0, 1.2);
    var padTex = makeTex(320, 256, function (x, w, h) {
      x.fillStyle = '#F2A992'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,245,235,0.55)';
      for (var i = 0; i < 10; i++) for (var j = 0; j < 8; j++) { x.beginPath(); x.arc(16 + i * 32, 16 + j * 32, 3, 0, 7); x.fill(); }
      x.strokeStyle = '#2B2A33'; x.lineWidth = 5; x.lineJoin = 'round';
      x.beginPath(); for (var k = 0; k < 10; k++) { var r = k % 2 ? 11 : 24, a = k * Math.PI / 5 - Math.PI / 2; x.lineTo(256 + Math.cos(a) * r, 52 + Math.sin(a) * r); } x.closePath();
      x.fillStyle = '#F7E3B2'; x.fill(); x.stroke();
    });
    add(roundedBox(2.1, 0.06, 1.7, 0.03), M(0xF2A992, { roughness: 0.95 }), mouseG, 0, 0.03, 0);
    var padTop = plane(2.0, 1.6, padTex, mouseG, 0, 0.066, 0); padTop.rotation.x = -Math.PI / 2;
    padTop.material.bumpMap = fabricBump; padTop.material.bumpScale = 1.5; padTop.material.roughness = 1;
    var mouseBody = group(0.02, 0.066, 0.05, mouseG);
    mouseBody.scale.setScalar(0.62);
    function mouseShape(g, push) {
      var pos = g.attributes.position, v = new T.Vector3();
      for (var i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).multiplyScalar(push || 1);
        var t = Math.min(1, Math.max(0, (v.z + 1) / 2));
        var w = 0.4 + 0.12 * t;
        var top = 0.16 + 0.26 * Math.sin(Math.PI * Math.pow(t, 1.35));
        pos.setXYZ(i, v.x * w, v.y >= 0 ? v.y * top : v.y * 0.1, v.z * 0.95);
      }
      g.computeVertexNormals();
      return keep(g);
    }
    var shellMat = keep(new T.MeshPhysicalMaterial({ color: 0x9DBB8C, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.5 }));
    var btnMat = keep(new T.MeshPhysicalMaterial({ color: 0xFFF6EA, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 }));
    var gripMat = keep(new T.MeshStandardMaterial({ color: 0xF2A992, roughness: 0.85 }));
    add(mouseShape(new T.SphereGeometry(1, 72, 48)), shellMat, mouseBody, 0, 0, 0);
    var mouseLeftBtn = add(mouseShape(new T.SphereGeometry(1, 48, 32, Math.PI * 1.5 + 0.04, Math.PI * 0.5 - 0.04, 0, 1.3), 1.014), btnMat, mouseBody, 0, 0, 0);
    add(mouseShape(new T.SphereGeometry(1, 48, 32, Math.PI, Math.PI * 0.5 - 0.04, 0, 1.3), 1.014), btnMat, mouseBody, 0, 0, 0);
    add(mouseShape(new T.SphereGeometry(1, 32, 16, -0.8, 1.6, 1.42, 0.5), 1.01), gripMat, mouseBody, 0, 0, 0);
    add(mouseShape(new T.SphereGeometry(1, 32, 16, Math.PI - 0.8, 1.6, 1.42, 0.5), 1.01), gripMat, mouseBody, 0, 0, 0);
    add(mouseShape(new T.SphereGeometry(1, 64, 8, 0, Math.PI * 2, 1.9, 0.5), 1.006), M(0x7E9E70, { roughness: 0.7 }), mouseBody, 0, 0, 0);
    add(roundedBox(0.13, 0.06, 0.3, 0.03), M(0x2B2A33, { roughness: 0.5 }), mouseBody, 0, 0.275, -0.46, false);
    var wheel = add(keep(new T.CylinderGeometry(0.095, 0.095, 0.08, 28)), M(0x3D55B8, { roughness: 0.35 }), mouseBody, 0, 0.27, -0.46, false);
    wheel.rotation.z = Math.PI / 2;
    for (var ri = 0; ri < 3; ri++) { var ridge = add(keep(new T.TorusGeometry(0.097, 0.008, 6, 28)), M(0x2C3F8F), mouseBody, -0.025 + ri * 0.025, 0.27, -0.46, false); ridge.rotation.y = Math.PI / 2; }
    var logo = add(keep(new T.CircleGeometry(0.07, 24)), M(0xE0574B, { roughness: 0.5 }), mouseBody, 0, 0.372, 0.55, false);
    logo.rotation.x = -Math.PI / 2 + 0.12;
    var relief = add(keep(new T.CylinderGeometry(0.05, 0.06, 0.14, 12)), M(0xE7D5BD), mouseBody, 0, 0.04, -1.0, false);
    relief.rotation.x = Math.PI / 2;
    var mouseClick = 0;
    mouseG.rotation.y = -0.22;
    var cable = new T.CatmullRomCurve3([new T.Vector3(3.59, 0.1, 0.66), new T.Vector3(3.56, 0.08, 0.32), new T.Vector3(3.25, 0.05, -0.2), new T.Vector3(2.85, 0.06, -0.8), new T.Vector3(2.45, 0.35, -1.1)]);
    add(keep(new T.TubeGeometry(cable, 64, 0.03, 8)), M(0xF6E6D0), scene, 0, 0, 0);
    var mouseHot = hot(mouseG, 'screen', 'Mouse · look inside the computer', { lift: 0.05 });
    var hintTex = makeTex(256, 128, function (x, w, h) {
      x.fillStyle = '#2B2A33'; x.font = '700 54px ' + HAND; center(x, 'click me', 150, 46);
      x.strokeStyle = '#2B2A33'; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
      x.beginPath(); x.moveTo(90, 76); x.quadraticCurveTo(50, 90, 40, 118); x.moveTo(30, 100); x.lineTo(40, 120); x.lineTo(58, 108); x.stroke();
    });
    var hint = new T.Sprite(keep(new T.SpriteMaterial({ map: hintTex, transparent: true, depthWrite: false })));
    hint.scale.set(1.1, 0.55, 1); hint.position.set(4.25, 0.9, 1.45); hint.raycast = function () {};
    scene.add(hint);

    // ---------- books (papers) ----------
    var booksG = group(-4.0, 0, -0.9);
    var pageTex = makeTex(64, 64, function (x, w, h) {
      x.fillStyle = '#FBF3E4'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(150,125,95,0.28)'; for (var i = 0; i < h; i += 4) x.fillRect(0, i, w, 1);
    }, [1, 5]);
    var pageMat = keep(new T.MeshStandardMaterial({ map: pageTex, roughness: 0.95 }));
    var books = [
      ['UniReflow', 0xD9594C, '#FFF4EA', 2.1, 0.36, 0.05, 'NCWIA 2026 · Best Paper'],
      ['DuoDiffCount', 0x3D55B8, '#FFF4EA', 1.95, 0.34, -0.08, 'CVGIP 2026 · Honorable Mention'],
      ['CATS-Diff', 0x9DBB8C, '#23361F', 2.05, 0.3, 0.1, 'IEEE ICME 2026 Workshops']
    ];
    var by = 0;
    books.forEach(function (b, bi) {
      var w = b[3], h = b[4], d = 1.45;
      var g = group(0, by + h / 2, 0, booksG);
      g.rotation.y = b[5];
      var cm = M(b[1], { roughness: 0.8, map: clothWeaveTex, bumpMap: fabricBump, bumpScale: 1.2 });
      add(roundedBox(w, 0.05, d, 0.02), cm, g, 0, h / 2 - 0.025, 0);
      add(roundedBox(w, 0.05, d, 0.02), cm, g, 0, -h / 2 + 0.025, 0);
      add(roundedBox(w, h, 0.07, 0.03), cm, g, 0, 0, d / 2 - 0.035);
      add(keep(new T.BoxGeometry(w - 0.1, h - 0.11, d - 0.1)), pageMat, g, 0, 0, -0.03);
      var spineTex = makeTex(512, 96, function (x, W, H) {
        x.strokeStyle = b[2]; x.globalAlpha = 0.55; x.lineWidth = 3;
        x.beginPath(); x.moveTo(40, 12); x.lineTo(40, H - 12); x.moveTo(W - 40, 12); x.lineTo(W - 40, H - 12); x.stroke();
        x.globalAlpha = 1; x.fillStyle = b[2]; x.font = '700 44px ' + ROUND; center(x, b[0], W / 2, H / 2 + 2);
      });
      plane(w * 0.94, h * 0.8, spineTex, g, 0, 0, d / 2 + 0.004, true);
      if (bi === books.length - 1) {
        var coverTex = makeTex(512, 320, function (x, W, H) {
          x.strokeStyle = b[2]; x.lineWidth = 6; x.globalAlpha = 0.5; x.strokeRect(24, 24, W - 48, H - 48); x.globalAlpha = 1;
          x.fillStyle = b[2]; x.font = '700 64px ' + ROUND; center(x, b[0], W / 2, H / 2 - 18);
          x.font = '500 28px ' + ROUND; center(x, b[6], W / 2, H / 2 + 44);
        });
        var cv = plane(w * 0.9, d * 0.8, coverTex, g, 0, h / 2 + 0.004, 0, true); cv.rotation.x = -Math.PI / 2;
      }
      by += h + 0.006;
    });
    hot(booksG, 'research', 'Stack of papers', { lift: 0.1 });

    // ---------- trophy (awards) ----------
    var trophyG = group(-0.05, by + 0.002, -0.05, booksG);
    trophyG.rotation.y = 0.35;
    var envScene = new T.Scene(); envScene.background = new T.Color(0xE8C6AA);
    [[0xffffff, 3, 0, 8, 2, 10], [0xFFE0B8, 2, 7, 3, 5, 6], [0xCFE0FF, 1.4, -7, 2, 4, 6], [0xffffff, 1.5, 0, 2, 8, 8]].forEach(function (q) {
      var pm = new T.Mesh(new T.PlaneGeometry(q[5], q[5]), new T.MeshBasicMaterial({ color: new T.Color(q[0]).multiplyScalar(q[1]), side: T.DoubleSide }));
      pm.position.set(q[2], q[3], q[4]); pm.lookAt(0, 0, 0); envScene.add(pm);
    });
    var pmrem = keep(new T.PMREMGenerator(renderer));
    var envTex = keep(pmrem.fromScene(envScene, 0.04).texture);
    envScene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    var goldM = keep(new T.MeshStandardMaterial({ color: 0xF2B544, metalness: 1, roughness: 0.28, envMap: envTex, envMapIntensity: 1.3 }));
    var silverM = keep(new T.MeshStandardMaterial({ color: 0xDDE3EE, metalness: 1, roughness: 0.25, envMap: envTex, envMapIntensity: 1.2 }));
    var marbleTex = makeTex(256, 256, function (x, w, h) {
      x.fillStyle = '#34303F'; x.fillRect(0, 0, w, h);
      var r = rand(101);
      for (var i = 0; i < 9; i++) {
        x.strokeStyle = 'rgba(230,220,240,' + (0.12 + r() * 0.25) + ')'; x.lineWidth = 0.6 + r() * 1.6;
        x.beginPath(); x.moveTo(r() * w, 0); x.bezierCurveTo(r() * w, h * 0.3, r() * w, h * 0.7, r() * w, h); x.stroke();
      }
      grain(x, w, h, 0.1, 102);
    });
    add(roundedBox(0.9, 0.3, 0.9, 0.08), keep(new T.MeshPhysicalMaterial({ map: marbleTex, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 })), trophyG, 0, 0.15, 0);
    var plateTex = makeTex(256, 64, function (x, w, h) {
      x.fillStyle = '#D9A93A'; x.fillRect(0, 0, w, h); grain(x, w, h, 0.12, 103);
      x.strokeStyle = '#8A6516'; x.lineWidth = 3; x.strokeRect(5, 5, w - 10, h - 10);
      x.fillStyle = '#5A3F0A'; x.font = '700 20px ' + ROUND; center(x, 'BEST PAPER', w / 2, 24); x.font = '500 15px ' + ROUND; center(x, 'NCWIA 2026', w / 2, 44);
    });
    add(keep(new T.PlaneGeometry(0.62, 0.16)), keep(new T.MeshStandardMaterial({ map: plateTex, metalness: 0.8, roughness: 0.35, envMap: envTex, polygonOffset: true, polygonOffsetFactor: -2 })), trophyG, 0, 0.15, 0.452, false);
    var prof = [[0, 0], [0.34, 0], [0.34, 0.05], [0.12, 0.1], [0.07, 0.22], [0.06, 0.45], [0.1, 0.52], [0.3, 0.6], [0.42, 0.85], [0.45, 1.12], [0.41, 1.12], [0.37, 0.88], [0.26, 0.7], [0, 0.66]]
      .map(function (p) { return new T.Vector2(p[0], p[1]); });
    var cup = add(keep(new T.LatheGeometry(prof, 48)), goldM, trophyG, 0, 0.3, 0);
    [-1, 1].forEach(function (s) {
      var hd = add(keep(new T.TorusGeometry(0.17, 0.035, 10, 24, Math.PI)), goldM, trophyG, s * 0.44, 1.2, 0);
      hd.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    });
    var medalG = group(0.65, 0.42, 0.45, trophyG);
    var disc = add(keep(new T.CylinderGeometry(0.34, 0.34, 0.06, 40)), silverM, medalG, 0, 0, 0);
    disc.rotation.x = Math.PI / 2 - 0.35; medalG.rotation.y = -0.5;
    var medalTex = makeTex(256, 256, function (x, w, h) {
      x.fillStyle = '#C9D0DE'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#8C95A8'; x.lineWidth = 8; x.beginPath(); x.arc(128, 128, 110, 0, 7); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.arc(128, 128, 92, 0, 7); x.stroke();
      x.fillStyle = '#E8ECF4'; x.strokeStyle = '#7C869A'; x.lineWidth = 4; x.beginPath();
      for (var i = 0; i < 10; i++) { var rr = i % 2 ? 26 : 58, aa = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(128 + Math.cos(aa) * rr, 118 + Math.sin(aa) * rr); }
      x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#5E677A'; x.font = '700 22px ' + ROUND; center(x, 'CVGIP 2026', 128, 196);
      grain(x, w, h, 0.08, 104);
    });
    var face = add(keep(new T.CircleGeometry(0.33, 40)), keep(new T.MeshStandardMaterial({ map: medalTex, metalness: 0.85, roughness: 0.3, envMap: envTex, envMapIntensity: 1.2 })), disc, 0, 0.031, 0, false);
    face.rotation.x = -Math.PI / 2;
    var ribTex = makeTex(64, 128, function (x, w, h) { x.fillStyle = '#3D55B8'; x.fillRect(0, 0, w, h); x.fillStyle = '#F5F2EA'; x.fillRect(24, 0, 16, h); x.fillStyle = '#E0574B'; x.fillRect(29, 0, 6, h); weave(x, w, h, 0.06); });
    var rib = add(keep(new T.BoxGeometry(0.2, 0.5, 0.02)), keep(new T.MeshStandardMaterial({ map: ribTex, roughness: 0.7, bumpMap: fabricBump, bumpScale: 0.8 })), medalG, 0, 0.36, -0.12);
    rib.rotation.x = -0.35;
    hot(trophyG, 'awards', 'Trophy · awards', { lift: 0.1 });

    // ---------- coffee cup (about) ----------
    var cupG = group(-3.35, 0, 2.3);
    cupG.scale.setScalar(0.9); cupG.rotation.y = 0.45;
    var coasterMat = keep(new T.MeshStandardMaterial({ map: corkTex, bumpMap: corkBump, bumpScale: 2, roughness: 1 }));
    add(keep(new T.CylinderGeometry(0.7, 0.7, 0.06, 48)), coasterMat, cupG, 0, 0.03, 0);
    var glazeTex = makeTex(1024, 512, function (x, w, h) {
      x.fillStyle = '#F6EEDF'; x.fillRect(0, 0, w, h);
      speckle(x, w, h, 900, ['rgba(90,60,40,0.55)', 'rgba(120,85,55,0.4)', 'rgba(60,45,35,0.6)'], 0.8, 2.4, 111);
      var dip = h * 0.66;
      x.fillStyle = '#8FB08A'; x.beginPath(); x.moveTo(0, h);
      for (var xx = 0; xx <= w; xx += 16) {
        var drip = (Math.sin(xx * 0.05) > 0.85 ? 34 : 0) + Math.sin(xx * 0.013) * 10 + Math.sin(xx * 0.041) * 5;
        x.lineTo(xx, dip + drip);
      }
      x.lineTo(w, h); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, dip - 4, w, 6);
      x.fillStyle = '#C79A72'; x.fillRect(0, h * 0.93, w, h * 0.07); grain(x, w, h, 0.05, 112);
      x.fillStyle = '#7A4A2A'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '700 76px ' + HAND; x.fillText('coffee mug', w * 0.5, h * 0.36);
    });
    var glazeBump = dataTex(256, 256, function (x, w, h) { grey(x, w, h, 128); speckle(x, w, h, 260, ['rgba(0,0,0,0.5)'], 0.6, 1.6, 113); }, [4, 2]);
    var glazeMat = keep(new T.MeshPhysicalMaterial({ map: glazeTex, bumpMap: glazeBump, bumpScale: 0.6, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12 }));
    var innerMat = keep(new T.MeshPhysicalMaterial({ color: 0xF2E9D8, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15, side: T.BackSide }));
    add(keep(new T.CylinderGeometry(0.53, 0.47, 1.22, 64, 1, true, Math.PI)), glazeMat, cupG, 0, 0.7, 0);
    add(keep(new T.CylinderGeometry(0.49, 0.44, 1.18, 64, 1, true)), innerMat, cupG, 0, 0.72, 0);
    add(keep(new T.TorusGeometry(0.51, 0.025, 12, 64)), keep(new T.MeshPhysicalMaterial({ color: 0xF6EEDF, roughness: 0.3, clearcoat: 1 })), cupG, 0, 1.31, 0).rotation.x = Math.PI / 2;
    add(keep(new T.CylinderGeometry(0.47, 0.44, 0.06, 64)), M(0xC79A72, { roughness: 0.9, map: speckleTex }), cupG, 0, 0.1, 0);
    var latteTex = makeTex(256, 256, function (x, w, h) {
      var g = x.createRadialGradient(128, 128, 20, 128, 128, 128); g.addColorStop(0, '#B8834F'); g.addColorStop(0.8, '#9A6437'); g.addColorStop(1, '#6E4222');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#F4E6CF'; x.beginPath(); x.moveTo(128, 196); x.bezierCurveTo(60, 150, 58, 88, 100, 78); x.bezierCurveTo(118, 74, 126, 90, 128, 100); x.bezierCurveTo(130, 90, 138, 74, 156, 78); x.bezierCurveTo(198, 88, 196, 150, 128, 196); x.fill();
      x.strokeStyle = '#B8834F'; x.lineWidth = 4; x.beginPath(); x.moveTo(128, 100); x.lineTo(128, 190); x.stroke();
      speckle(x, w, h, 90, ['rgba(255,240,220,0.5)'], 0.8, 2, 114);
    });
    var coffee = add(keep(new T.CircleGeometry(0.47, 48)), keep(new T.MeshPhysicalMaterial({ map: latteTex, roughness: 0.3, clearcoat: 0.6 })), cupG, 0, 1.14, 0, false);
    coffee.rotation.x = -Math.PI / 2; coffee.rotation.z = 0.6;
    var handle = add(keep(new T.TorusGeometry(0.27, 0.07, 18, 40, Math.PI * 1.15)), keep(new T.MeshPhysicalMaterial({ color: 0xF6EEDF, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12 })), cupG, 0.6, 0.72, 0);
    handle.rotation.z = -Math.PI * 0.575;
    hot(cupG, 'about', 'Coffee mug · about me', { lift: 0.1 });
    var puffTex = makeTex(64, 64, function (x, w, h) { var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    var steam = [];
    for (var si = 0; si < 3; si++) {
      var sm = new T.Sprite(keep(new T.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false })));
      sm.raycast = function () {}; cupG.add(sm);
      steam.push(sm);
    }

    // ---------- edge lab (experience) ----------
    var edgeG = group(4.15, 0, -1.0);
    [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]].forEach(function (p) { add(keep(new T.CylinderGeometry(0.04, 0.04, 0.22, 8)), M(0xC9CED8, { metalness: 0.6, roughness: 0.3, envMap: envTex }), edgeG, p[0], 0.11, p[1]); });
    var pcbTex = makeTex(512, 360, function (x, w, h) {
      x.fillStyle = '#2F6E4C'; x.fillRect(0, 0, w, h); grain(x, w, h, 0.06, 121);
      var r = rand(122);
      x.strokeStyle = 'rgba(201,154,75,0.55)'; x.lineWidth = 3; x.lineCap = 'round';
      for (var i = 0; i < 46; i++) {
        var px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py);
        for (var k = 0; k < 3; k++) { if (r() > 0.5) px += (r() - 0.5) * 180; else py += (r() - 0.5) * 140; x.lineTo(px, py); }
        x.stroke(); x.fillStyle = '#D8B26A'; x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill();
      }
      x.fillStyle = '#E2BE5C'; for (var j = 0; j < 20; j++) { x.fillRect(20 + j * 23, 12, 12, 26); x.fillRect(20 + j * 23, h - 38, 12, 26); }
      x.fillStyle = '#1E2126'; x.fillRect(w * 0.68, h * 0.55, 90, 60); x.fillRect(w * 0.12, h * 0.62, 60, 60);
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = '700 22px ' + ROUND; x.textAlign = 'left'; x.fillText('EDGE-01', w * 0.66, h * 0.48); x.font = '600 14px ' + ROUND; x.fillText('J1', 26, 70); x.fillText('U3', w * 0.12, h * 0.58);
      x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2; x.strokeRect(w * 0.66, h * 0.53, 100, 70);
    });
    add(roundedBox(1.5, 0.07, 1.05, 0.03), keep(new T.MeshStandardMaterial({ map: pcbTex, roughness: 0.45, bumpMap: plasticBump, bumpScale: 0.3 })), edgeG, 0, 0.25, 0);
    add(roundedBox(0.7, 0.08, 0.62, 0.02), M(0x2B2F36, { roughness: 0.4 }), edgeG, -0.2, 0.32, 0);
    var brushedTex = makeTex(256, 256, function (x, w, h) { x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h); var r = rand(131); for (var i = 0; i < 400; i++) { x.fillStyle = 'rgba(0,0,0,' + (r() * 0.08) + ')'; x.fillRect(0, r() * h, w, 1); } });
    var finMat = M(0xAEB6C3, { metalness: 0.85, roughness: 0.4, envMap: envTex, map: brushedTex });
    for (var fi = 0; fi < 6; fi++) add(keep(new T.BoxGeometry(0.035, 0.24, 0.56)), finMat, edgeG, -0.47 + fi * 0.11, 0.48, 0);
    add(roundedBox(0.3, 0.12, 0.2, 0.02), M(0xE6E1D6), edgeG, 0.48, 0.34, 0.32);
    var led = add(keep(new T.SphereGeometry(0.04, 12, 8)), keep(new T.MeshStandardMaterial({ color: 0x7BE08A, emissive: 0x7BE08A, emissiveIntensity: 3 })), edgeG, 0.5, 0.31, -0.35, false);
    var tagTex = makeTex(256, 128, function (x, w, h) { x.fillStyle = '#FFF6DC'; x.fillRect(0, 0, w, h); x.fillStyle = '#2B2A33'; x.font = '700 48px ' + HAND; center(x, 'edge lab', w / 2, h / 2); });
    var tag = plane(0.7, 0.35, tagTex, edgeG, 0.1, 0.02, 0.9); tag.rotation.x = -Math.PI / 2; tag.rotation.z = 0.12;
    var tri = group(1.0, 0, -0.9, edgeG);
    var tripodMat = M(0x2B2F36, { roughness: 0.5, map: speckleTex });
    for (var ti = 0; ti < 3; ti++) {
      var a = ti * 2.094 + 0.3;
      var top = new T.Vector3(Math.cos(a) * 0.06, 0.95, Math.sin(a) * 0.06), foot = new T.Vector3(Math.cos(a) * 0.46, 0.03, Math.sin(a) * 0.46);
      rod(top, foot, 0.024, tripodMat, tri);
      add(keep(new T.SphereGeometry(0.04, 12, 8)), M(0x1A1C20, { roughness: 0.9 }), tri, foot.x, 0.035, foot.z);
    }
    add(keep(new T.CylinderGeometry(0.025, 0.025, 0.3, 12)), M(0xC9CED8, { metalness: 0.7, roughness: 0.35, envMap: envTex }), tri, 0, 0.9, 0);
    add(keep(new T.CylinderGeometry(0.13, 0.11, 0.06, 24)), tripodMat, tri, 0, 1.0, 0);
    var camHead = group(0, 1.2, 0, tri);
    var leatherTex = makeTex(256, 256, function (x, w, h) { x.fillStyle = '#2E3138'; x.fillRect(0, 0, w, h); speckle(x, w, h, 900, ['rgba(0,0,0,0.35)', 'rgba(255,255,255,0.05)'], 0.8, 2.2, 161); grain(x, w, h, 0.08, 162); });
    var leatherBump = dataTex(128, 128, function (x, w, h) { grey(x, w, h, 128); speckle(x, w, h, 500, ['rgba(0,0,0,0.6)'], 0.8, 2, 163); }, [2, 2]);
    var metalM = M(0xD3D8E0, { metalness: 0.85, roughness: 0.3, envMap: envTex, map: brushedTex });
    add(roundedBox(0.54, 0.3, 0.34, 0.06), keep(new T.MeshStandardMaterial({ map: leatherTex, bumpMap: leatherBump, bumpScale: 1.5, roughness: 0.8 })), camHead, 0, 0, 0);
    add(roundedBox(0.56, 0.07, 0.36, 0.03), metalM, camHead, 0, 0.17, 0);
    var cam1 = add(keep(new T.CylinderGeometry(0.15, 0.15, 0.04, 32)), metalM, camHead, 0, -0.01, 0.19); cam1.rotation.x = Math.PI / 2;
    var cam2 = add(keep(new T.CylinderGeometry(0.13, 0.135, 0.14, 32)), M(0x1A1C20, { roughness: 0.5 }), camHead, 0, -0.01, 0.27); cam2.rotation.x = Math.PI / 2;
    for (var ri2 = 0; ri2 < 4; ri2++) add(keep(new T.TorusGeometry(0.134, 0.007, 6, 32)), M(0x3A3E46, { roughness: 0.6 }), camHead, 0, -0.01, 0.22 + ri2 * 0.028, false);
    var cam3 = add(keep(new T.CylinderGeometry(0.14, 0.14, 0.03, 32)), metalM, camHead, 0, -0.01, 0.35); cam3.rotation.x = Math.PI / 2;
    var glassL = add(keep(new T.CircleGeometry(0.115, 32)), keep(new T.MeshPhysicalMaterial({ color: 0x0E1426, metalness: 0.2, roughness: 0.05, clearcoat: 1, envMap: envTex, envMapIntensity: 0.6 })), camHead, 0, -0.01, 0.366, false);
    add(keep(new T.CircleGeometry(0.075, 32)), keep(new T.MeshBasicMaterial({ color: 0x3A5A9A, transparent: true, opacity: 0.35 })), camHead, 0, -0.01, 0.367, false);
    add(keep(new T.CircleGeometry(0.018, 12)), keep(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })), camHead, -0.045, 0.03, 0.369, false);
    add(keep(new T.CylinderGeometry(0.03, 0.03, 0.035, 16)), M(0xE0574B, { roughness: 0.3 }), camHead, 0.16, 0.22, 0.06);
    var dial = add(keep(new T.CylinderGeometry(0.05, 0.05, 0.035, 20)), metalM, camHead, -0.14, 0.22, 0.02);
    add(roundedBox(0.1, 0.025, 0.09, 0.01), M(0x1A1C20), camHead, 0.02, 0.215, -0.02);
    [-1, 1].forEach(function (sd) { var lug = add(keep(new T.TorusGeometry(0.03, 0.008, 6, 16)), metalM, camHead, sd * 0.28, 0.12, 0, false); lug.rotation.y = Math.PI / 2; });
    var rec = add(keep(new T.SphereGeometry(0.025, 10, 8)), keep(new T.MeshStandardMaterial({ color: 0xFF5A4A, emissive: 0xFF5A4A, emissiveIntensity: 3 })), camHead, 0.19, 0.08, 0.17, false);
    camHead.rotation.y = -0.6;
    hot(edgeG, 'experience', 'Edge lab · experience', { lift: 0.08 });

    // ---------- notebook (blog) ----------
    var nbG = group(1.7, 0.02, 2.4);
    nbG.rotation.y = -0.18;
    add(roundedBox(2.3, 0.05, 1.55, 0.03), M(0x3D55B8, { roughness: 0.85, map: clothWeaveTex, bumpMap: fabricBump, bumpScale: 1.2 }), nbG, 0, 0.02, 0);
    add(roundedBox(0.06, 0.02, 1.57, 0.01), M(0x1F2A55, { roughness: 0.6 }), nbG, 1.02, 0.05, 0, false);
    var ribbon = add(keep(new T.PlaneGeometry(0.07, 0.62)), M(0xE0574B, { side: T.DoubleSide, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 }), nbG, 0.02, 0.064, 0.62, false);
    ribbon.rotation.x = -Math.PI / 2;
    var pageL = makeTex(360, 480, function (x, w, h) {
      x.fillStyle = '#FFFCF4'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(61,85,184,0.22)'; x.lineWidth = 2;
      for (var y = 90; y < h; y += 40) { x.beginPath(); x.moveTo(20, y); x.lineTo(w - 20, y); x.stroke(); }
      x.fillStyle = '#2B2A33'; x.font = '700 72px ' + HAND; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillText('blog', 36, 76);
      x.font = '700 34px ' + HAND; x.fillStyle = '#6B6470';
      x.fillText('notes from the lab', 36, 158); x.fillText('and the field', 36, 198);
      x.fillStyle = '#E0574B'; x.fillText('read me →', 36, 318);
    });
    var pageR = makeTex(360, 480, function (x, w, h) {
      x.fillStyle = '#FFFCF4'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(61,85,184,0.22)'; x.lineWidth = 2;
      for (var y = 90; y < h; y += 40) { x.beginPath(); x.moveTo(20, y); x.lineTo(w - 20, y); x.stroke(); }
      x.fillStyle = '#2B2A33'; x.font = '700 32px ' + HAND; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      ['- one step instead', '  of twenty-five', '- vision at 18+', '  airport sites', '- two frozen', '  backbones'].forEach(function (s, i) { x.fillText(s, 26, 118 + i * 40); });
    });
    var pl = plane(1.08, 1.44, pageL, nbG, -0.56, 0.055, 0); pl.rotation.x = -Math.PI / 2; pl.rotation.y = 0.05;
    var pr = plane(1.08, 1.44, pageR, nbG, 0.56, 0.055, 0); pr.rotation.x = -Math.PI / 2; pr.rotation.y = -0.05;
    var pencil = group(1.3, 0.09, 0.1, nbG); pencil.rotation.y = 0.3;
    var pb = add(keep(new T.CylinderGeometry(0.045, 0.045, 1.2, 6)), M(0xF2B544), pencil, 0, 0, 0); pb.rotation.x = Math.PI / 2;
    var pt = add(keep(new T.ConeGeometry(0.045, 0.14, 6)), M(0xF1D2B0), pencil, 0, 0, 0.67); pt.rotation.x = Math.PI / 2;
    var lead = add(keep(new T.ConeGeometry(0.014, 0.04, 6)), M(0x2B2A33), pencil, 0, 0, 0.75, false); lead.rotation.x = Math.PI / 2;
    var fer = add(keep(new T.CylinderGeometry(0.048, 0.048, 0.08, 12)), M(0xC9CED8, { metalness: 0.8, roughness: 0.3, envMap: envTex }), pencil, 0, 0, -0.64); fer.rotation.x = Math.PI / 2;
    var eras = add(keep(new T.CylinderGeometry(0.046, 0.046, 0.08, 12)), M(0xF2A0A0, { roughness: 0.9 }), pencil, 0, 0, -0.72); eras.rotation.x = Math.PI / 2;
    hot(nbG, 'blog', 'Notebook · blog', { lift: 0.06 });

    // ---------- lamp and plant ----------
    var lampG = group(-6.6, 0, -2.6);
    var lampMat = M(0x3F6B3A, { roughness: 0.35, map: speckleTex, bumpMap: plasticBump, bumpScale: 0.4 });
    add(keep(new T.CylinderGeometry(0.55, 0.62, 0.18, 32)), lampMat, lampG, 0, 0.09, 0);
    add(keep(new T.TorusGeometry(0.56, 0.03, 10, 48)), M(0xD9A93A, { metalness: 0.9, roughness: 0.3, envMap: envTex }), lampG, 0, 0.18, 0).rotation.x = Math.PI / 2;
    var brass = M(0xD9A93A, { metalness: 0.9, roughness: 0.3, envMap: envTex });
    var j0 = new T.Vector3(0, 0.22, 0), j1 = new T.Vector3(0.12, 1.7, 0.2), j2 = new T.Vector3(0.72, 2.86, 0.42);
    add(keep(new T.CylinderGeometry(0.1, 0.12, 0.12, 20)), lampMat, lampG, 0, 0.24, 0);
    rod(j0, j1, 0.045, lampMat, lampG); rod(j1, j2, 0.04, lampMat, lampG);
    rod(new T.Vector3(0.06, 0.4, 0.06), new T.Vector3(0.16, 1.5, 0.24), 0.012, brass, lampG);
    [j1, j2].forEach(function (j) { add(keep(new T.SphereGeometry(0.075, 16, 12)), brass, lampG, j.x, j.y, j.z); });
    var cableL = new T.CatmullRomCurve3([new T.Vector3(-0.3, 0.1, -0.3), new T.Vector3(-0.7, 0.04, -0.5), new T.Vector3(-1.2, 0.05, -0.2), new T.Vector3(-1.8, 0.05, -0.6)]);
    add(keep(new T.TubeGeometry(cableL, 30, 0.025, 8)), M(0x2B2A33, { roughness: 0.6 }), lampG, 0, 0, 0);
    var shadeG = group(0.8, 3.0, 0.45, lampG);
    var shade = add(keep(new T.CylinderGeometry(0.28, 0.72, 0.75, 40, 1, true)), M(0x4F7F45, { roughness: 0.4, side: T.FrontSide, map: speckleTex, bumpMap: plasticBump, bumpScale: 0.4 }), shadeG, 0, 0, 0);
    var shadeIn = keep(new T.MeshStandardMaterial({ color: 0xFFF6E6, emissive: 0xFFC27A, emissiveIntensity: 0.05, roughness: 0.9, side: T.BackSide }));
    add(keep(new T.CylinderGeometry(0.275, 0.715, 0.74, 40, 1, true)), shadeIn, shadeG, 0, 0, 0, false);
    add(keep(new T.TorusGeometry(0.72, 0.022, 8, 48)), brass, shadeG, 0, -0.375, 0, false).rotation.x = Math.PI / 2;
    add(keep(new T.CylinderGeometry(0.29, 0.29, 0.06, 32)), M(0x4F7F45, { roughness: 0.4, map: speckleTex }), shadeG, 0, 0.39, 0);
    shadeG.rotation.z = 0.75; shadeG.rotation.x = 0.15;
    var bulbM = keep(new T.MeshStandardMaterial({ color: 0xFFF1D0, emissive: 0xFFC27A, emissiveIntensity: 0.2 }));
    add(keep(new T.SphereGeometry(0.2, 20, 16)), bulbM, shadeG, 0, -0.2, 0, false);
    var lampGlow = new T.Sprite(keep(new T.SpriteMaterial({ map: puffTex, color: 0xFFC98A, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
    lampGlow.scale.set(1.6, 1.6, 1); lampGlow.position.set(0, -0.3, 0); lampGlow.raycast = function () {}; shadeG.add(lampGlow);
    var lampHot = hot(lampG, null, 'Lamp · click to switch', { action: 'lamp', lift: 0 });
    var plantG = group(6.9, 0, -2.2);
    plantG.scale.setScalar(0.85);
    var potTex = makeTex(256, 256, function (x, w, h) {
      x.fillStyle = '#C9784D'; x.fillRect(0, 0, w, h);
      speckle(x, w, h, 300, ['rgba(120,60,30,0.35)', 'rgba(240,190,150,0.35)'], 0.6, 1.8, 141);
      grain(x, w, h, 0.1, 142);
      x.fillStyle = 'rgba(255,230,200,0.18)'; x.fillRect(0, 0, w, h * 0.12);
    });
    add(keep(new T.CylinderGeometry(0.55, 0.42, 0.9, 32)), keep(new T.MeshStandardMaterial({ map: potTex, bumpMap: plasticBump, bumpScale: 1.5, roughness: 0.95 })), plantG, 0, 0.45, 0);
    add(keep(new T.TorusGeometry(0.56, 0.05, 10, 40)), keep(new T.MeshStandardMaterial({ map: potTex, roughness: 0.95 })), plantG, 0, 0.88, 0).rotation.x = Math.PI / 2;
    var soilTex = makeTex(128, 128, function (x, w, h) { x.fillStyle = '#4A3326'; x.fillRect(0, 0, w, h); speckle(x, w, h, 260, ['#6B4C38', '#2E2019', '#8A6A50'], 0.8, 2.4, 143); });
    add(keep(new T.CircleGeometry(0.5, 32)), keep(new T.MeshStandardMaterial({ map: soilTex, bumpMap: plasticBump, bumpScale: 3, roughness: 1 })), plantG, 0, 0.84, 0, false).rotation.x = -Math.PI / 2;
    function leafDraw(base, vein) {
      return makeTex(256, 256, function (x, w, h) {
        x.fillStyle = base; x.fillRect(0, 0, w, h); grain(x, w, h, 0.08, 151);
        [0.25, 0.75].forEach(function (u) {
          x.strokeStyle = vein; x.lineWidth = 4; x.beginPath(); x.moveTo(u * w, 0); x.lineTo(u * w, h); x.stroke();
          x.lineWidth = 2;
          for (var k = 1; k < 8; k++) { var yy = k * h / 8; x.beginPath(); x.moveTo(u * w, yy); x.lineTo(u * w - 40, yy - 24); x.moveTo(u * w, yy); x.lineTo(u * w + 40, yy - 24); x.stroke(); }
        });
      });
    }
    var leafMats = [M(0xFFFFFF, { map: leafDraw('#5B8C4A', 'rgba(210,235,170,0.45)'), roughness: 0.55 }), M(0xFFFFFF, { map: leafDraw('#6FA05B', 'rgba(225,245,190,0.45)'), roughness: 0.55 })];
    add(keep(new T.CylinderGeometry(0.66, 0.58, 0.08, 40)), keep(new T.MeshStandardMaterial({ map: potTex, roughness: 0.95 })), plantG, 0, 0.04, 0);
    for (var li = 0; li < 13; li++) {
      var lf = add(keep(new T.SphereGeometry(0.5, 20, 12)), leafMats[li % 2], plantG, 0, 1.3, 0);
      var ang = li * 0.9 + (li % 3) * 0.2, lh = 0.8 + ((li * 37) % 5) * 0.12;
      lf.scale.set(0.3 + (li % 2) * 0.06, lh, 0.1);
      lf.position.set(Math.cos(ang) * (0.2 + (li % 3) * 0.1), 0.9 + lh * 0.45, Math.sin(ang) * (0.2 + (li % 3) * 0.1));
      lf.rotation.set(Math.sin(ang) * 0.5, -ang, Math.cos(ang) * 0.5);
    }

    // dust in the light
    var DN = 140, dpos = new Float32Array(DN * 3);
    for (var di = 0; di < DN; di++) { dpos[di * 3] = (Math.random() - 0.5) * 14; dpos[di * 3 + 1] = Math.random() * 6; dpos[di * 3 + 2] = (Math.random() - 0.5) * 7; }
    var dg = keep(new T.BufferGeometry()); dg.setAttribute('position', new T.BufferAttribute(dpos, 3));
    var dust = new T.Points(dg, keep(new T.PointsMaterial({ color: 0xFFF1D6, size: 0.035, transparent: true, opacity: 0.7, depthWrite: false })));
    scene.add(dust);

    // ---------- soft contact shadows ----------
    var blobTex = makeTex(128, 128, function (x, w, h) { var g = x.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(60,30,20,0.55)'); g.addColorStop(0.6, 'rgba(60,30,20,0.25)'); g.addColorStop(1, 'rgba(60,30,20,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    [[0, -0.7, 6.0, 4.2, 0.55], [-4.0, -0.9, 2.9, 2.1, 0.6], [-3.35, 2.3, 1.7, 1.7, 0.7], [4.15, -1.0, 2.0, 1.6, 0.5], [1.7, 2.4, 3.0, 2.1, 0.35],
     [6.9, -2.2, 1.4, 1.4, 0.6], [-6.6, -2.6, 1.6, 1.6, 0.6], [5.15, -1.9, 0.9, 0.9, 0.4], [3.45, 1.2, 2.5, 2.0, 0.3]].forEach(function (b) {
      var bm = new T.Mesh(keep(new T.PlaneGeometry(b[2], b[3])), keep(new T.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: b[4], depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })));
      bm.rotation.x = -Math.PI / 2; bm.position.set(b[0], 0.012, b[1]); bm.raycast = function () {}; scene.add(bm);
    });

    // ---------- screen content ----------
    var scr = { mode: 'boot', t0: 0, msg: [], buf: '', hoverTile: -1, tiles: [] };
    var TILE_DEFS = [['Research', 'research', '3 papers'], ['Awards', 'awards', '2 awards'], ['Experience', 'experience', '5 roles'], ['Projects', 'projects', '6 projects'], ['Blog', 'blog', '3 posts'], ['Contact', 'contact', 'say hi']];
    for (var tI = 0; tI < 6; tI++) scr.tiles.push({ x: 112 + (tI % 3) * 280, y: 140 + Math.floor(tI / 3) * 195, w: 250, h: 175, label: TILE_DEFS[tI][0], view: TILE_DEFS[tI][1], sub: TILE_DEFS[tI][2] });
    scr.tiles.push({ x: 32, y: 552, w: 280, h: 56, label: '[esc] back to desk', view: 'overview', back: true });
    var diffTarget = null, diffNoise = null, GX = 96, GY = 60;
    function buildDiffTarget() {
      var c = document.createElement('canvas'); c.width = GX; c.height = GY;
      var x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, GX, GY);
      var txt = scr.diffText || 'Portfolio', fs = 34;
      x.font = '700 ' + fs + 'px ' + ROUND;
      while (fs > 10 && x.measureText(txt).width > GX - 8) { fs -= 1; x.font = '700 ' + fs + 'px ' + ROUND; }
      x.fillStyle = '#fff'; center(x, txt, GX / 2, GY / 2 + 2);
      var d = x.getImageData(0, 0, GX, GY).data;
      diffTarget = new Float32Array(GX * GY); diffNoise = new Float32Array(GX * GY);
      for (var i = 0; i < GX * GY; i++) { diffTarget[i] = d[i * 4] / 255; diffNoise[i] = Math.random(); }
    }
    // "Port" in a clean sans, "folio" as chunky pixels with a script f
    var pixCache = null;
    function pixelWord() {
      var sm = document.createElement('canvas'); sm.width = 90; sm.height = 40;
      var c = sm.getContext('2d');
      c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
      c.font = 'italic 700 34px Georgia, "Times New Roman", serif'; c.fillText('f', 2, 30);
      c.font = '700 24px "IBM Plex Sans", Arial, sans-serif'; c.fillText('olio', 17, 30);
      var d = c.getImageData(0, 0, 90, 40);
      for (var i = 0; i < d.data.length; i += 4) { var on = d.data[i + 3] > 110; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = on ? 255 : 0; }
      c.putImageData(d, 0, 0);
      return sm;
    }
    function drawWordmark(x, cx, cy) {
      if (!pixCache) pixCache = pixelWord();
      var S = 7;
      x.font = '600 150px "IBM Plex Sans", Arial, sans-serif';
      var pw = x.measureText('Port').width, fw = 62 * S;
      var left = cx - (pw + fw) / 2;
      x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = '#F2F8EE';
      x.fillText('Port', left, cy + 50);
      x.imageSmoothingEnabled = false;
      x.drawImage(pixCache, left + pw - 2, cy + 50 - 30 * S, 90 * S, 40 * S);
      x.imageSmoothingEnabled = true;
    }
    function say(lines, hold) { scr.mode = 'msg'; scr.msg = lines; scr.t0 = clock; scr.hold = hold || 4; }
    function drawScreen() {
      var x = sCtx, t = clock;
      x.fillStyle = '#233029'; x.fillRect(0, 0, SW, SH);
      var gr = x.createRadialGradient(SW / 2, SH / 2, 40, SW / 2, SH / 2, SW * 0.62);
      gr.addColorStop(0, 'rgba(120,170,140,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, SW, SH);
      x.shadowColor = 'rgba(200,255,210,0.55)'; x.shadowBlur = 14;
      x.fillStyle = '#E6F5E3';
      var d = new Date(), hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
      x.font = '400 22px ' + PX; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.fillText('portfolio.os', 32, 44); x.textAlign = 'right'; x.fillText(hh + ':' + mm, SW - 32, 44);
      x.fillStyle = 'rgba(230,245,227,0.25)'; x.fillRect(32, 60, SW - 64, 2);
      x.fillStyle = '#E6F5E3';
      var blink = Math.floor(t * 2) % 2 === 0;
      if (scr.mode === 'boot' || scr.mode === 'home') {
        drawWordmark(x, SW / 2, SH / 2 + 10);
        x.font = '400 24px ' + PX; x.fillStyle = '#B9D8C0'; x.textAlign = 'center'; x.textBaseline = 'middle';
        if (blink) x.fillText('> click the mouse to look inside_', SW / 2, SH - 64);
      } else if (scr.mode === 'menu') {
        x.font = '400 28px ' + PX; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
        x.fillText('> pick a folder' + (blink ? '_' : ''), 112, 116);
        scr.tiles.forEach(function (tl, i) {
          var on = i === scr.hoverTile;
          x.shadowBlur = on ? 24 : 10;
          if (tl.back) {
            x.fillStyle = on ? '#E6F5E3' : 'rgba(230,245,227,0.06)'; x.fillRect(tl.x, tl.y, tl.w, tl.h);
            x.strokeStyle = '#E6F5E3'; x.lineWidth = 3; x.strokeRect(tl.x + 1.5, tl.y + 1.5, tl.w - 3, tl.h - 3);
            x.fillStyle = on ? '#233029' : '#E6F5E3'; x.font = '400 20px ' + PX; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillText(tl.label, tl.x + tl.w / 2, tl.y + tl.h / 2 + 1);
            x.textBaseline = 'alphabetic';
            return;
          }
          x.fillStyle = on ? 'rgba(230,245,227,0.18)' : 'rgba(230,245,227,0.05)';
          x.fillRect(tl.x, tl.y, tl.w, tl.h);
          x.strokeStyle = on ? '#E6F5E3' : 'rgba(230,245,227,0.45)'; x.lineWidth = 3;
          x.strokeRect(tl.x + 1.5, tl.y + 1.5, tl.w - 3, tl.h - 3);
          var fx = tl.x + 24, fy = tl.y + 24 + (on ? -6 : 0);
          x.fillStyle = '#E6F5E3';
          x.fillRect(fx, fy, 38, 14); x.fillRect(fx, fy + 10, 86, 56);
          x.shadowBlur = 0; x.fillStyle = '#233029'; x.fillRect(fx + 8, fy + 24, 70, 3); x.fillRect(fx + 8, fy + 34, 48, 3);
          x.shadowBlur = on ? 24 : 10; x.fillStyle = '#E6F5E3';
          x.font = '700 32px ' + ROUND; x.textAlign = 'left'; x.fillText(tl.label, tl.x + 24, tl.y + 130);
          x.font = '400 16px ' + PX; x.fillStyle = '#B9D8C0'; x.fillText(tl.sub, tl.x + 24, tl.y + 156);
          if (on) { x.fillStyle = '#E6F5E3'; x.font = '700 34px ' + ROUND; x.textAlign = 'right'; x.fillText('→', tl.x + tl.w - 22, tl.y + 130); }
        });
        x.shadowBlur = 10; x.fillStyle = '#B9D8C0'; x.font = '400 18px ' + PX; x.textAlign = 'right'; x.textBaseline = 'middle';
        x.fillText('click a folder to open it', SW - 112, 580);
      } else if (scr.mode === 'diff') {
        if (!diffTarget) buildDiffTarget();
        var k = Math.min(1, (t - scr.t0) / 3.2);
        var cw = SW / GX, ch = (SH - 150) / GY, oy = 80;
        x.shadowBlur = 0;
        for (var j = 0; j < GY; j++) for (var i2 = 0; i2 < GX; i2++) {
          var idx = j * GX + i2;
          var kk = Math.max(0, Math.min(1, k * 1.25 - diffNoise[idx] * 0.25));
          var n = Math.abs(Math.sin(diffNoise[idx] * 97 + t * 9));
          var val = n * (1 - kk) + diffTarget[idx] * kk;
          var g = Math.round(35 + val * 195);
          x.fillStyle = 'rgb(' + Math.round(g * 0.93) + ',' + g + ',' + Math.round(g * 0.92) + ')';
          x.fillRect(i2 * cw, oy + j * ch, cw - 1, ch - 1);
        }
        x.shadowBlur = 10; x.fillStyle = '#E6F5E3'; x.font = '400 24px ' + PX; x.textAlign = 'left';
        if (k < 1) {
          var step = Math.max(1, Math.round(25 * (1 - k)));
          x.fillText('denoising "' + scr.diffText + '"... step ' + step + ' / 25', 32, SH - 34);
          x.textAlign = 'right'; x.fillText('noise ' + (1 - k).toFixed(2), SW - 32, SH - 34);
        } else {
          x.textAlign = 'center'; x.fillText(scr.diffCap || 'done: 1 clean sample', SW / 2, SH - 34);
        }
        if (t - scr.t0 > (scr.diffCap ? 9 : 6.5)) scr.mode = inScreen ? 'menu' : 'home';
      } else if (scr.mode === 'msg') {
        x.textAlign = 'center'; x.textBaseline = 'middle';
        scr.msg.forEach(function (ln, i) {
          x.font = i === 0 ? '700 84px ' + ROUND : '400 30px ' + PX;
          x.fillText(ln, SW / 2, SH / 2 - (scr.msg.length - 1) * 38 + i * 84 - (i ? 20 : 0));
        });
        if (t - scr.t0 > scr.hold) scr.mode = inScreen ? 'menu' : 'home';
      }
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(0,0,0,0.13)';
      for (var y = 0; y < SH; y += 4) x.fillRect(0, y, SW, 2);
      var vg = x.createRadialGradient(SW / 2, SH / 2, SW * 0.3, SW / 2, SH / 2, SW * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = vg; x.fillRect(0, 0, SW, SH);
      sTex.needsUpdate = true;
    }

    // ---------- views ----------
    var VIEWS = {
      overview: { p: [0, 4.6, 9.4], t: [0, 1.7, 0.2] },
      mouse: { c: [3.45, 0.2, 1.2], d: [0.3, 1.2, 1.7], noShift: true },
      mug: { c: [-3.35, 0.7, 2.3], d: [0.6, 1.0, 2.2], noShift: true },
      lampv: { c: [-5.8, 2.2, -2.2], d: [1.5, 0.8, 3.2], noShift: true },
      plantv: { c: [6.6, 1.2, -2.2], d: [-1.2, 0.8, 3.0], noShift: true },
      posterv: { c: [-4.9, 3.0, -3.2], d: [0.6, 0.1, 3.6], noShift: true },
      camv: { c: [5.1, 1.0, -1.9], d: [-0.6, 0.5, 2.4], noShift: true },
      edge: { c: [4.15, 0.4, -1.0], d: [0, 1.5, 2.0], noShift: true },
      strip: { c: [-1.3, 1.0, 0.2], d: [0, 1.5, 2.3], noShift: true },
      screen: { p: [0, 2.68, 3.4], t: [0, 2.65, -0.14], noShift: true },
      research: { c: [-4.3, 1.5, -1.5], d: [1.9, 1.3, 5.4] },
      awards: { c: [-4.05, 1.65, -0.95], d: [1.4, 1.1, 4.3] },
      about: { c: [-3.35, 0.9, 2.3], d: [1.2, 1.3, 3.0] },
      experience: { c: [4.4, 0.6, -1.3], d: [-0.8, 1.7, 3.8] },
      projects: { c: [4.9, 3.35, -3.3], d: [-0.3, 0.05, 6.6] },
      blog: { c: [1.7, 0.1, 2.4], d: [0.2, 3.1, 2.3] },
      contact: { c: [-2.05, 3.78, -0.12], d: [0.4, 0.05, 2.9] }
    };
    var view = 'overview', inScreen = false;
    var camPos = new T.Vector3(0, 6.5, 15), camTgt = new T.Vector3(0, 2.2, 0);
    var goalPos = new T.Vector3(), goalTgt = new T.Vector3();
    function computeGoal() {
      var V = VIEWS[view] || VIEWS.overview;
      if (V.p) { goalPos.fromArray(V.p); goalTgt.fromArray(V.t); }
      else { goalTgt.fromArray(V.c); goalPos.fromArray(V.c).add(new T.Vector3().fromArray(V.d)); }
      var fit = Math.max(1, Math.pow(1.45 / cam.aspect, 0.6));
      scene.fog.near = 16 * fit; scene.fog.far = 34 * fit;
      if (fit > 1) goalPos.sub(goalTgt).multiplyScalar(fit).add(goalTgt);
      if (!V.noShift && cam.aspect <= 1.2 && view !== 'overview') {
        // portrait: the panel is a bottom sheet, so lift the object into the top of the screen
        var dist2 = goalPos.distanceTo(goalTgt), k = 0.3 * dist2 * Math.tan(T.MathUtils.degToRad(cam.fov / 2));
        goalPos.y -= k; goalTgt.y -= k;
      }
      if (!V.noShift && cam.aspect > 1.2) {
        if (view !== 'overview') {
          var dir = new T.Vector3().subVectors(goalTgt, goalPos);
          var dist = dir.length();
          var right = new T.Vector3().crossVectors(dir, new T.Vector3(0, 1, 0)).normalize();
          var halfW = dist * Math.tan(T.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
          var s = panelShift * halfW;
          goalPos.addScaledVector(right, s); goalTgt.addScaledVector(right, s);
        }
      }
    }
    var panelShift = 0.42;
    function setView(v) {
      if (!VIEWS[v]) v = 'overview';
      if (v === view) return;
      view = v; inScreen = v === 'screen';
      if (opts.tip) opts.tip.style.opacity = '0';
      if (inScreen) { if (scr.mode !== 'diff' && scr.mode !== 'msg') scr.mode = 'menu'; }
      else if (scr.mode === 'menu') scr.mode = 'home';
      computeGoal();
    }

    // ---------- night ----------
    var night = false, nightK = 0, lampOn = false, lampK = 0;
    function setNight(n) { night = !!n; lampOn = night; if (opts.onNight) opts.onNight(night); }
    function toggleNight() { setNight(!night); }

    // ---------- actions ----------
    var YEAR_CAP = '2026: 2 paper awards · 4 papers accepted';
    function startDiff(text, cap) { scr.diffText = text; scr.diffCap = cap || ''; scr.mode = 'diff'; scr.t0 = clock; buildDiffTarget(); }
    function act(a) {
      if (a === 'night') return toggleNight();
      if (a === 'lamp') { lampOn = !lampOn; return; }
      if (a === 'esc') return select('overview');
      if (a === 'up') return select('screen');
      if (a === 'ctrl') return select('contact');
      if (a === 'cv') { say(['computer vision', 'counting · segmentation · faces'], 2.5); return select('research'); }
      if (a === 'run') { var typed = scr.buf; scr.buf = ''; return startDiff(typed || 'Portfolio', typed === '2026' ? YEAR_CAP : ''); }
      if (a === 'hello') return say(['hi there!', "I'm Muhammad Ridha Agam", 'click around the desk'], 5);
      if (a === 'help') return say(['help', 'click things on the desk', 'type 2026, or press run.'], 5);
      if (a && a.charAt(0) === 'd') {
        scr.buf = (scr.buf + a.charAt(1)).slice(-4);
        if (scr.buf === '2026') { scr.buf = ''; return startDiff('2026', YEAR_CAP); }
        return say(['> ' + scr.buf + '_', 'type 2026, or press run.'], 3);
      }
    }
    function select(v) { if (opts.onSelect) opts.onSelect(v); else setView(v); }

    // ---------- input ----------
    var ray = new T.Raycaster(), ndc = new T.Vector2(), pointer = { x: 0, y: 0, inside: false }, hovered = null, down = null;
    function setNdc(e) {
      var r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      pointer.x = ndc.x; pointer.y = ndc.y;
      return r;
    }
    function hitTest() {
      ray.setFromCamera(ndc, cam);
      var hs = ray.intersectObjects(pick, false);
      return hs.length ? hs[0] : null;
    }
    function screenTile(hit) {
      if (!hit || !hit.object.userData.isScreen || !hit.uv) return -1;
      var px = hit.uv.x * SW, py = (1 - hit.uv.y) * SH;
      for (var i = 0; i < scr.tiles.length; i++) { var tl = scr.tiles[i]; if (px >= tl.x && px <= tl.x + tl.w && py >= tl.y && py <= tl.y + tl.h) return i; }
      return -1;
    }
    function onMove(e) {
      if (e.pointerType === 'touch') return;
      var r = setNdc(e); pointer.inside = true;
      var hit = hitTest();
      var h = hit ? hit.object.userData.hot : null;
      var tile = -1;
      if (inScreen) { tile = screenTile(hit); scr.hoverTile = tile; if (h && h.view === 'screen') h = null; }
      if (inScreen && h && !h.action) h = null;
      hovered = h;
      wrap.style.cursor = (h || tile >= 0) ? 'pointer' : '';
      if (opts.tip) {
        var label = tile >= 0 ? (scr.tiles[tile].back ? 'Back to the desk' : 'Open ' + scr.tiles[tile].label) : (h ? h.label : '');
        if (label) {
          opts.tip.textContent = label;
          opts.tip.style.opacity = '1';
          opts.tip.style.transform = 'translate(' + (e.clientX - r.left + 16) / (r.width / wrap.clientWidth) + 'px,' + (e.clientY - r.top + 18) / (r.height / wrap.clientHeight) + 'px)';
        } else opts.tip.style.opacity = '0';
      }
    }
    function onDown(e) { down = { x: e.clientX, y: e.clientY }; }
    function onUp(e) {
      if (!down) return;
      var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 6; down = null;
      if (moved) return;
      setNdc(e);
      var hit = hitTest();
      if (inScreen) {
        var tile = screenTile(hit);
        if (tile >= 0) return select(scr.tiles[tile].view);
      }
      var h = hit ? hit.object.userData.hot : null;
      if (!h) return;
      if (h.press != null) h.press = 1;
      if (h === mouseHot) mouseClick = 1;
      if (h.action) return act(h.action);
      if (h.view) select(h.view);
    }
    function onLeave() { pointer.inside = false; hovered = null; if (opts.tip) opts.tip.style.opacity = '0'; }
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
    canvas.addEventListener('webglcontextrestored', function () { location.reload(); });
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);

    // ---------- sizing / visibility ----------
    function resize() {
      var w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); computeGoal();
    }
    var ro = new ResizeObserver(resize); ro.observe(wrap); resize();
    var visible = true, io = null;
    if (window.IntersectionObserver) { io = new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }); io.observe(wrap); }

    // fonts: redraw text textures once they load
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load('700 40px "Caveat"'), document.fonts.load('700 40px "Fredoka"'), document.fonts.load('400 20px "Silkscreen"'), document.fonts.load('600 40px "IBM Plex Sans"')])
        .then(function () { texList.forEach(function (it) { if (it.text) it.redraw(); }); diffTarget = null; pixCache = null; }, function () {});
    }

    // ---------- loop ----------
    var clock = 0, last = performance.now(), raf = 0, lastScreen = -1, readySent = false;
    var sway = new T.Vector3(), tmpC = new T.Color();
    computeGoal();
    function frame() {
      raf = requestAnimationFrame(frame);
      var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      var reduce = opts.motion === false || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      clock += dt;
      var k = 1 - Math.exp(-dt * (reduce ? 20 : 3.2));
      camPos.lerp(goalPos, k); camTgt.lerp(goalTgt, k);
      if (view === 'overview' && pointer.inside && !reduce) sway.lerp(new T.Vector3(pointer.x * 0.5, pointer.y * 0.25, 0), 1 - Math.exp(-dt * 3));
      else sway.lerp(new T.Vector3(), 1 - Math.exp(-dt * 3));
      cam.position.copy(camPos).add(sway);
      cam.lookAt(camTgt);

      hots.forEach(function (h) {
        h.h += ((h === hovered ? 1 : 0) - h.h) * (1 - Math.exp(-dt * 12));
        if (h.press != null) {
          h.press = Math.max(0, h.press - dt * 5);
          h.g.position.y = h.baseY - (h.baseY === 1.0 ? 0.05 : 0.1) * Math.sin(Math.min(1, h.press) * Math.PI / 2) - h.h * (h.baseY === 1.0 ? 0.015 : 0.03);
        } else if (h.lift) {
          h.g.position.y = h.base.y + h.h * h.lift;
        }
      });
      knob.position.x = -0.24 + 0.48 * nightK;
      sunP.material.opacity = 1 - nightK; moonP.material.opacity = nightK;
      if (mouseLeftBtn) { mouseClick = Math.max(0, mouseClick - dt * 4); mouseLeftBtn.position.y = -0.03 * Math.sin(Math.min(1, mouseClick) * Math.PI); }

      nightK += ((night ? 1 : 0) - nightK) * (1 - Math.exp(-dt * 3));
      lampK += ((lampOn ? 1 : 0) - lampK) * (1 - Math.exp(-dt * 6));
      tmpC.copy(DAY_BG).lerp(NIGHT_BG, nightK);
      scene.background.copy(tmpC); scene.fog.color.copy(tmpC);
      wall.material.color.set(0xEFC6A8).lerp(new T.Color(0x3A2F4A), nightK);
      hemi.intensity = 1.25 - nightK * 0.95;
      sun.intensity = 2.3 - nightK * 2.0;
      sun.color.set(0xFFE3C6).lerp(new T.Color(0x9DB2FF), nightK);
      lampLight.intensity = lampK * 26;
      lampLight.position.set(-5.5, 2.5, -2.0);
      bulbM.emissiveIntensity = 0.2 + lampK * 3;
      shadeIn.emissiveIntensity = 0.05 + lampK * 0.9;
      lampGlow.material.opacity = lampK * 0.85;
      screenLight.intensity = 0.6 + nightK * 3.5;
      renderer.toneMappingExposure = 1.08 + nightK * 0.1;

      led.material.emissiveIntensity = Math.sin(clock * 5) > 0 ? 3 : 0.4;
      rec.material.emissiveIntensity = Math.sin(clock * 2) > 0 ? 3 : 0.3;
      camHead.rotation.y = -0.6 + (reduce ? 0 : Math.sin(clock * 0.5) * 0.25);
      steam.forEach(function (s, i) {
        var u = reduce ? 0 : (clock * 0.35 + i / 3) % 1;
        s.position.set(Math.sin(u * 6 + i) * 0.08, 1.4 + u * 1.1, 0);
        s.scale.setScalar(0.35 + u * 0.6);
        s.material.opacity = reduce ? 0 : Math.sin(u * Math.PI) * 0.35;
      });
      if (!reduce) { var dp = dust.geometry.attributes.position; for (var i = 0; i < DN; i++) { var y = dp.array[i * 3 + 1] + dt * 0.08; dp.array[i * 3 + 1] = y > 6 ? 0 : y; } dp.needsUpdate = true; }
      dust.material.opacity = 0.7 - nightK * 0.4;

      hint.material.opacity += (((view === 'overview') ? 1 : 0) - hint.material.opacity) * (1 - Math.exp(-dt * 6));
      hint.position.y = 0.9 + (reduce ? 0 : Math.sin(clock * 3) * 0.05);
      if (scr.mode === 'boot' && clock > 1.2) scr.mode = inScreen ? 'menu' : 'home';
      var rate = scr.mode === 'diff' ? 1 / 24 : 1 / 8;
      if (clock - lastScreen > rate) { lastScreen = clock; drawScreen(); }

      renderer.render(scene, cam);
      if (!readySent) { readySent = true; if (opts.onReady) opts.onReady(); }
    }
    frame();

    return {
      setView: setView,
      setNight: setNight,
      toggleNight: toggleNight,
      setMotion: function (m) { opts.motion = m; },
      press: act,
      tilePoint: function (i) {
        var tl = scr.tiles[i]; if (!tl) return null;
        var u = (tl.x + tl.w / 2) / SW, v = (tl.y + tl.h / 2) / SH;
        var p = screenMesh.localToWorld(new T.Vector3((u - 0.5) * 3.84, (0.5 - v) * 2.4, 0)).project(cam);
        var r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height };
      },
      dispose: function () {
        cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect();
        canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointerleave', onLeave);
        disposables.forEach(function (d) { if (d && d.dispose) d.dispose(); });
        scene.traverse(function (o) { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
        renderer.dispose();
      }
    };
  }
  window.DeskScene = { create: create };
})();
