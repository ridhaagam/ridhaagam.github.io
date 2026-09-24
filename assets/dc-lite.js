/* dc-lite: runs a Design Component page (renderVals + markup bindings) as a plain web page. */
(function () {
  'use strict';
  function get(scope, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, scope);
  }
  function interp(str, scope) {
    return str.replace(/\{\{\s*([\w.$]+)\s*\}\}/g, function (_, p) { var v = get(scope, p); return v == null ? '' : String(v); });
  }

  var pending = false, renderFn = null;
  function schedule() {
    if (pending || !renderFn) return;
    pending = true;
    Promise.resolve().then(function () { pending = false; renderFn(); });
  }

  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); schedule(); }
    forceUpdate() { schedule(); }
  }
  window.DCLogic = DCLogic;

  function bind(root, scope, skipClones) {
    var els = root.querySelectorAll('[data-if],[data-text],[data-on-click],[data-ref],[data-t]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (skipClones && el.closest('[data-clone]')) continue;
      if (el.hasAttribute('data-if')) el.hidden = !get(scope, el.getAttribute('data-if'));
      if (el.hasAttribute('data-text')) { var v = get(scope, el.getAttribute('data-text')); el.textContent = v == null ? '' : String(v); }
      if (el.hasAttribute('data-on-click')) {
        (function (el, path) { el.onclick = function (e) { var f = get(scope, path); if (typeof f === 'function') f(e); }; })(el, el.getAttribute('data-on-click'));
      }
      if (el.hasAttribute('data-ref') && !el.__refd) {
        var r = get(scope, el.getAttribute('data-ref'));
        if (typeof r === 'function') { el.__refd = true; r(el); }
      }
      if (el.hasAttribute('data-t')) {
        var spec = JSON.parse(el.getAttribute('data-t'));
        for (var name in spec) {
          var val = interp(spec[name], scope);
          if (name === 'class') el.className = val; else el.setAttribute(name, val);
        }
      }
    }
  }

  function mount(root, Comp, props) {
    var comp = new Comp(props);
    var fors = Array.prototype.slice.call(root.querySelectorAll('template[data-for]'));
    var mounted = false;
    renderFn = function () {
      var vals = comp.renderVals();
      bind(root, vals, true);
      fors.forEach(function (t) {
        var n = t.nextSibling;
        while (n && n.__clone) { var nx = n.nextSibling; n.parentNode.removeChild(n); n = nx; }
        var list = get(vals, t.getAttribute('data-for')) || [], as = t.getAttribute('data-as') || 'item';
        var after = t;
        list.forEach(function (item, idx) {
          var frag = t.content.cloneNode(true);
          var scope = Object.create(vals); scope[as] = item; scope.$index = idx;
          var nodes = Array.prototype.slice.call(frag.childNodes);
          nodes.forEach(function (nd) { nd.__clone = true; if (nd.nodeType === 1) nd.setAttribute('data-clone', ''); });
          var wrap = document.createElement('div'); wrap.appendChild(frag);
          bind(wrap, scope, false);
          nodes.forEach(function (nd) { after.parentNode.insertBefore(nd, after.nextSibling); after = nd; });
        });
      });
      if (!mounted) { mounted = true; if (comp.componentDidMount) comp.componentDidMount(); }
    };
    renderFn();
    window.addEventListener('pagehide', function () { if (comp.componentWillUnmount) comp.componentWillUnmount(); });
    return comp;
  }
  window.DCLite = { mount: mount };
})();
